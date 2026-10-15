// Garde-fou RLS : chaque table créée dans supabase/migrations ou supabase/legacy
// doit avoir la sécurité par ligne activée, et aucune politique « tout passe »
// (USING (true) / WITH CHECK (true)) ne doit apparaître sans avoir été décidée.
// Analyse statique du SQL : rapide, sans base de données.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

const DIRS = ['supabase/migrations', 'supabase/legacy'];

// Tables volontairement sans RLS (à justifier ici, avec la raison).
const TABLES_WITHOUT_RLS = new Set([]);

// Fichiers contenant une politique permissive connue et assumée.
//  - supabase_schema.sql : politique profils publique d'origine, remplacée par
//    20260313100000_fix_profiles_rls_select.sql.
//  - 20260313100000… : cite l'ancienne politique dans un commentaire.
//  - fix_security_vulnerabilities.sql : insertion libre dans access_logs d'origine,
//    restreinte ensuite par 20260928120500….
//  - 20260928120500… : cite l'ancien WITH CHECK (true) dans un commentaire, puis
//    pose une condition « utilisateur authentifié » sur access_logs.
const PERMISSIVE_ALLOWED = new Set([
    'supabase_schema.sql',
    'fix_security_vulnerabilities.sql',
    '20260313100000_fix_profiles_rls_select.sql',
    '20260928120500_restrict_access_logs_insert_to_authenticated.sql',
]);

const files = DIRS.flatMap((dir) =>
    readdirSync(path.join(cwd(), dir))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => ({ name: f, sql: readFileSync(path.join(cwd(), dir, f), 'utf8') })),
);

const IDENT = '"?([a-z_0-9]+)"?';
const found = (re) => new Set(files.flatMap((f) => [...f.sql.matchAll(re)].map((m) => m[1].toLowerCase())));

const created = found(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${IDENT}`, 'gi'));
const withRls = found(
    new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?${IDENT}\\s+enable\\s+row\\s+level\\s+security`, 'gi'),
);

describe('Couverture RLS du schéma', () => {
    it('trouve bien les tables (le test ne tourne pas à vide)', () => {
        expect(created.size).toBeGreaterThan(20);
        expect(withRls.size).toBeGreaterThan(20);
    });

    it('toutes les tables ont la RLS activée', () => {
        const missing = [...created].filter((t) => !withRls.has(t) && !TABLES_WITHOUT_RLS.has(t)).sort();
        expect(missing, `Tables sans « ENABLE ROW LEVEL SECURITY » : ${missing.join(', ')}`).toEqual([]);
    });

    it('aucune politique permissive USING (true) / WITH CHECK (true) non déclarée', () => {
        const offenders = files
            .filter((f) => /(using|with\s+check)\s*\(\s*true\s*\)/i.test(f.sql))
            .map((f) => f.name)
            .filter((n) => !PERMISSIVE_ALLOWED.has(n));
        expect(offenders, `Politique permissive à justifier : ${offenders.join(', ')}`).toEqual([]);
    });
});
