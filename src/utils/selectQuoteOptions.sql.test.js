// Tests de la RPC `select_quote_options` telle qu'elle s'exécute CÔTÉ SERVEUR.
//
// Cette RPC est appelée depuis le portail client, avant signature, pour confirmer
// les lignes optionnelles retenues. On charge la vraie définition SQL dans un
// PostgreSQL en mémoire (PGlite) et on vérifie les invariants :
//   1. une option NON retenue reste dans le devis, marquée option_declined et
//      toujours is_optional : elle garde la trace de ce qui a été proposé sans
//      jamais entrer dans le total ;
//   2. une option RETENUE est conservée, son flag is_optional est retiré (elle
//      devient une ligne ferme comptée dans le total) et elle est marquée
//      option_accepted, pour que le devis dise que le client l'a choisie ;
//   3. les totaux (total_ht/tva/ttc) sont recalculés sur les lignes conservées,
//      pour qu'une option retenue soit immédiatement comptée dans le total stocké ;
//   4. un devis externe (is_external) ne voit pas ses totaux recalculés ;
//   5. un devis déjà accepté n'est pas modifiable (retourne false).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const ROOT = cwd();
const MIG = path.join(
  ROOT,
  'supabase/migrations/20260829140000_select_quote_options_uuid_token.sql'
);

let db;

beforeAll(async () => {
  db = await PGlite.create();
  // Table minimale reprenant les colonnes lues/écrites par la RPC, AVEC LEURS
  // TYPES DE PRODUCTION. Ce détail n'en est pas un : tant que cette fixture
  // déclarait `id UUID` et `public_token TEXT`, ces tests passaient au vert sur
  // une fonction qui ne pouvait pas s'exécuter en production, où `id` est un
  // bigint et `public_token` un uuid. La comparaison `public_token = p_token`
  // y levait `operator does not exist: uuid = text` (42883), que PostgREST
  // renvoie en 404 — la sélection d'options du client n'a jamais été
  // enregistrée. Toute divergence de type entre cette table et la vraie rend
  // ces tests incapables de voir la panne qu'ils sont censés couvrir.
  await db.exec(`
    CREATE TABLE quotes (
      id           BIGINT PRIMARY KEY,
      public_token UUID,
      status       TEXT,
      is_external  BOOLEAN,
      include_tva  BOOLEAN,
      items        JSONB,
      total_ht     NUMERIC,
      total_tva    NUMERIC,
      total_ttc    NUMERIC
    );
  `);
  // PGlite n'a pas les rôles de Supabase : on les crée pour que la migration
  // s'applique telle quelle, GRANT compris. Charger une version amputée du
  // fichier reviendrait à tester autre chose que ce qui part en production.
  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE anon;
      CREATE ROLE authenticated;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.exec(readFileSync(MIG, 'utf8'));
});

afterAll(async () => {
  await db?.close();
});

const ID = 271;
const TOKEN = '4d39e842-372b-4784-846d-fbfdd29f6172';

// Deux lignes fermes + deux options ; total ferme de base = 100 + 20 = 120.
const baseItems = () => [
  { id: 'a', type: 'service', quantity: 1, price: 100 },
  { id: 'b', type: 'material', quantity: 1, price: 20 },
  { id: 'opt1', type: 'service', quantity: 1, price: 50, is_optional: true },
  { id: 'opt2', type: 'material', quantity: 1, price: 30, is_optional: true },
];

const insertQuote = async ({ include_tva = false, is_external = false, status = 'sent' } = {}) => {
  await db.query(
    `INSERT INTO quotes (id, public_token, status, is_external, include_tva, items, total_ht, total_tva, total_ttc)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 200, 0, 200)`,
    [ID, TOKEN, status, is_external, include_tva, JSON.stringify(baseItems())]
  );
};

const selectOptions = (selectedIds) =>
  db.query('SELECT select_quote_options($1, $2) AS ok', [TOKEN, selectedIds]);

const getQuote = async () => {
  const res = await db.query('SELECT * FROM quotes WHERE id = $1', [ID]);
  return res.rows[0];
};

beforeEach(async () => {
  await db.query('DELETE FROM quotes');
});

