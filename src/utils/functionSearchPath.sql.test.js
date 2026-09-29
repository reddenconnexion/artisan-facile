// La migration qui fige le search_path doit s'appliquer sans erreur, que les
// fonctions existent ou non, et poser le bon réglage sur celles qui existent.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(
    path.join(cwd(), 'supabase/migrations/20260929090000_pin_function_search_path.sql'), 'utf8');

describe('migration pin_function_search_path', () => {
    it('fige search_path sur les fonctions présentes et ignore les absentes', async () => {
        const db = new PGlite();
        await db.exec(`
            CREATE SCHEMA extensions;
            CREATE FUNCTION public.storage_cap_for_plan(p_plan text) RETURNS bigint
              LANGUAGE sql AS $$ SELECT 1::bigint $$;
            CREATE FUNCTION public.handle_new_user() RETURNS trigger
              LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
        `);
        await db.exec(MIGRATION);
        const { rows } = await db.query(`
            SELECT proname, proconfig FROM pg_proc
            WHERE proname IN ('storage_cap_for_plan', 'handle_new_user') ORDER BY proname`);
        expect(rows).toEqual([
            { proname: 'handle_new_user', proconfig: ['search_path=public, extensions'] },
            { proname: 'storage_cap_for_plan', proconfig: ['search_path=public, extensions'] },
        ]);
        const { rows: [r] } = await db.query('SELECT public.storage_cap_for_plan($1) AS v', ['free']);
        expect(Number(r.v)).toBe(1);
        await db.close();
    });
});
