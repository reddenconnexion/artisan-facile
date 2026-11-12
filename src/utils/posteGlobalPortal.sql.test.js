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
// get_portal_data vit désormais dans la migration qui pose les listes blanches.
const PORTAL_MIG = path.join(ROOT, 'supabase/migrations/20261112100000_portal_data_whitelist.sql');
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

// Schéma minimal : ce que get_portal_data lit/écrit, plus les colonnes sensibles
// de la production qui ne doivent JAMAIS ressortir (pour prouver le filtrage).
const SCHEMA = `
CREATE TABLE clients (
  id bigint PRIMARY KEY, user_id uuid, name text, email text, phone text,
  address text, postal_code text, city text, siren text, tva_intracom text,
  notes text, contacts jsonb, status text, autopilot_paused boolean,
  portal_token uuid, portal_token_revoked boolean DEFAULT false, portal_token_expires_at timestamptz
);
CREATE TABLE profiles (
  id uuid PRIMARY KEY, email text, full_name text, company_name text,
  professional_email text, website text, address text, city text, postal_code text,
  phone text, siret text, logo_url text, trade text, brand_color text,
  iban text, wero_phone text,
  google_review_url text, facebook_review_url text, pages_jaunes_review_url text,
  insurance_company text, insurance_contract_number text, insurance_company_address text,
  insurance_coverage_area text, insurance_attestation_url text, insurance_attestation_valid_until date,
  plan text, stripe_customer_id text, stripe_subscription_id text, stripe_subscription_status text,
  stripe_test_customer_id text, stripe_test_subscription_id text, stripe_test_subscription_status text,
  smtp_config jsonb, pdp_config jsonb, ai_preferences jsonb, follow_up_settings jsonb,
  marketing_data jsonb, autopilot_settings jsonb, monthly_revenue_goal numeric,
  email_signature_html text, b2b_receiver_status text, b2b_receiver_error text,
  founder_since timestamptz, subscription_cancel_at timestamptz, subscription_trial_end timestamptz,
  avatar_url text
);
CREATE TABLE quotes (
  id bigint PRIMARY KEY, user_id uuid, client_id bigint, status text, type text,
  items jsonb, client_display_mode text, date timestamptz, title text, quote_number text,
  total_ht numeric, total_tva numeric, total_ttc numeric, include_tva boolean, notes text,
  public_token uuid, follow_up_count integer, last_viewed_at timestamptz,
  creation_time_seconds integer, used_ai_generation boolean, transmission_ref text,
  urgency text, work_stage text, payment_method text
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
  await db.exec(extractPortal(readFileSync(PORTAL_MIG, 'utf8')));

  await db.query(
    `INSERT INTO clients (id, user_id, name, email, address, postal_code, city, notes, contacts, portal_token)
     VALUES (1, $1, 'M. Client', 'client@example.test', '1 rue du Client', '33000', 'Bordeaux',
             'NOTE-INTERNE-CLIENT', '[{"name":"CONTACT-INTERNE"}]'::jsonb, $2)`,
    [ARTISAN, TOKEN],
  );
  await db.query(
    `INSERT INTO profiles (
       id, email, full_name, company_name, professional_email, website, address, city, postal_code,
       phone, siret, logo_url, trade, brand_color, iban, wero_phone,
       google_review_url, facebook_review_url, pages_jaunes_review_url,
       insurance_company, insurance_contract_number, insurance_company_address,
       insurance_coverage_area, insurance_attestation_url, insurance_attestation_valid_until,
       plan, stripe_customer_id, stripe_subscription_id, stripe_test_customer_id,
       smtp_config, pdp_config, ai_preferences, follow_up_settings, marketing_data,
       autopilot_settings, monthly_revenue_goal, email_signature_html
     ) VALUES (
       $1, 'login-secret@example.test', 'Jean Artisan', 'ArtisanFacile', 'contact@example.test',
       'https://example.test', '2 rue de l''Atelier', 'Libourne', '33500',
       '0600000000', '12345678900012', 'https://example.test/logo.png', 'electricien', '#112233',
       'FR7600000000000000000000000', '0611111111',
       'https://example.test/g', 'https://example.test/f', 'https://example.test/pj',
       'Assureur SA', 'CONTRAT-42', '3 rue de l''Assureur', 'France métropolitaine',
       'https://example.test/attestation.pdf', '2027-01-01',
       'pro', 'cus_SECRET', 'sub_SECRET', 'cus_test_SECRET',
       '{"password":"SMTP-SECRET"}'::jsonb, '{"api_key":"PDP-SECRET"}'::jsonb,
       '{"artisan_status":"micro","hourly_rate":"TAUX-SECRET"}'::jsonb,
       '{"steps":"RELANCE-SECRET"}'::jsonb, '{"x":"MARKETING-SECRET"}'::jsonb,
       '{"x":"AUTOPILOT-SECRET"}'::jsonb, 99999, '<p>SIGNATURE-SECRET</p>'
     )`,
    [ARTISAN],
  );

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
    `INSERT INTO quotes (id, user_id, client_id, status, type, items, client_display_mode, date, title, quote_number,
                         total_ttc, public_token, follow_up_count, creation_time_seconds, transmission_ref, urgency)
     VALUES (10, $1, 1, 'sent', 'quote', $2::jsonb, 'poste_global', now(), 'Devis A', 'A-1',
             528, '33333333-3333-3333-3333-333333333333', 3, 120, 'TRANSMISSION-INTERNE', 'URGENCE-INTERNE'),
            (11, $1, 1, 'sent', 'quote', $3::jsonb, 'poste_global', now() - interval '1 day', 'Devis B', 'B-1',
             2, NULL, 0, 60, NULL, NULL)`,
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

// ── Listes blanches : rien d'interne ne sort par le lien d'espace client ──────
//
// get_portal_data est SECURITY DEFINER et appelée sans session : tout ce qu'elle
// renvoie est lisible par quiconque détient un lien /p/:token. Le profil de
// l'artisan y est déjà reparti une fois en entier (row_to_json réintroduit par
// une migration ultérieure) : ces tests sont là pour que ça ne se reproduise pas.

const ARTISAN_KEYS = [
  'company_name', 'full_name', 'logo_url', 'phone', 'professional_email', 'website',
  'address', 'postal_code', 'city', 'siret', 'trade', 'brand_color',
  'iban', 'wero_phone',
  'google_review_url', 'facebook_review_url', 'pages_jaunes_review_url',
  'insurance_company', 'insurance_contract_number', 'insurance_company_address',
  'insurance_coverage_area', 'insurance_attestation_url', 'insurance_attestation_valid_until',
];

describe('get_portal_data — listes blanches', () => {
  const load = async () => (await db.query('SELECT get_portal_data($1) AS data', [TOKEN])).rows[0].data;

  it("n'expose aucune clé sensible du profil artisan", async () => {
    const { artisan } = await load();
    for (const key of [
      'email', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_test_customer_id',
      'plan', 'smtp_config', 'pdp_config', 'ai_preferences', 'follow_up_settings',
      'marketing_data', 'autopilot_settings', 'monthly_revenue_goal', 'email_signature_html',
      'b2b_receiver_status', 'founder_since', 'subscription_cancel_at', 'id',
    ]) {
      expect(artisan).not.toHaveProperty(key);
    }
    // Ni sous une autre clé, ni imbriqué : aucune valeur sensible dans la réponse.
    const raw = JSON.stringify(await load());
    expect(raw).not.toMatch(/SECRET/);
    expect(raw).not.toContain('login-secret@example.test');
  });

  it('renvoie exactement la liste blanche artisan, avec les bonnes valeurs', async () => {
    const { artisan } = await load();
    expect(Object.keys(artisan).sort()).toEqual([...ARTISAN_KEYS].sort());
    expect(artisan).toMatchObject({
      company_name: 'ArtisanFacile',
      full_name: 'Jean Artisan',
      professional_email: 'contact@example.test',
      address: "2 rue de l'Atelier",
      postal_code: '33500',
      city: 'Libourne',
      siret: '12345678900012',
      trade: 'electricien',
      brand_color: '#112233',
      iban: 'FR7600000000000000000000000',
      wero_phone: '0611111111',
      insurance_company: 'Assureur SA',
      insurance_contract_number: 'CONTRAT-42',
      insurance_company_address: "3 rue de l'Assureur",
      insurance_coverage_area: 'France métropolitaine',
      insurance_attestation_url: 'https://example.test/attestation.pdf',
      insurance_attestation_valid_until: '2027-01-01',
    });
  });

  it('couvre tous les champs du profil lus par les générateurs PDF du portail', () => {
    // Si un PDF se met à lire un nouveau champ du profil, il faut l'ajouter à la
    // liste blanche SQL — sinon il manquerait silencieusement sur les documents
    // téléchargés depuis l'espace client.
    const sources = ['src/utils/pdf/quotePdf.js', 'src/utils/pdf/reportPdf.js', 'src/utils/facturxGenerator.js']
      .map((f) => readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n');
    const read = new Set([...sources.matchAll(/userProfile\??\.([a-zA-Z_]+)/g)].map((m) => m[1]));
    // Volontairement absents : `email` (e-mail de connexion, simple repli quand
    // professional_email est vide) et `tva_intracom` (pas une colonne de profiles).
    const notExposed = new Set(['email', 'tva_intracom']);
    const missing = [...read].filter((k) => !ARTISAN_KEYS.includes(k) && !notExposed.has(k));
    expect(missing).toEqual([]);
  });

  it('ne renvoie du client que le nécessaire (ni notes, ni contacts, ni jeton)', async () => {
    const { client } = await load();
    expect(Object.keys(client).sort()).toEqual(
      ['address', 'city', 'email', 'id', 'name', 'postal_code', 'siren', 'tva_intracom'],
    );
    expect(client.name).toBe('M. Client');
    expect(client.email).toBe('client@example.test');
    expect(JSON.stringify(await load())).not.toMatch(/NOTE-INTERNE|CONTACT-INTERNE/);
  });

  it('ne renvoie des devis que les colonnes utiles au client', async () => {
    const { quotes } = await load();
    const a = quotes.find((x) => x.id === 10);
    expect(a).toMatchObject({ id: 10, client_id: 1, status: 'sent', type: 'quote', title: 'Devis A', total_ttc: 528 });
    for (const key of [
      'user_id', 'public_token', 'follow_up_count', 'last_viewed_at', 'creation_time_seconds',
      'used_ai_generation', 'transmission_ref', 'urgency', 'work_stage', 'payment_method',
    ]) {
      expect(a).not.toHaveProperty(key);
    }
  });
});
