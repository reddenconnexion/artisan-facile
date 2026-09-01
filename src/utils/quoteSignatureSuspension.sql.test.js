// Tests des verrous de signature CÔTÉ SERVEUR (PGlite = vrai PostgreSQL).
//
// L'artisan doit pouvoir fermer la porte d'un devis ou d'un avenant déjà envoyé,
// et cette fermeture doit tenir même si le client a gardé sa page ouverte : le
// front peut masquer le bouton, seul le serveur empêche réellement la signature.
//
// Invariants vérifiés :
//   1. un devis envoyé, lien valide, se signe toujours (pas de régression) ;
//   2. les statuts de fermeture bloquent la signature — dont `refused`, la
//      valeur réellement écrite par le formulaire, que l'ancienne version
//      laissait passer parce qu'elle ne testait que `rejected` ;
//   3. un lien suspendu (token_revoked) bloque la signature sans toucher au
//      statut du devis, et la rouvrir suffit à la rétablir ;
//   4. `select_quote_options` refuse de réécrire lignes et totaux d'un document
//      fermé ou suspendu — sans quoi le client pouvait encore changer le
//      contenu d'un devis annulé.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const ROOT = cwd();
const MIG = path.join(
  ROOT,
  'supabase/migrations/20260901120000_suspend_quote_signature.sql'
);

let db;

const ID = 512;
const TOKEN = '9f1c3f4e-6f0a-4a26-9a5e-0f1b2c3d4e5f';
const PORTAL_TOKEN = '1a2b3c4d-5e6f-4071-8899-aabbccddeeff';
const CLIENT_ID = 77;
// Une signature valide : préfixe data:image/ et plus de 100 caractères.
const SIGNATURE = `data:image/png;base64,${'A'.repeat(120)}`;

