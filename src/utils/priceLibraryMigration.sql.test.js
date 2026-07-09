// Vérifie la migration « prix d'achat » de la Bibliothèque de Prix telle
// qu'elle s'exécutera côté serveur : la colonne est créée, avec le bon défaut,
// et la migration est idempotente (rejouable sans erreur — certaines colonnes
// de price_library ayant historiquement été ajoutées hors migrations).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const MIG = path.join(cwd(), 'supabase/migrations/20260709120000_add_buying_price_to_price_library.sql');

let db;

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE TABLE public.price_library (
            id serial PRIMARY KEY,
            user_id text,
            description text NOT NULL,
            price numeric,
            unit text DEFAULT 'unité'
        );
    `);
});

afterAll(async () => {
    await db.close();
});

describe('migration add_buying_price_to_price_library', () => {
    it('ajoute la colonne buying_price avec 0 par défaut', async () => {
        await db.exec(readFileSync(MIG, 'utf8'));

        const { rows } = await db.query(`
            SELECT column_name, column_default
            FROM information_schema.columns
            WHERE table_name = 'price_library' AND column_name = 'buying_price'
        `);
        expect(rows).toHaveLength(1);
        expect(rows[0].column_default).toBe('0');

        await db.exec(`INSERT INTO public.price_library (description, price) VALUES ('Câble R2V', 1.5)`);
        const { rows: inserted } = await db.query(`SELECT buying_price FROM public.price_library`);
        expect(Number(inserted[0].buying_price)).toBe(0);
    });

    it('est idempotente (rejouable sur un schéma déjà migré)', async () => {
        await db.exec(readFileSync(MIG, 'utf8'));
        const { rows } = await db.query(`
            SELECT count(*)::int AS n FROM information_schema.columns
            WHERE table_name = 'price_library' AND column_name = 'buying_price'
        `);
        expect(rows[0].n).toBe(1);
    });
});
