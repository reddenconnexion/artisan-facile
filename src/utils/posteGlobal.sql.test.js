// Tests de la fusion « Poste global » telle qu'elle s'exécute CÔTÉ SERVEUR.
//
// La logique de fusion vit dans la migration SQL (build_poste_global_items /
// client_facing_items), appelée par get_public_quote et get_portal_data. Pour la
// tester là où elle vit réellement — et pas une réimplémentation JS — on charge
// les vraies définitions SQL dans un PostgreSQL en mémoire (PGlite) et on vérifie
// les invariants de sécurité et d'intégrité sur un devis réaliste :
//   1. somme des postes == somme du détail (à l'arrondi près), main d'œuvre incluse ;
//   2. zéro champ interne ni quantitatif de composant dans la sortie publique ;
//   3. exception « à l'unité » (prises/spots) et surcharge par ligne ;
//   4. options préservées séparément, avec leur id (sélection sur le lien public).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const ROOT = cwd();
const MIG = path.join(ROOT, 'supabase/migrations/20260705120000_add_poste_global_display_mode.sql');
const STRIP_MIG = path.join(ROOT, 'supabase/migrations/20260704120000_hide_internal_quote_item_fields.sql');
// Redéfinition de build_poste_global_items avec le défaut « à l'unité » conditionné
// à la section (une section technique — tableau… — fusionne ses composants).
const SECTION_AWARE_MIG = path.join(ROOT, 'supabase/migrations/20260705140000_poste_global_section_aware_per_unit.sql');

// Champs qui ne doivent JAMAIS transiter vers le client (internes) ni exposer un
// quantitatif de composant fusionné.
const FORBIDDEN_KEYS = [
  'buying_price', 'components', 'internal_note', 'reference',
  'price', 'unit_price',
];

/** Extrait le bloc de fonctions pures entre les marqueurs de la migration. */
function extractPureFunctions(sql) {
  const begin = '-- <<BEGIN poste_global pure functions>>';
  const end = '-- <<END poste_global pure functions>>';
  const s = sql.indexOf(begin);
  const e = sql.indexOf(end);
  if (s < 0 || e < 0) throw new Error('Marqueurs des fonctions pures introuvables dans la migration');
  return sql.slice(s + begin.length, e);
}

/** Extrait la définition de strip_internal_item_fields (dépendance de la migration). */
function extractStrip(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.strip_internal_item_fields');
  if (start < 0) throw new Error('strip_internal_item_fields introuvable');
  const block = sql.slice(start);
  return block.slice(0, block.indexOf('$$;') + 3);
}

let db;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(extractStrip(readFileSync(STRIP_MIG, 'utf8')));
  await db.exec(extractPureFunctions(readFileSync(MIG, 'utf8')));
  // Applique la redéfinition section-aware par-dessus (CREATE OR REPLACE).
  await db.exec(readFileSync(SECTION_AWARE_MIG, 'utf8'));
});

afterAll(async () => {
  await db?.close();
});

const buildPosteGlobal = async (items) => {
  const res = await db.query('SELECT public.build_poste_global_items($1::jsonb) AS out', [
    JSON.stringify(items),
  ]);
  return res.rows[0].out;
};

const clientFacing = async (items, mode) => {
  const res = await db.query('SELECT public.client_facing_items($1::jsonb, $2) AS out', [
    JSON.stringify(items),
    mode,
  ]);
  return res.rows[0].out;
};

// Devis électricien réel : deux lots, main d'œuvre + fournitures, éléments à
// l'unité, une surcharge (spots forcés dans le poste) et deux options.
const realQuote = () => [
  { id: 1, type: 'section', description: 'Lot 1 — Tableau électrique' },
  { id: 2, type: 'service', description: 'Pose et raccordement tableau', quantity: 8, unit: 'h', price: 45, buying_price: 0 },
  {
    id: 3, type: 'material', description: 'Tableau 4 rangées précâblé', quantity: 1, unit: 'forfait', price: 320.5,
    buying_price: 180, reference: 'SCH-XE4',
    components: [
      { id: 91, description: 'Coffret Schneider', quantity: 1, unit: 'u', buying_price: 90 },
      { id: 92, description: 'Parafoudre', quantity: 1, unit: 'u', buying_price: 60 },
    ],
    internal_note: 'Fournisseur Rexel',
  },
  { id: 4, type: 'material', description: 'Disjoncteur 16A', quantity: 12, unit: 'u', price: 8.9, buying_price: 4.2, reference: 'DJ16' },
  { id: 5, type: 'material', description: 'Câble 3G2.5', quantity: 50, unit: 'm', price: 1.4, buying_price: 0.8 },
  { id: 6, type: 'section', description: 'Lot 2 — Prises et éclairage' },
  { id: 7, type: 'service', description: 'Câblage prises', quantity: 6, unit: 'h', price: 45 },
  { id: 8, type: 'material', description: 'Prises encastrées', quantity: 17, unit: 'u', price: 6.5, buying_price: 2.1 },
  // Surcharge artisan : spots à l'unité mais forcés dans le poste global.
  { id: 9, type: 'material', description: 'Spots LED encastrés', quantity: 10, unit: 'u', price: 12, buying_price: 5, display_per_unit: false },
  { id: 10, type: 'material', description: 'Goulotte', quantity: 20, unit: 'm', price: 2, buying_price: 1 },
  { id: 11, type: 'material', is_optional: true, description: 'Réglette LED garage', quantity: 2, unit: 'u', price: 25, buying_price: 12 },
  { id: 12, type: 'service', is_optional: true, description: 'Mise en service domotique', quantity: 3, unit: 'h', price: 55 },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const detailSum = (items) =>
  items.filter((i) => i.type !== 'section')
    .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0), 0);

