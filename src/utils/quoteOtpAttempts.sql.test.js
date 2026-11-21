// Limite d'essais sur le code de signature : chargée dans un vrai PostgreSQL
// (PGlite) avec deux fonctions de signature factices qui contiennent la requête
// de recherche du code telle qu'elle est écrite dans les migrations d'origine.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
    path.join(cwd(), 'supabase/migrations/20261024090000_quote_otp_attempt_limit.sql'),
    'utf8',
);

const stub = (name, variable) => `
CREATE FUNCTION ${name}(otp_code text, qid bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    otp_id BIGINT;
    ${variable} RECORD;
BEGIN
    SELECT * INTO ${variable} FROM (SELECT qid AS id) q;
            SELECT qo.id INTO otp_id
            FROM quote_otps qo
            WHERE qo.quote_id    = ${variable}.id
              AND qo.otp_hash    = encode(sha256(trim(otp_code)::bytea), 'hex')
              AND qo.used_at     IS NULL
              AND qo.expires_at  > NOW()
            ORDER BY qo.created_at DESC
            LIMIT 1;
    RETURN otp_id;
END;
$$;`;

const hash = (code) => `encode(sha256('${code}'::bytea), 'hex')`;

describe('limite d\'essais du code de signature', () => {
    let db;
    beforeAll(async () => {
        db = new PGlite();
        await db.exec(`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE quotes (id bigint PRIMARY KEY);
CREATE TABLE quote_otps (
  id bigserial PRIMARY KEY,
  quote_id bigint NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
${stub('sign_public_quote', 'quote_record')}
${stub('sign_quote_via_portal', 'target_quote')}
`);
        await db.exec(migration);
        await db.exec(`INSERT INTO quote_otps (quote_id, otp_hash) VALUES (1, ${hash('123456')})`);
    });
    afterAll(() => db.close());

    const verify = async (fn, code) =>
        (await db.query(`SELECT ${fn}($1, 1) AS id`, [code])).rows[0].id;

    it('accepte le bon code sur les deux fonctions', async () => {
        expect(await verify('sign_public_quote', '123456')).not.toBeNull();
        expect(await verify('sign_quote_via_portal', ' 123456 ')).not.toBeNull();
    });

    it('bloque le code après 5 essais ratés, même avec le bon code ensuite', async () => {
        for (let i = 0; i < 5; i++) expect(await verify('sign_public_quote', `00000${i}`)).toBeNull();
        expect(await verify('sign_public_quote', '123456')).toBeNull();
        expect(await verify('sign_quote_via_portal', '123456')).toBeNull();
    });

    it('un nouveau code est utilisable après le blocage', async () => {
        await db.exec(`INSERT INTO quote_otps (quote_id, otp_hash) VALUES (1, ${hash('654321')})`);
        expect(await verify('sign_public_quote', '654321')).not.toBeNull();
    });
});
