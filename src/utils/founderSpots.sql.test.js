// Compteur de places « Membre fondateur » (RPC founder_spots_left) dans un vrai
// PostgreSQL (PGlite) : lisible par un visiteur (page d'accueil), décompte
// des fondateurs, jamais négatif.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const mig = (name) => readFileSync(path.join(cwd(), 'supabase/migrations', name), 'utf8');

const SCHEMA = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan text DEFAULT 'free');
`;

let db;

const spotsLeftAs = async (role) => {
    await db.exec(`SET ROLE ${role}`);
    try {
        const { rows } = await db.query('SELECT public.founder_spots_left() AS n');
        return rows[0].n;
    } finally {
        await db.exec('RESET ROLE');
    }
};

beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(SCHEMA);
    await db.exec(mig('20261107160000_founder_offer.sql'));
});

afterAll(async () => {
    await db?.close();
});

describe('founder_spots_left', () => {
    it('50 places au départ, lisible par un visiteur et un artisan connecté', async () => {
        expect(await spotsLeftAs('anon')).toBe(50);
        expect(await spotsLeftAs('authenticated')).toBe(50);
    });

    it('chaque fondateur prend une place', async () => {
        await db.exec(`INSERT INTO profiles (plan, founder_since) SELECT 'pro', now() FROM generate_series(1, 3)`);
        await db.exec(`INSERT INTO profiles (plan) VALUES ('free'), ('pro')`);
        expect(await spotsLeftAs('anon')).toBe(47);
    });

    it('jamais négatif une fois complet', async () => {
        await db.exec(`INSERT INTO profiles (plan, founder_since) SELECT 'pro', now() FROM generate_series(1, 60)`);
        expect(await spotsLeftAs('anon')).toBe(0);
    });

    it('un visiteur ne lit pas la table pour autant', async () => {
        await db.exec('SET ROLE anon');
        try {
            await expect(db.query('SELECT count(*) FROM profiles')).rejects.toThrow(/permission denied/);
        } finally {
            await db.exec('RESET ROLE');
        }
    });
});