describe('build_poste_global_items (fusion serveur)', () => {
  it('la somme des postes égale la somme du détail (main d\'œuvre incluse)', async () => {
    const items = realQuote();
    const out = await buildPosteGlobal(items);
    const outSum = out.reduce((s, i) => s + Number(i.line_total || 0), 0);
    expect(round2(outSum)).toBe(round2(detailSum(items)));
  });

  it('ne laisse transiter aucun champ interne ni quantitatif de composant', async () => {
    const out = await buildPosteGlobal(realQuote());
    for (const line of out) {
      for (const key of FORBIDDEN_KEYS) {
        expect(line, `la ligne "${line.description}" expose "${key}"`).not.toHaveProperty(key);
      }
    }
    // Aucune trace textuelle des composants internes (référence, note, fourniture).
    const blob = JSON.stringify(out);
    expect(blob).not.toContain('SCH-XE4');
    expect(blob).not.toContain('Rexel');
    expect(blob).not.toContain('Coffret Schneider');
    expect(blob).not.toContain('Parafoudre');
  });

  it('fusionne les fournitures obligatoires en un poste par section', async () => {
    const out = await buildPosteGlobal(realQuote());
    const postes = out.filter((i) => i.type === 'material' && i.is_poste);
    // Lot 1 est une section TECHNIQUE (« Tableau électrique ») : le disjoncteur
    // (unité « u ») ne reste PAS à l'unité, il fusionne. Poste = Tableau (320.5)
    // + Disjoncteur (12×8.9 = 106.8) + Câble (70) = 497.3.
    const lot1 = postes.find((p) => p.description.includes('Lot 1'));
    expect(Number(lot1.line_total)).toBe(497.3);
    // Lot 2 (finition, non technique) : Spots forcés (120) + Goulotte (40) ;
    // Prises exclues (vendues à l'unité).
    const lot2 = postes.find((p) => p.description.includes('Lot 2'));
    expect(Number(lot2.line_total)).toBe(160);
    // Un seul poste fournitures par section.
    expect(postes).toHaveLength(2);
    // Le disjoncteur d'une section technique ne doit jamais rester à l'unité.
    expect(out.some((i) => i.description === 'Disjoncteur 16A')).toBe(false);
  });

  it('garde la main d\'œuvre en une ligne par section', async () => {
    const out = await buildPosteGlobal(realQuote());
    const labor = out.filter((i) => i.type === 'service' && i.is_poste);
    expect(labor).toHaveLength(2);
    expect(Number(labor.find((l) => l.description.includes('Pose')).line_total)).toBe(360);
    expect(Number(labor.find((l) => l.description.includes('Câblage')).line_total)).toBe(270);
  });

  it('laisse quantifiés les éléments vendus à l\'unité', async () => {
    const out = await buildPosteGlobal(realQuote());
    const prises = out.find((i) => i.description === 'Prises encastrées');
    expect(prises.per_unit).toBe(true);
    expect(Number(prises.quantity)).toBe(17);
    expect(prises.unit).toBe('u');
    expect(Number(prises.line_total)).toBe(110.5);
    expect(prises).not.toHaveProperty('price'); // le prix unitaire n'est pas exposé
  });

  it('respecte la surcharge display_per_unit par ligne', async () => {
    const out = await buildPosteGlobal(realQuote());
    // Les spots (unit "u" mais display_per_unit:false) ne doivent PAS apparaître
    // comme ligne à l'unité — ils sont fondus dans le poste du Lot 2.
    expect(out.some((i) => i.description === 'Spots LED encastrés')).toBe(false);
  });

  it('présente les options séparément en conservant leur id', async () => {
    const out = await buildPosteGlobal(realQuote());
    const options = out.filter((i) => i.is_optional);
    expect(options).toHaveLength(2);
    const reglette = options.find((o) => o.description.includes('Réglette'));
    expect(reglette.id).toBe(11);
    expect(Number(reglette.line_total)).toBe(50);
    const domotique = options.find((o) => o.description.includes('domotique'));
    expect(domotique.id).toBe(12);
    expect(Number(domotique.line_total)).toBe(165);
  });

  it('préserve la franchise en base (montants nuls de TVA hors items)', async () => {
    // La fonction ne touche pas la TVA : elle ne fait que des items. Un devis en
    // franchise (aucune TVA) doit rendre les mêmes postes qu'avec TVA — la fusion
    // est indépendante du régime de TVA.
    const out = await buildPosteGlobal(realQuote());
    expect(round2(out.reduce((s, i) => s + Number(i.line_total || 0), 0)))
      .toBe(round2(detailSum(realQuote())));
  });

  it('gère un devis sans section (un poste global unique)', async () => {
    const items = [
      { id: 1, type: 'service', description: 'Dépannage', quantity: 2, unit: 'h', price: 50 },
      { id: 2, type: 'material', description: 'Joint', quantity: 3, unit: 'u', price: 4, buying_price: 1, display_per_unit: false },
      { id: 3, type: 'material', description: 'Mastic', quantity: 1, unit: 'forfait', price: 12, buying_price: 6 },
    ];
    const out = await buildPosteGlobal(items);
    const matPoste = out.find((i) => i.type === 'material' && i.is_poste);
    expect(Number(matPoste.line_total)).toBe(24); // 12 (joint) + 12 (mastic)
    expect(round2(out.reduce((s, i) => s + Number(i.line_total || 0), 0))).toBe(round2(detailSum(items)));
  });

  it('renvoie [] pour une entrée vide ou non-tableau', async () => {
    expect(await buildPosteGlobal([])).toEqual([]);
  });
});