describe('select_quote_options', () => {
  it('conserve une option retenue en retirant son flag is_optional', async () => {
    await insertQuote();
    const { rows } = await selectOptions(['opt1']);
    expect(rows[0].ok).toBe(true);

    const q = await getQuote();
    const opt1 = q.items.find((i) => i.id === 'opt1');
    expect(opt1.is_optional).toBeUndefined(); // devient ferme
    expect(opt1.option_accepted).toBe(true); // ... et se lit comme une option choisie
    expect(opt1.option_declined).toBeUndefined();
  });

  it('garde la trace d’une option écartée, marquée et hors chiffrage', async () => {
    await insertQuote();
    await selectOptions(['opt1']);

    const q = await getQuote();
    const opt2 = q.items.find((i) => i.id === 'opt2');
    expect(opt2).toBeDefined(); // trace de ce qui a été proposé
    expect(opt2.option_declined).toBe(true);
    expect(opt2.is_optional).toBe(true); // reste exclue de tout total
    expect(q.items).toHaveLength(4); // aucune ligne perdue
  });

  it('recalcule le total ferme en incluant l’option retenue', async () => {
    await insertQuote();
    await selectOptions(['opt1']); // 100 + 20 + 50 = 170
    const q = await getQuote();
    expect(Number(q.total_ht)).toBe(170);
    expect(Number(q.total_ttc)).toBe(170); // include_tva = false
  });

  it('exclut du total une option non retenue', async () => {
    await insertQuote();
    await selectOptions([]); // aucune option → 100 + 20 = 120
    const q = await getQuote();
    expect(Number(q.total_ht)).toBe(120);
    // Les deux options restent au devis, marquées écartées.
    expect(q.items.filter((i) => i.option_declined)).toHaveLength(2);
  });

  it('applique la TVA quand include_tva est vrai', async () => {
    await insertQuote({ include_tva: true });
    await selectOptions(['opt1', 'opt2']); // 100 + 20 + 50 + 30 = 200
    const q = await getQuote();
    expect(Number(q.total_ht)).toBe(200);
    expect(Number(q.total_tva)).toBe(40);
    expect(Number(q.total_ttc)).toBe(240);
  });

  it('ne recalcule pas les totaux d’un devis externe', async () => {
    await insertQuote({ is_external: true });
    await selectOptions(['opt1']);
    const q = await getQuote();
    // Totaux saisis à la main : inchangés ...
    expect(Number(q.total_ht)).toBe(200);
    // ... mais les lignes portent bien l'état des options.
    expect(q.items.find((i) => i.id === 'opt1').is_optional).toBeUndefined();
    expect(q.items.find((i) => i.id === 'opt2').option_declined).toBe(true);
  });

  // Le test de régression du 404 : la fonction doit accepter le jeton tel que le
  // portail l'envoie — la chaîne d'URL convertie en UUID, comme pour
  // get_public_quote et sign_public_quote. Déclarer p_token en TEXT faisait
  // échouer la comparaison avec la colonne uuid et rendait la RPC inappelable.
  it('accepte le jeton public au type de la colonne (uuid)', async () => {
    await insertQuote();
    const { rows } = await db.query('SELECT select_quote_options($1::uuid, $2) AS ok', [
      TOKEN,
      ['opt1'],
    ]);
    expect(rows[0].ok).toBe(true);
  });

  it('ignore un jeton inconnu sans rien modifier', async () => {
    await insertQuote();
    const { rows } = await selectOptions.call(null, ['opt1']);
    expect(rows[0].ok).toBe(true);

    const { rows: autres } = await db.query('SELECT select_quote_options($1, $2) AS ok', [
      '00000000-0000-0000-0000-000000000000',
      ['opt1'],
    ]);
    expect(autres[0].ok).toBe(false);
  });

  it('refuse un devis déjà accepté', async () => {
    await insertQuote({ status: 'accepted' });
    const { rows } = await selectOptions(['opt1']);
    expect(rows[0].ok).toBe(false);
    const q = await getQuote();
    expect(q.items.length).toBe(4); // inchangé
  });
});
