import { describe, it, expect } from 'vitest';
import { checkSiret, formatSiret, isValidSiret, normalizeSiret } from './siret';

describe('normalizeSiret', () => {
    it('retire espaces, points et tirets de la saisie', () => {
        expect(normalizeSiret('925 082 885 000 29')).toBe('92508288500029');
        expect(normalizeSiret('925.082.885.00029')).toBe('92508288500029');
        expect(normalizeSiret('925-082-885-00029')).toBe('92508288500029');
        expect(normalizeSiret(null)).toBe('');
    });
});

describe('formatSiret', () => {
    it('groupe les 14 chiffres en SIREN + NIC', () => {
        expect(formatSiret('92508288500029')).toBe('925 082 885 000 29');
    });

    it('laisse une saisie incomplète telle quelle', () => {
        expect(formatSiret('925082885')).toBe('925082885');
    });
});

describe('checkSiret', () => {
    it('accepte un SIRET valide, avec ou sans espaces', () => {
        expect(checkSiret('92508288500029')).toMatchObject({ level: 'ok', siren: '925082885', nic: '00029' });
        expect(checkSiret('925 082 885 000 29').level).toBe('ok');
    });

    it('laisse passer un champ vide (le profil incomplet s\'en charge)', () => {
        expect(checkSiret('').level).toBe('empty');
        expect(checkSiret('   ').level).toBe('empty');
        expect(checkSiret(undefined).level).toBe('empty');
    });

    it('nomme l\'erreur quand on saisit le SIREN à la place du SIRET', () => {
        const result = checkSiret('925082885');
        expect(result).toMatchObject({ level: 'error', code: 'siren' });
        expect(result.message).toMatch(/SIREN/);
        expect(result.message).toMatch(/14/);
    });

    it('signale un nombre de chiffres inattendu', () => {
        expect(checkSiret('9250828850002')).toMatchObject({ level: 'error', code: 'length' });
        expect(checkSiret('925082885000299')).toMatchObject({ level: 'error', code: 'length' });
        expect(checkSiret('9250828850002').message).toMatch(/13/);
    });

    it('refuse une lettre ou un caractère parasite', () => {
        expect(checkSiret('9250828850002A')).toMatchObject({ level: 'error', code: 'chars' });
        expect(checkSiret('FR92508288500029')).toMatchObject({ level: 'error', code: 'chars' });
    });

    it('rejette 14 chiffres dont la clé de contrôle est fausse', () => {
        // Un chiffre modifié sur un SIRET pourtant bien formé
        expect(checkSiret('92508288500028')).toMatchObject({ level: 'error', code: 'checksum' });
        expect(checkSiret('12345678901234')).toMatchObject({ level: 'error', code: 'checksum' });
    });

    it('accepte les SIRET La Poste, hors règle de Luhn', () => {
        // SIREN 356 000 000 : la règle officielle y est « somme des chiffres
        // multiple de 5 » (3+5+6 = 14, il manque donc 1 modulo 5 côté NIC)
        expect(checkSiret('35600000000001').level).toBe('ok');
        expect(checkSiret('35600000000051').level).toBe('ok');
        expect(checkSiret('35600000000002')).toMatchObject({ level: 'error', code: 'checksum' });
    });
});

describe('isValidSiret', () => {
    it('résume le contrôle en booléen', () => {
        expect(isValidSiret('925 082 885 000 29')).toBe(true);
        expect(isValidSiret('925082885')).toBe(false);
        expect(isValidSiret('')).toBe(false);
    });
});
