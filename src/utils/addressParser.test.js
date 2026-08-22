import { describe, it, expect } from 'vitest';
import { parseFrenchAddress } from './addressParser';

describe('parseFrenchAddress', () => {
    it('découpe une adresse complète sur une ligne', () => {
        expect(parseFrenchAddress('13 rue Robert Boulin 33230 Saint-Médard-de-Guizières')).toEqual({
            address: '13 rue Robert Boulin',
            postal_code: '33230',
            city: 'Saint-Médard-de-Guizières',
        });
    });

    it('gère les virgules et les retours à la ligne (SMS sur deux lignes)', () => {
        expect(parseFrenchAddress('5 impasse des Lilas,\n33660 Porchères')).toEqual({
            address: '5 impasse des Lilas',
            postal_code: '33660',
            city: 'Porchères',
        });
    });

    it('prend le DERNIER groupe de 5 chiffres comme code postal', () => {
        // Un numéro de voie à 5 chiffres est rarissime, mais un lieu-dit avec
        // nombre peut précéder : le code postal reste le dernier groupe.
        expect(parseFrenchAddress('12345 route de Coutras 33230 Abzac')).toEqual({
            address: '12345 route de Coutras',
            postal_code: '33230',
            city: 'Abzac',
        });
    });

    it('ignore les numéros de téléphone', () => {
        expect(parseFrenchAddress('0612345678')).toBeNull();
        // Téléphone collé après la ville dans le SMS : exclu de la ville.
        expect(parseFrenchAddress('8 rue du Port 33230 Guîtres 06 12 34 56 78')).toEqual({
            address: '8 rue du Port',
            postal_code: '33230',
            city: 'Guîtres',
        });
    });

    it('accepte code postal + ville sans rue', () => {
        expect(parseFrenchAddress('33230 Coutras')).toEqual({
            address: '',
            postal_code: '33230',
            city: 'Coutras',
        });
    });

    it('accepte rue + code postal sans ville', () => {
        expect(parseFrenchAddress('4 chemin du Moulin 33910')).toEqual({
            address: '4 chemin du Moulin',
            postal_code: '33910',
            city: '',
        });
    });

    it('retourne null sans code postal (collage normal)', () => {
        expect(parseFrenchAddress('13 rue Robert Boulin')).toBeNull();
        expect(parseFrenchAddress('')).toBeNull();
        expect(parseFrenchAddress(null)).toBeNull();
    });

    it('retourne null pour un code postal seul (rien à répartir)', () => {
        expect(parseFrenchAddress('33230')).toBeNull();
    });

    it('nettoie les tirets de séparation autour de la ville', () => {
        expect(parseFrenchAddress('2 bis avenue de la Gare - 33500 Libourne')).toEqual({
            address: '2 bis avenue de la Gare',
            postal_code: '33500',
            city: 'Libourne',
        });
    });
});
