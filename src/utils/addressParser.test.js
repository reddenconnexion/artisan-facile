import { describe, it, expect } from 'vitest';
import { parseFrenchAddress, parseClientBlock } from './addressParser';

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

describe('parseClientBlock', () => {
    it('extrait le nom avant le numéro de rue (une ligne)', () => {
        expect(parseClientBlock('Jean Dupont 13 rue Robert Boulin 33230 Saint-Médard-de-Guizières')).toEqual({
            name: 'Jean Dupont',
            address: '13 rue Robert Boulin',
            postal_code: '33230',
            city: 'Saint-Médard-de-Guizières',
            phone: '',
            email: '',
        });
    });

    it('extrait le nom sur sa propre ligne (SMS multi-lignes)', () => {
        expect(parseClientBlock('Mme Martin\n5 impasse des Lilas\n33660 Porchères')).toEqual({
            name: 'Mme Martin',
            address: '5 impasse des Lilas',
            postal_code: '33660',
            city: 'Porchères',
            phone: '',
            email: '',
        });
    });

    it("ne prend pas une voie pour un nom (adresse seule)", () => {
        expect(parseClientBlock('13 rue Robert Boulin 33230 Coutras')).toEqual({
            name: '',
            address: '13 rue Robert Boulin',
            postal_code: '33230',
            city: 'Coutras',
            phone: '',
            email: '',
        });
        expect(parseClientBlock('Résidence Les Pins 13 avenue de la Gare 33500 Libourne')).toEqual({
            name: '',
            address: 'Résidence Les Pins 13 avenue de la Gare',
            postal_code: '33500',
            city: 'Libourne',
            phone: '',
            email: '',
        });
    });

    it('nettoie la virgule après le nom', () => {
        expect(parseClientBlock('Jean Dupont, 13 rue du Port 33230 Guîtres')).toEqual({
            name: 'Jean Dupont',
            address: '13 rue du Port',
            postal_code: '33230',
            city: 'Guîtres',
            phone: '',
            email: '',
        });
    });

    it('retourne null sans code postal ni téléphone ni email (collage normal)', () => {
        expect(parseClientBlock('Jean Dupont')).toBeNull();
        expect(parseClientBlock(null)).toBeNull();
    });

    it('extrait téléphone et email du bloc complet (une ligne)', () => {
        expect(parseClientBlock('Jean Dupont 13 rue Robert Boulin 33230 Coutras 06 12 34 56 78 jean.dupont@mail.fr')).toEqual({
            name: 'Jean Dupont',
            address: '13 rue Robert Boulin',
            postal_code: '33230',
            city: 'Coutras',
            phone: '06 12 34 56 78',
            email: 'jean.dupont@mail.fr',
        });
    });

    it('extrait téléphone et email sur plusieurs lignes', () => {
        expect(parseClientBlock('Mme Martin\n5 impasse des Lilas\n33660 Porchères\n0612345678\nmartin@ex.com')).toEqual({
            name: 'Mme Martin',
            address: '5 impasse des Lilas',
            postal_code: '33660',
            city: 'Porchères',
            phone: '0612345678',
            email: 'martin@ex.com',
        });
    });

    it('accepte nom + téléphone sans adresse', () => {
        expect(parseClientBlock('Jean Dupont 06 12 34 56 78')).toEqual({
            name: 'Jean Dupont',
            address: '',
            postal_code: '',
            city: '',
            phone: '06 12 34 56 78',
            email: '',
        });
    });

    it('ne confond pas un code postal commençant par 0 avec un téléphone', () => {
        expect(parseClientBlock('13 rue des Oliviers 06130 Grasse 06 12 34 56 78')).toEqual({
            name: '',
            address: '13 rue des Oliviers',
            postal_code: '06130',
            city: 'Grasse',
            phone: '06 12 34 56 78',
            email: '',
        });
    });

    it('gère le format +33', () => {
        expect(parseClientBlock('Jean Dupont +33 6 12 34 56 78')).toEqual({
            name: 'Jean Dupont',
            address: '',
            postal_code: '',
            city: '',
            phone: '+33 6 12 34 56 78',
            email: '',
        });
    });

    it('reste un collage normal si du texte inclassable subsiste', () => {
        // Un téléphone est présent mais le reste ressemble à une voie sans
        // code postal : découper perdrait de l'information.
        expect(parseClientBlock('13 rue des Pins 06 12 34 56 78')).toBeNull();
    });
});
