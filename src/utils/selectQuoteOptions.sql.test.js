// Tests de la RPC `select_quote_options` telle qu'elle s'exécute CÔTÉ SERVEUR.
//
// Cette RPC est appelée depuis le portail client, avant signature, pour confirmer
// les lignes optionnelles retenues. On charge la vraie définition SQL dans un
// PostgreSQL en mémoire (PGlite) et on vérifie les invariants :
//   1. une option NON retenue reste dans le devis, marquée option_declined et
//      toujours is_optional : elle garde la trace de ce qui a été proposé sans
//      jamais entrer dans le total ;
//   2. une option RETENUE est conservée ET son flag is_optional est retiré
//      (elle devient une ligne ferme comptée dans le total) ;
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
  'supabase/migrations/20260824190000_select_quote_options_keep_declined.sql'
);

let db;

beforeAll(async () => {
  db = await PGlite.create();
  // Table minimale reprenant les colonnes lues/écrites par la RPC.
  await db.exec(`
    CREATE TABLE quotes (
      id           UUID PRIMARY KEY,
      public_token TEXT,
      status       TEXT,
      is_external  BOOLEAN,
      include_tva  BOOLEAN,
      items        JSONB,
      total_ht     NUMERIC,
      total_tva    NUMERIC,
      total_ttc    NUMERIC
    );
  `);
  await db.exec(readFileSync(MIG, 'utf8'));
});

afterAll(async () => {
  await db?.close();
});

const ID = '11111111-1111-1111-1111-111111111111';

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
     VALUES ($1, 'tok', $2, $3, $4, $5::jsonb, 200, 0, 200)`,
    [ID, status, is_external, include_tva, JSON.stringify(baseItems())]
  );
};

const selectOptions = (selectedIds) =>
  db.query('SELECT select_quote_options($1, $2) AS ok', ['tok', selectedIds]);

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

  it('refuse un devis déjà accepté', async () => {
    await insertQuote({ status: 'accepted' });
    const { rows } = await selectOptions(['opt1']);
    expect(rows[0].ok).toBe(false);
    const q = await getQuote();
    expect(q.items.length).toBe(4); // inchangé
  });
});
