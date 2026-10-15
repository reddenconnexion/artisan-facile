import { describe, expect, it } from 'vitest';
import {
    formatTotpSecret,
    isValidTotpCode,
    needsMfaChallenge,
    pickVerifiedTotpFactor,
    sanitizeTotpCode,
    unverifiedTotpFactors,
} from './mfa';

describe('sanitizeTotpCode', () => {
    it('garde les chiffres, retire espaces et lettres, limite à 6', () => {
        expect(sanitizeTotpCode('123 456')).toBe('123456');
        expect(sanitizeTotpCode('12a3-4')).toBe('1234');
        expect(sanitizeTotpCode('12345678')).toBe('123456');
        expect(sanitizeTotpCode(null)).toBe('');
    });
});

describe('isValidTotpCode', () => {
    it('exige exactement 6 chiffres', () => {
        expect(isValidTotpCode('123456')).toBe(true);
        expect(isValidTotpCode('12345')).toBe(false);
        expect(isValidTotpCode('12345a')).toBe(false);
    });
});

describe('needsMfaChallenge', () => {
    it('demande le code seulement si un facteur est vérifié et la session en aal1', () => {
        expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true);
    });
    it('ne demande rien sans double authentification activée', () => {
        expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(false);
    });
    it('ne redemande pas le code une fois la session en aal2', () => {
        expect(needsMfaChallenge({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false);
    });
    it('ne bloque pas sur une réponse absente', () => {
        expect(needsMfaChallenge(null)).toBe(false);
        expect(needsMfaChallenge(undefined)).toBe(false);
    });
});

describe('facteurs TOTP', () => {
    const factors = {
        totp: [{ id: 'v', status: 'verified' }],
        all: [
            { id: 'v', factor_type: 'totp', status: 'verified' },
            { id: 'u', factor_type: 'totp', status: 'unverified' },
            { id: 'p', factor_type: 'phone', status: 'unverified' },
        ],
    };
    it('retrouve le facteur vérifié', () => {
        expect(pickVerifiedTotpFactor(factors).id).toBe('v');
        expect(pickVerifiedTotpFactor({ totp: [], all: [] })).toBeNull();
        expect(pickVerifiedTotpFactor(null)).toBeNull();
    });
    it('liste uniquement les facteurs TOTP abandonnés', () => {
        expect(unverifiedTotpFactors(factors).map((f) => f.id)).toEqual(['u']);
        expect(unverifiedTotpFactors(null)).toEqual([]);
    });
});

describe('formatTotpSecret', () => {
    it('groupe la clé par blocs de 4', () => {
        expect(formatTotpSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
        expect(formatTotpSecret('')).toBe('');
    });
});
