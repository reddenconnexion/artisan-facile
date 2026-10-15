// Isolation entre artisans : on charge les vraies règles RLS (schéma d'origine +
// migrations) dans un vrai PostgreSQL (PGlite) et on vérifie qu'un artisan B,
// ou un visiteur anonyme, ne peut ni lire, ni modifier, ni supprimer, ni créer
// de données au nom de l'artisan A. Complète rlsCoverage.sql.test.js, qui ne
// vérifie que la présence de la RLS.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const sql = (rel) => readFileSync(path.join(cwd(), rel), 'utf8');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

// Équivalent minimal de l'environnement Supabase : rôles, auth.uid() lu dans le
// « sub » du JWT, table auth.users.
const SUPABASE_STUB = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
`;

// Tables de test : [table, colonnes d'une ligne valide (hors user_id)]
const TABLES = {
    clients: { cols: 'name', vals: "'Client de A'" },
    quotes: { cols: 'date', vals: 'CURRENT_DATE' },
    events: { cols: 'title, date', vals: "'RDV de A', now()" },
    voice_memos: { cols: 'transcript', vals: "'Note de A'" },
};

let db;

// Exécute une requête avec le rôle Postgres et l'identité JWT demandés.
const as = async (role, sub, query, params = []) => {
    await db.exec(`SET ROLE ${role}`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
    try {
        return await db.query(query, params);
    } finally {
        await db.exec('RESET ROLE');
    }
};

beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(SUPABASE_STUB);
    await db.exec(sql('supabase/legacy/supabase_schema.sql'));
    await db.exec(sql('supabase/migrations/20260313100000_fix_profiles_rls_select.sql'));
    await db.exec(sql('supabase/migrations/20260312100000_add_voice_memos.sql'));
    // Comme Supabase : les droits de table sont ouverts, la RLS fait le tri.
    await db.exec(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    `);
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${USER_A}', 'a@test.fr'), ('${USER_B}', 'b@test.fr')`);
    for (const [table, { cols, vals }] of Object.entries(TABLES)) {
        await db.exec(`INSERT INTO ${table} (user_id, ${cols}) VALUES ('${USER_A}', ${vals})`);
    }
});

afterAll(async () => {
    await db?.close();
});

describe('Isolation RLS entre artisans', () => {
    it('le jeu de données de A est bien en place', async () => {
        for (const table of Object.keys(TABLES)) {
            const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [USER_A]);
            expect(rows[0].n, table).toBe(1);
        }
    });

    describe.each(Object.keys(TABLES))('%s', (table) => {
        const { cols, vals } = TABLES[table];

        it('A voit sa ligne', async () => {
            const { rows } = await as('authenticated', USER_A, `SELECT id FROM ${table}`);
            expect(rows).toHaveLength(1);
        });

        it('B ne voit rien de A', async () => {
            const { rows } = await as('authenticated', USER_B, `SELECT id FROM ${table}`);
            expect(rows).toHaveLength(0);
        });

        it('un visiteur anonyme ne voit rien', async () => {
            const { rows } = await as('anon', null, `SELECT id FROM ${table}`);
            expect(rows).toHaveLength(0);
        });

        it('B ne peut pas modifier la ligne de A', async () => {
            const res = await as('authenticated', USER_B, `UPDATE ${table} SET user_id = user_id WHERE user_id = $1`, [USER_A]);
            expect(res.affectedRows).toBe(0);
        });

        it('B ne peut pas supprimer la ligne de A', async () => {
            const res = await as('authenticated', USER_B, `DELETE FROM ${table} WHERE user_id = $1`, [USER_A]);
            expect(res.affectedRows).toBe(0);
            const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [USER_A]);
            expect(rows[0].n).toBe(1);
        });

        it('B ne peut pas créer une ligne au nom de A', async () => {
            await expect(
                as('authenticated', USER_B, `INSERT INTO ${table} (user_id, ${cols}) VALUES ($1, ${vals})`, [USER_A]),
            ).rejects.toThrow(/row-level security/i);
        });

        it('B ne peut pas « donner » sa propre ligne à A', async () => {
            await as('authenticated', USER_B, `INSERT INTO ${table} (user_id, ${cols}) VALUES ($1, ${vals})`, [USER_B]);
            await expect(
                as('authenticated', USER_B, `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [USER_A, USER_B]),
            ).rejects.toThrow(/row-level security/i);
        });
    });

    describe('profiles', () => {
        it('un visiteur anonyme ne lit aucun profil (clés IA, IBAN…)', async () => {
            await db.exec(`INSERT INTO profiles (id, email) VALUES ('${USER_A}', 'a@test.fr') ON CONFLICT DO NOTHING`);
            const { rows } = await as('anon', null, 'SELECT id FROM profiles');
            expect(rows).toHaveLength(0);
        });

        it('B ne lit pas le profil de A mais lit le sien', async () => {
            await db.exec(`INSERT INTO profiles (id, email) VALUES ('${USER_B}', 'b@test.fr') ON CONFLICT DO NOTHING`);
            const { rows } = await as('authenticated', USER_B, 'SELECT id FROM profiles');
            expect(rows.map((r) => r.id)).toEqual([USER_B]);
        });
    });
});