beforeAll(async () => {
  db = await PGlite.create();
  // Colonnes et TYPES de production : `id` bigint, jetons uuid. Une fixture qui
  // s'en écarte teste autre chose que ce qui part en base.
  await db.exec(`
    CREATE TABLE clients (
      id           BIGINT PRIMARY KEY,
      email        TEXT,
      portal_token UUID
    );
    CREATE TABLE quotes (
      id                BIGINT PRIMARY KEY,
      user_id           UUID,
      client_id         BIGINT,
      public_token      UUID,
      token_revoked     BOOLEAN DEFAULT FALSE,
      token_expires_at  TIMESTAMPTZ,
      status            TEXT,
      type              TEXT DEFAULT 'quote',
      require_otp       BOOLEAN DEFAULT FALSE,
      signature         TEXT,
      signed_at         TIMESTAMPTZ,
      updated_at        TIMESTAMPTZ,
      is_external       BOOLEAN,
      include_tva       BOOLEAN,
      items             JSONB,
      total_ht          NUMERIC,
      total_tva         NUMERIC,
      total_ttc         NUMERIC
    );
    CREATE TABLE quote_otps (
      id         BIGSERIAL PRIMARY KEY,
      quote_id   BIGINT,
      otp_hash   TEXT,
      used_at    TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE anon;
      CREATE ROLE authenticated;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  // La migration telle qu'elle part en production, GRANT compris.
  await db.exec(readFileSync(MIG, 'utf8'));
});

afterAll(async () => {
  await db?.close();
});

const baseItems = () => [
  { id: 'a', type: 'service', quantity: 1, price: 100 },
  { id: 'opt1', type: 'material', quantity: 1, price: 50, is_optional: true },
];

const insertQuote = async ({ status = 'sent', revoked = false, type = 'quote' } = {}) => {
  await db.query(
    `INSERT INTO quotes
       (id, client_id, public_token, token_revoked, status, type, is_external, include_tva,
        items, total_ht, total_tva, total_ttc)
     VALUES ($1, $2, $3, $4, $5, $6, false, false, $7::jsonb, 100, 0, 100)`,
    [ID, CLIENT_ID, TOKEN, revoked, status, type, JSON.stringify(baseItems())]
  );
};

const sign = async () => {
  const { rows } = await db.query('SELECT sign_public_quote($1, $2) AS res', [TOKEN, SIGNATURE]);
  return rows[0].res;
};

const getQuote = async () => (await db.query('SELECT * FROM quotes WHERE id = $1', [ID])).rows[0];

beforeEach(async () => {
  await db.query('DELETE FROM quotes');
  await db.query('DELETE FROM clients');
  await db.query('DELETE FROM quote_otps');
  await db.query('INSERT INTO clients (id, email, portal_token) VALUES ($1, $2, $3)', [
    CLIENT_ID,
    'client@example.com',
    PORTAL_TOKEN,
  ]);
});

describe('sign_public_quote — statuts de fermeture', () => {
  it('laisse signer un devis envoyé au lien valide', async () => {
    await insertQuote({ status: 'sent' });
    const res = await sign();
    expect(res.success).toBe(true);
    const q = await getQuote();
    expect(q.status).toBe('accepted');
    expect(q.signature).toBe(SIGNATURE);
  });

  // Le trou historique : le formulaire écrit `refused`, l'ancienne fonction ne
  // testait que `rejected`. Un devis « Refusé » restait donc signable.
  it.each(['cancelled', 'refused', 'rejected', 'postponed', 'billed', 'paid'])(
    'refuse la signature d’un devis au statut %s',
    async (status) => {
      await insertQuote({ status });
      const res = await sign();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/\S/);
      const q = await getQuote();
      expect(q.signature).toBeNull();
      expect(q.signed_at).toBeNull();
      expect(q.status).toBe(status); // le refus ne change rien au dossier
    }
  );

  it('vaut aussi pour un avenant', async () => {
    await insertQuote({ status: 'cancelled', type: 'amendment' });
    const res = await sign();
    expect(res.success).toBe(false);
    expect((await getQuote()).signature).toBeNull();
  });

  it('explique au client ce qui s’est passé, sans jargon de statut', async () => {
    await insertQuote({ status: 'cancelled' });
    const res = await sign();
    expect(res.error).toContain('annulé');
    expect(res.error).not.toContain('cancelled');
  });
});

describe('sign_public_quote — lien suspendu', () => {
  it('refuse la signature quand le lien est suspendu', async () => {
    await insertQuote({ status: 'sent', revoked: true });
    const res = await sign();
    expect(res.success).toBe(false);
    expect(res.error).toContain('suspendue');
    expect((await getQuote()).signature).toBeNull();
  });

  it('rétablit la signature dès la réactivation du lien', async () => {
    await insertQuote({ status: 'sent', revoked: true });
    expect((await sign()).success).toBe(false);

    await db.query('UPDATE quotes SET token_revoked = FALSE WHERE id = $1', [ID]);
    expect((await sign()).success).toBe(true);
    expect((await getQuote()).status).toBe('accepted');
  });

  it('laisse le statut du devis intact pendant la suspension', async () => {
    await insertQuote({ status: 'sent', revoked: true });
    await sign();
    expect((await getQuote()).status).toBe('sent');
  });
});

describe('sign_quote_via_portal', () => {
  const signViaPortal = async () => {
    const { rows } = await db.query('SELECT sign_quote_via_portal($1, $2, $3) AS res', [
      PORTAL_TOKEN,
      ID,
      SIGNATURE,
    ]);
    return rows[0].res;
  };

  it('applique les mêmes statuts de fermeture', async () => {
    await insertQuote({ status: 'refused' });
    const res = await signViaPortal();
    expect(res.success).toBe(false);
    expect((await getQuote()).signature).toBeNull();
  });

  it('refuse un devis dont le lien est suspendu', async () => {
    await insertQuote({ status: 'sent', revoked: true });
    const res = await signViaPortal();
    expect(res.success).toBe(false);
    expect(res.error).toContain('suspendue');
  });

  it('signe un devis ouvert', async () => {
    await insertQuote({ status: 'sent' });
    const res = await signViaPortal();
    expect(res.success).toBe(true);
    expect((await getQuote()).status).toBe('accepted');
  });
});

describe('select_quote_options — même verrou que la signature', () => {
  const selectOptions = async () => {
    const { rows } = await db.query('SELECT select_quote_options($1, $2) AS ok', [TOKEN, ['opt1']]);
    return rows[0].ok;
  };

  it('enregistre les options d’un devis ouvert', async () => {
    await insertQuote({ status: 'sent' });
    expect(await selectOptions()).toBe(true);
    const q = await getQuote();
    expect(q.items.find((i) => i.id === 'opt1').is_optional).toBeUndefined();
    expect(Number(q.total_ht)).toBe(150);
  });

  it('refuse de réécrire un devis annulé', async () => {
    await insertQuote({ status: 'cancelled' });
    expect(await selectOptions()).toBe(false);
    const q = await getQuote();
    expect(q.items.find((i) => i.id === 'opt1').is_optional).toBe(true);
    expect(Number(q.total_ht)).toBe(100); // totaux intacts
  });

  it('refuse de réécrire un devis dont le lien est suspendu', async () => {
    await insertQuote({ status: 'sent', revoked: true });
    expect(await selectOptions()).toBe(false);
    expect(Number((await getQuote()).total_ht)).toBe(100);
  });

  it('refuse de réécrire un devis dont le lien a expiré', async () => {
    await insertQuote({ status: 'sent' });
    await db.query("UPDATE quotes SET token_expires_at = NOW() - interval '1 day' WHERE id = $1", [ID]);
    expect(await selectOptions()).toBe(false);
  });
});
