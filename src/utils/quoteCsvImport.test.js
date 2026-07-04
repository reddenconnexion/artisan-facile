import { describe, it, expect } from 'vitest';
import { parseQuoteCsv, parseCsvNumber } from './quoteCsvImport';

describe('parseCsvNumber', () => {
    it('comprend les formats français et anglais', () => {
        expect(parseCsvNumber('1 234,56 €')).toBe(1234.56);
        expect(parseCsvNumber('12,5')).toBe(12.5);
        expect(parseCsvNumber('1,234.56')).toBe(1234.56);
        expect(parseCsvNumber('1.234,50')).toBe(1234.5);
        expect(parseCsvNumber('42')).toBe(42);
        expect(parseCsvNumber(3.5)).toBe(3.5);
    });

    it('renvoie null pour les valeurs vides ou non numériques', () => {
        expect(parseCsvNumber('')).toBeNull();
        expect(parseCsvNumber(null)).toBeNull();
        expect(parseCsvNumber('abc')).toBeNull();
    });
});

describe('parseQuoteCsv', () => {
    it('parse un CSV point-virgule avec en-têtes français', () => {
        const csv = [
            'Description;Quantité;Unité;Prix unitaire;Type',
            'Dépose ancien tableau;1;forfait;150;Main d\'œuvre',
            'Tableau 3 rangées;1;u;280,50;Matériel',
        ].join('\n');
        const { items, error } = parseQuoteCsv(csv);
        expect(error).toBeNull();
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ description: 'Dépose ancien tableau', quantity: 1, unit: 'forfait', price: 150, type: 'service' });
        expect(items[1]).toMatchObject({ description: 'Tableau 3 rangées', price: 280.5, type: 'material' });
    });

    it('détecte le séparateur virgule et les en-têtes anglais', () => {
        const csv = 'Description,Qty,Unit,Price\nCable pulling,10,ml,4.5\n';
        const { items, error } = parseQuoteCsv(csv);
        expect(error).toBeNull();
        expect(items[0]).toMatchObject({ description: 'Cable pulling', quantity: 10, unit: 'ml', price: 4.5 });
    });

    it('applique les valeurs par défaut (qté 1, unité u, prix 0, type service)', () => {
        const csv = 'Désignation\nDiagnostic installation\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0]).toMatchObject({ quantity: 1, unit: 'u', price: 0, type: 'service' });
    });

    it('insère des titres de section quand la colonne Lot change', () => {
        const csv = [
            'Lot;Description;Prix',
            'Salle de bain;Dépose existant;400',
            'Salle de bain;Receveur 90x90;250',
            'Cuisine;Crédence;240',
        ].join('\n');
        const { items } = parseQuoteCsv(csv);
        expect(items.map((i) => [i.type, i.description])).toEqual([
            ['section', 'Salle de bain'],
            ['service', 'Dépose existant'],
            ['service', 'Receveur 90x90'],
            ['section', 'Cuisine'],
            ['service', 'Crédence'],
        ]);
    });

    it('accepte les lignes de type section explicites', () => {
        const csv = 'Description;Type\nSalle de bain;section\nDépose;service\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0]).toMatchObject({ description: 'Salle de bain', type: 'section' });
        expect(items[1].type).toBe('service');
    });

    it('détecte le type matériel par mots-clés sans colonne Type', () => {
        const csv = 'Description;Prix\nFourniture carrelage sol;22\nPose;35\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0].type).toBe('material');
        expect(items[1].type).toBe('service');
    });

    it('marque les options et lit le prix d\'achat', () => {
        const csv = 'Description;Prix;Prix d\'achat;Option\nCarrelage premium;45;22;oui\nPose;35;;non\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0]).toMatchObject({ is_optional: true, buying_price: 22 });
        expect(items[1].is_optional).toBeUndefined();
        expect(items[1].buying_price).toBe(0);
    });

    it('ignore les lignes vides et les compte', () => {
        const csv = 'Description;Prix\nPose;35\n;\n;12\n';
        const { items, skipped } = parseQuoteCsv(csv);
        expect(items).toHaveLength(1);
        expect(skipped).toBeGreaterThanOrEqual(1);
    });

    it('tolère un BOM UTF-8 en tête de fichier', () => {
        const csv = '﻿Description;Prix\nPose;35\n';
        const { items, error } = parseQuoteCsv(csv);
        expect(error).toBeNull();
        expect(items).toHaveLength(1);
    });

    it('erreur claire si la colonne Description est absente', () => {
        const { error } = parseQuoteCsv('Prix;Quantité\n12;1\n');
        expect(error).toMatch(/Description/);
    });

    it('erreur claire pour un fichier vide', () => {
        expect(parseQuoteCsv('').error).toMatch(/vide/);
        expect(parseQuoteCsv(undefined).error).toMatch(/vide/);
    });

    it('ne casse pas les descriptions à virgules dans un fichier « ; »', () => {
        const csv = [
            'Description;Quantité;Prix unitaire',
            'Fourniture et pose prises, boîtes et accessoires;12;18,50',
        ].join('\n');
        const { items, error } = parseQuoteCsv(csv);
        expect(error).toBeNull();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            description: 'Fourniture et pose prises, boîtes et accessoires',
            quantity: 12,
            price: 18.5,
        });
    });

    it('respecte les champs entre guillemets (virgule dans un fichier « , »)', () => {
        const csv = 'Description,Qty,Price\n"Cabling, sockets and boxes",4,25.5\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0]).toMatchObject({ description: 'Cabling, sockets and boxes', quantity: 4, price: 25.5 });
    });

    it('respecte un « ; » à l\'intérieur d\'un champ entre guillemets', () => {
        const csv = 'Description;Prix\n"Tableau 2 rangées ; peignes verticaux";320\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0].description).toBe('Tableau 2 rangées ; peignes verticaux');
        expect(items[0].price).toBe(320);
    });

    it('lit la colonne Référence dans la note interne privée', () => {
        const csv = 'Description;Prix;Référence\nDisjoncteur 16A;12;123elec réf DIS-16A-LEG\nPose;35;\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0].internal_note).toBe('123elec réf DIS-16A-LEG');
        expect(items[1].internal_note).toBeUndefined();
    });

    it('le Type explicite prime sur la détection par mots-clés', () => {
        const csv = 'Description;Type\nPassage câbles et fournitures diverses;Main d\'œuvre\nPetit outillage;matériel\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0].type).toBe('service');
        expect(items[1].type).toBe('material');
    });

    it('génère des ids uniques', () => {
        const csv = 'Description\nA\nB\nC\n';
        const { items } = parseQuoteCsv(csv);
        expect(new Set(items.map((i) => i.id)).size).toBe(3);
    });
});