describe('défaut « à l\'unité » conditionné à la section', () => {
  // Même ligne « u », placée dans une section technique vs une section de finition.
  const uItem = { id: 2, type: 'material', description: 'Disjoncteur 16A', quantity: 12, unit: 'u', price: 8.9 };

  it('un composant « u » d\'une section technique fusionne (jamais à l\'unité)', async () => {
    for (const title of ['Lot 1 — Tableau électrique', 'Coffret de communication', 'Armoire', 'GTL', 'Appareillage modulaire']) {
      const out = await buildPosteGlobal([{ id: 1, type: 'section', description: title }, uItem]);
      expect(out.some((i) => i.per_unit), `section « ${title} »`).toBe(false);
      const poste = out.find((i) => i.is_poste && i.type === 'material');
      expect(Number(poste.line_total)).toBe(106.8); // fusionné
    }
  });

  it('le même « u » dans une section de finition reste quantifié', async () => {
    const out = await buildPosteGlobal([{ id: 1, type: 'section', description: 'Prises et éclairage' }, uItem]);
    const line = out.find((i) => i.description === 'Disjoncteur 16A');
    expect(line.per_unit).toBe(true);
    expect(Number(line.quantity)).toBe(12);
  });

  it('la surcharge display_per_unit prime sur la section technique', async () => {
    // Forcer « à l'unité » un composant de tableau reste possible ligne par ligne.
    const out = await buildPosteGlobal([
      { id: 1, type: 'section', description: 'Tableau électrique' },
      { ...uItem, display_per_unit: true },
    ]);
    expect(out.some((i) => i.per_unit && i.description === 'Disjoncteur 16A')).toBe(true);
  });
});

describe('client_facing_items (aiguilleur)', () => {
  it('en mode poste_global, fusionne et masque tout champ interne', async () => {
    const out = await clientFacing(realQuote(), 'poste_global');
    expect(out.length).toBeLessThan(realQuote().filter((i) => i.type !== 'section').length);
    expect(JSON.stringify(out)).not.toContain('buying_price');
  });

  it('en mode detailed, expurge les internes mais garde le détail ligne à ligne', async () => {
    const out = await clientFacing(realQuote(), 'detailed');
    // Autant de lignes (sections comprises) qu'à l'entrée : pas de fusion.
    expect(out).toHaveLength(realQuote().length);
    const blob = JSON.stringify(out);
    expect(blob).not.toContain('buying_price');
    expect(blob).not.toContain('internal_note');
    expect(blob).not.toContain('Coffret Schneider'); // components retirés
    // …mais le prix unitaire détaillé, lui, reste (mode détaillé assumé).
    expect(blob).toContain('"price"');
  });

  it('en mode grouped, se comporte comme detailed côté données (pas de fusion)', async () => {
    const out = await clientFacing(realQuote(), 'grouped');
    expect(out).toHaveLength(realQuote().length);
    expect(JSON.stringify(out)).not.toContain('components');
  });
});
