import { describe, it, expect } from 'vitest';
import { parseFrenchAddress, parseClientBlock, parseClientSms } from './addressParser';

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

describe('parseClientSms', () => {
    it('reprend le bloc structuré tel quel', () => {
        expect(parseClientSms('Mme Martin\n5 impasse des Lilas\n33660 Porchères\n0612345678')).toEqual({
            name: 'Mme Martin',
            address: '5 impasse des Lilas',
            postal_code: '33660',
            city: 'Porchères',
            phone: '0612345678',
            email: '',
        });
    });

    it('extrait les coordonnées d’un SMS rédigé en phrases', () => {
        expect(parseClientSms("Bonjour, je suis Jean Dupont, j'habite au 13 rue du Port 33230 Coutras. Mon numéro 06 12 34 56 78. Plus de courant dans la cuisine")).toEqual({
            name: 'Jean Dupont',
            address: '13 rue du Port',
            postal_code: '33230',
            city: 'Coutras',
            phone: '06 12 34 56 78',
            email: '',
        });
    });

    it('trouve le nom en signature et une ville en plusieurs mots', () => {
        expect(parseClientSms('Bonjour, pouvez-vous passer pour un tableau qui disjoncte ?\nAdresse : 4 allée des Chênes 33230 St Médard de Guizières\nCordialement\nPaul Durand')).toEqual({
            name: 'Paul Durand',
            address: '4 allée des Chênes',
            postal_code: '33230',
            city: 'St Médard de Guizières',
            phone: '',
            email: '',
        });
    });

    it('reconnaît la civilité et l’email', () => {
        expect(parseClientSms('Bonsoir, c’est Mme Leroy pour le devis. leroy.a@gmail.com')).toEqual({
            name: 'Mme Leroy',
            address: '',
            postal_code: '',
            city: '',
            phone: '',
            email: 'leroy.a@gmail.com',
        });
    });

    it('retourne null si rien n’est reconnu', () => {
        expect(parseClientSms('ok merci à demain')).toBeNull();
        expect(parseClientSms('')).toBeNull();
    });
});

describe('parseClientSms — adresses difficiles', () => {
    it('adresse sans code postal (« à Ville »)', () => {
        const r = parseClientSms("Bonjour c'est Mme Martin, j'habite 13 rue des Lilas à Coutras. Mon tel 0612345678");
        expect(r).toMatchObject({ name: 'Mme Martin', address: '13 rue des Lilas', postal_code: '', city: 'Coutras', phone: '0612345678' });
    });

    it('adresse sans code postal ni ville', () => {
        expect(parseClientSms('Bonjour, je suis au 4 chemin de la Gravière, panne de courant')).toMatchObject({ address: '4 chemin de la Gravière' });
    });

    it('voie sans mot-clé avant le code postal (« 12 Le Bourg »)', () => {
        expect(parseClientSms('Bonjour je suis Paul Durand, 12 Le Bourg 33230 Les Églisottes. 06 12 34 56 78')).toMatchObject({
            name: 'Paul Durand', address: '12 Le Bourg', postal_code: '33230', city: 'Les Églisottes',
        });
    });
});

describe('parseClientSms — formats de SMS réels', () => {
    const cases = [
        ['13 r. Robert Boulin 33230 St Médard', { address: '13 r. Robert Boulin', postal_code: '33230', city: 'St Médard' }],
        ["Salut c'est Kevin Morel pour la prise qui chauffe. 7 Rés. les Chênes, Coutras", { name: 'Kevin Morel', address: '7 Rés. les Chênes', city: 'Coutras' }],
        ['Jean Dupont\n13 rue Robert Boulin\nSaint-Médard-de-Guizières\n0612345678', { name: 'Jean Dupont', address: '13 rue Robert Boulin', city: 'Saint-Médard-de-Guizières' }],
        ["Devis tableau électrique. 5 Lotissement les Pins 33660 Saint-Seurin-sur-l'Isle. Merci, Julie Bernard", { name: 'Julie Bernard', address: '5 Lotissement les Pins', postal_code: '33660' }],
        ["Mme Petit, 3 place de l'Église, 33230 Abzac. Tél: 05 57 49 00 00", { name: 'Mme Petit', address: "3 place de l'Église", city: 'Abzac', phone: '05 57 49 00 00' }],
    ];
    it.each(cases)('%s', (sms, expected) => {
        expect(parseClientSms(sms)).toMatchObject(expected);
    });
});

describe('parseClientSms — SMS client réel', () => {
    it('code postal avec espace, virgule après le numéro, « à Ville »', () => {
        expect(parseClientSms("Bonjour, suite à notre conversation je suis Monsieur Faure Yannick mon adresse, 55, rue de la république, 24 700 à Moulin Neuf, mon adresse mail yannfaure80@gmail.com je vous souhaite un bonne réception à vendredi.")).toEqual({
            name: 'Monsieur Faure Yannick',
            address: '55 rue de la république',
            postal_code: '24700',
            city: 'Moulin Neuf',
            phone: '',
            email: 'yannfaure80@gmail.com',
        });
    });

    it('ne recolle pas les chiffres d’un téléphone', () => {
        expect(parseClientSms('Jean Dupont 06 12 34 56 78')).toMatchObject({ phone: '06 12 34 56 78', postal_code: '' });
        expect(parseClientSms('Mme Petit 05 57 49 00 00, 3 place de la Mairie 33230 Abzac')).toMatchObject({ phone: '05 57 49 00 00', postal_code: '33230' });
    });
});
