// Résilience « lecture de liste » du portail client (get_portal_data).
//
// Le portail affiche plusieurs devis. Un devis dont la fusion « poste global »
// échoue doit être ISOLÉ (repli en détaillé de secours, champs internes toujours
// expurgés) et consigné dans audit_logs, SANS interrompre l'affichage des autres.
// On charge le vrai get_portal_data (issu de la migration) dans un PostgreSQL en
// mémoire, avec un schéma minimal, et on force l'échec via une quantité non
// numérique (cast ::numeric → exception dans build_poste_global_items).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const ROOT = cwd();
const MIG = path.join(ROOT, 'supabase/migrations/20260705120000_add_poste_global_display_mode.sql');
const STRIP_MIG = path.join(ROOT, 'supabase/migrations/20260704120000_hide_internal_quote_item_fields.sql');

function extractPureFunctions(sql) {
  const begin = '-- <<BEGIN poste_global pure functions>>';
  const end = '-- <<END poste_global pure functions>>';
  return sql.slice(sql.indexOf(begin) + begin.length, sql.indexOf(end));
}
function extractStrip(sql) {
  const block = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.strip_internal_item_fields'));
  return block.slice(0, block.indexOf('$$;') + 3);
}
function extractPortal(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION get_portal_data');
  const block = sql.slice(start);
  return block.slice(0, block.lastIndexOf('$$;') + 3);
}

// Schéma minimal couvrant uniquement ce que get_portal_data lit/écrit.
const SCHEMA = `
CREATE TABLE clients (
  id bigint PRIMARY KEY, user_id uuid, name text,
  portal_token uuid, portal_token_revoked boolean DEFAULT false, portal_token_expires_at timestamptz
);
CREATE TABLE profiles (id uuid PRIMARY KEY, company_name text);
CREATE TABLE quotes (
  id bigint PRIMARY KEY, user_id uuid, client_id bigint, status text,
  items jsonb, client_display_mode text, date timestamptz, title text, quote_number text
);
CREATE TABLE project_photos (id bigint PRIMARY KEY, client_id bigint, created_at timestamptz);
CREATE TABLE intervention_reports (
  id bigint PRIMARY KEY, client_id bigint, status text, title text, date timestamptz,
  report_number text, report_pdf_url text, signed_at timestamptz, signer_name text,
  description text, work_done text, materials_used text, photos jsonb, client_signature text,
  client_name text, intervention_address text, intervention_postal_code text,
  intervention_city text, start_time timestamptz, end_time timestamptz, duration_hours numeric, notes text
);
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY, user_id uuid, action text, entity_type text, entity_id bigint,
  entity_label text, details jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
`;

const TOKEN = '11111111-1111-1111-1111-111111111111';
const ARTISAN = '22222222-2222-2222-2222-222222222222';

let db;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(extractStrip(readFileSync(STRIP_MIG, 'utf8')));
  await db.exec(extractPureFunctions(readFileSync(MIG, 'utf8')));
  await db.exec(SCHEMA);
  await db.exec(extractPortal(readFileSync(MIG, 'utf8')));

  await db.query('INSERT INTO clients (id, user_id, name, portal_token) VALUES (1, $1, $2, $3)', [
    ARTISAN, 'M. Client', TOKEN,
  ]);
  await db.query('INSERT INTO profiles (id, company_name) VALUES ($1, $2)', [ARTISAN, 'ArtisanFacile']);

  // Devis A : poste_global valide.
  const good = [
    { id: 1, type: 'section', description: 'Lot 1' },
    { id: 2, type: 'service', description: 'Pose', quantity: 4, price: 45 },
    { id: 3, type: 'material', description: 'Tableau', quantity: 1, price: 300, buying_price: 150 },
  ];
  // Devis B : poste_global, quantité non numérique → la fusion lève une exception.
  const bad = [
    { id: 1, type: 'material', description: 'Câble', quantity: 'abc', price: 2, buying_price: 1, reference: 'R1' },
  ];
  await db.query(
    `INSERT INTO quotes (id, user_id, client_id, status, items, client_display_mode, date, title, quote_number)
     VALUES (10, $1, 1, 'sent', $2::jsonb, 'poste_global', now(), 'Devis A', 'A-1'),
            (11, $1, 1, 'sent', $3::jsonb, 'poste_global', now() - interval '1 day', 'Devis B', 'B-1')`,
    [ARTISAN, JSON.stringify(good), JSON.stringify(bad)],
  );
});

afterAll(async () => {
  await db?.close();
});

describe('get_portal_data — repli par-devis', () => {
  it('affiche tous les devis, même quand un devis « poste global » est incohérent', async () => {
    const res = await db.query('SELECT get_portal_data($1) AS data', [TOKEN]);
    const data = res.rows[0].data;
    const quotes = data.quotes;
    expect(quotes).toHaveLength(2);

    const a = quotes.find((x) => x.id === 10);
    const b = quotes.find((x) => x.id === 11);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    // Devis A : bien fusionné en postes (au moins une ligne is_poste, sans interne).
    expect(a.items.some((i) => i.is_poste)).toBe(true);
    expect(JSON.stringify(a.items)).not.toContain('buying_price');

    // Devis B : repli détaillé de secours — la ligne d'origine réapparaît telle
    // quelle (pas de fusion). C'est exactement la présentation « détaillée » : les
    // champs de COÛT interne (buying_price, components, internal_note) restent
    // expurgés par strip_internal_item_fields.
    expect(b.items).toHaveLength(1);
    expect(b.items[0].description).toBe('Câble');
    expect(b.items[0]).not.toHaveProperty('buying_price');
    expect(b.items[0]).not.toHaveProperty('components');
    expect(b.items[0]).not.toHaveProperty('internal_note');
  });

  it('consigne le devis fautif dans audit_logs pour correction', async () => {
    // (get_portal_data a déjà été appelé au test précédent ; relançons pour être
    //  indépendant de l'ordre.)
    await db.query('SELECT get_portal_data($1)', [TOKEN]);
    const res = await db.query(
      `SELECT entity_id, action, entity_label, details
         FROM audit_logs WHERE action = 'quote.display_fallback' AND entity_id = 11 LIMIT 1`,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].entity_label).toBe('Devis B');
    expect(res.rows[0].details.fallback).toBe('detailed');
    expect(res.rows[0].details.client_display_mode).toBe('poste_global');
  });
});
