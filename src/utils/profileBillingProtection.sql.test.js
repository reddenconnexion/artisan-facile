// Champs d'abonnement de `profiles` protégés (trigger protect_profile_billing),
// dans un vrai PostgreSQL (PGlite) : un artisan ne peut ni se passer en Pro ni
// prendre une place fondateur ; le webhook (service_role) le peut toujours.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const mig = (name) => readFileSync(path.join(cwd(), 'supabase/migrations', name), 'utf8');

const ME = '11111111-1111-1111-1111-111111111111';
const NEWBIE = '22222222-2222-2222-2222-222222222222';

const SCHEMA = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  company_name text,
  plan text DEFAULT 'free',
  stripe_customer_id text, stripe_subscription_id text, stripe_subscription_status text,
  stripe_test_customer_id text, stripe_test_subscription_id text, stripe_test_subscription_status text,
  subscription_cancel_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated, service_role;
`;

let db;

const as = async (role, sql) => {
    await db.exec(`SET ROLE ${role}`);
    try {
        return await db.query(sql);
    } finally {
        await db.exec('RESET ROLE');
    }
};

const row = async (id) => (await db.query(`SELECT * FROM profiles WHERE id = '${id}'`)).rows[0];

beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(SCHEMA);
    await db.exec(mig('20261107160000_founder_offer.sql'));
    await db.exec(mig('20261107170000_profiles_protect_billing.sql'));
    await db.exec(`INSERT INTO profiles (id, company_name) VALUES ('${ME}', 'Avant')`);
});

afterAll(async () => {
    await db?.close();
});

describe('protect_profile_billing', () => {
    it("un artisan ne peut pas se passer en Pro ni en propriétaire", async () => {
        await as('authenticated', `UPDATE profiles SET plan = 'owner', stripe_subscription_status = 'active' WHERE id = '${ME}'`);
        const r = await row(ME);
        expect(r.plan).toBe('free');
        expect(r.stripe_subscription_status).toBeNull();
    });

    it('ni prendre une place fondateur', async () => {
        await as('authenticated', `UPDATE profiles SET founder_since = now() WHERE id = '${ME}'`);
        expect((await row(ME)).founder_since).toBeNull();
    });

    it('le reste de son profil se met à jour, même en renvoyant la ligne complète', async () => {
        await as('authenticated', `UPDATE profiles SET company_name = 'Après', plan = 'pro' WHERE id = '${ME}'`);
        const r = await row(ME);
        expect(r.company_name).toBe('Après');
        expect(r.plan).toBe('free');
    });

    it("un profil créé par l'artisan démarre en gratuit", async () => {
        await as('authenticated', `INSERT INTO profiles (id, plan, founder_since) VALUES ('${NEWBIE}', 'pro', now())`);
        const r = await row(NEWBIE);
        expect(r.plan).toBe('free');
        expect(r.founder_since).toBeNull();
    });

    it('le webhook Stripe (service_role) écrit toujours les champs d\'abonnement', async () => {
        await as('service_role', `UPDATE profiles SET plan = 'pro', stripe_subscription_status = 'trialing', founder_since = now() WHERE id = '${ME}'`);
        const r = await row(ME);
        expect(r.plan).toBe('pro');
        expect(r.stripe_subscription_status).toBe('trialing');
        expect(r.founder_since).not.toBeNull();
    });

    it("et l'artisan ne peut pas défaire un abonnement payé", async () => {
        await as('authenticated', `UPDATE profiles SET plan = 'free', founder_since = NULL WHERE id = '${ME}'`);
        const r = await row(ME);
        expect(r.plan).toBe('pro');
        expect(r.founder_since).not.toBeNull();
    });
});
