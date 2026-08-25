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

    it('reprend les colonnes Réserve et Notes dans les notes du devis', () => {
        const csv = [
            'Description;Prix;Réserve;Notes',
            'Dépose tableau;150;Sous réserve d\'accès aux combles;Acompte 30 % à la commande',
            'Pose tableau;350;;',
        ].join('\n');
        const { items, notes } = parseQuoteCsv(csv);
        expect(items).toHaveLength(2);
        expect(notes).toBe('Acompte 30 % à la commande\n\nRéserves :\n- Sous réserve d\'accès aux combles');
    });

    it('dédoublonne une réserve recopiée sur chaque ligne', () => {
        const csv = [
            'Description;Prix;Réserve',
            'Pose;35;Sous réserve de la conformité de la terre',
            'Câblage;42;Sous réserve de la conformité de la terre',
            'Raccordement;60;sous réserve de la conformité de la terre',
        ].join('\n');
        const { notes } = parseQuoteCsv(csv);
        expect(notes).toBe('Réserves :\n- Sous réserve de la conformité de la terre');
    });

    it('traite les lignes Type = réserve / note comme du texte, pas comme des prestations', () => {
        const csv = [
            'Description;Prix;Type',
            'Pose tableau;350;Main d\'œuvre',
            'Sous réserve de la section du câble d\'alimentation;;réserve',
            'Devis valable 30 jours;;Note',
        ].join('\n');
        const { items, notes, skipped } = parseQuoteCsv(csv);
        expect(items).toHaveLength(1);
        expect(items[0].description).toBe('Pose tableau');
        expect(skipped).toBe(0);
        expect(notes).toBe('Devis valable 30 jours\n\nRéserves :\n- Sous réserve de la section du câble d\'alimentation');
    });

    it('lit un bloc de réserves posé sous le tableau, sans description', () => {
        const csv = [
            'Description;Prix;Réserve',
            'Pose;35;',
            ';;Sous réserve de la présence d\'amiante',
        ].join('\n');
        const { items, notes, skipped } = parseQuoteCsv(csv);
        expect(items).toHaveLength(1);
        expect(skipped).toBe(0);
        expect(notes).toBe('Réserves :\n- Sous réserve de la présence d\'amiante');
    });

    it('garde « Note » au singulier en note interne privée de la ligne', () => {
        const csv = 'Description;Prix;Note\nDisjoncteur 16A;12;réf DIS-16A-LEG\n';
        const { items, notes } = parseQuoteCsv(csv);
        expect(items[0].internal_note).toBe('réf DIS-16A-LEG');
        expect(notes).toBe('');
    });

    it('renvoie des notes vides quand le CSV n\'en contient pas', () => {
        const { notes } = parseQuoteCsv('Description;Prix\nPose;35\n');
        expect(notes).toBe('');
    });

    // Les en-têtes ci-dessous sont ceux de l'export « Détail des lignes » de
    // DevisList.jsx : un fichier sorti d'Artisan Facile doit pouvoir y rentrer.
    it('réimporte un export Artisan Facile sans rien perdre', () => {
        const NOTES = '"Acompte 30 %\n\nRéserves :\n- Sous réserve d\'accès aux combles"';
        const csv = [
            'Référence;Type document;Statut;Date;Client;Objet;Type de ligne;Description;Quantité;Unité;Prix unitaire HT;Prix d\'achat HT;Total ligne HT;Notes;Lot;Option',
            `DEV-2026-001;Devis;Envoyé;09/08/2026;Dupont;Tableau;Main d'œuvre;Dépose ancien tableau;1;forfait;150,00;0,00;150,00;${NOTES};Tableau;`,
            `DEV-2026-001;Devis;Envoyé;09/08/2026;Dupont;Tableau;Matériel;Tableau 3 rangées;1;u;280,50;180,00;280,50;${NOTES};Tableau;`,
            `DEV-2026-001;Devis;Envoyé;09/08/2026;Dupont;Tableau;Matériel;Parafoudre;1;u;95,00;60,00;95,00;${NOTES};Extérieur;Oui`,
        ].join('\n');
        const { items, notes, error } = parseQuoteCsv(csv);
        expect(error).toBeNull();
        // Les lots reviennent en lignes de section, à leur place dans l'ordre
        expect(items.map((i) => [i.type, i.description])).toEqual([
            ['section', 'Tableau'],
            ['service', 'Dépose ancien tableau'],
            ['material', 'Tableau 3 rangées'],
            ['section', 'Extérieur'],
            ['material', 'Parafoudre'],
        ]);
        expect(items[1]).toMatchObject({ unit: 'forfait', price: 150 });
        expect(items[2]).toMatchObject({ price: 280.5, buying_price: 180 });
        // L'option redevient une option, pas une ligne ferme
        expect(items[4]).toMatchObject({ price: 95, buying_price: 60, is_optional: true });
        expect(items[1].is_optional).toBeUndefined();
        expect(items[2].is_optional).toBeUndefined();
        // Notes et réserves recopiées sur chaque ligne : une seule reprise
        expect(notes).toBe('Acompte 30 %\n\nRéserves :\n- Sous réserve d\'accès aux combles');
        // « Référence » y est le n° du devis : ne tatoue pas la note interne
        expect(items.every((i) => i.internal_note === undefined)).toBe(true);
    });

    it('garde la réf fournisseur en note interne dans un fichier de chiffrage', () => {
        // Mêmes en-têtes Référence, mais sans les colonnes de document :
        // c'est un chiffrage préparé au tableur, pas un export Artisan Facile.
        const csv = 'Description;Prix;Référence\nDisjoncteur 16A;12;123elec réf DIS-16A-LEG\n';
        const { items } = parseQuoteCsv(csv);
        expect(items[0].internal_note).toBe('123elec réf DIS-16A-LEG');
    });

    it('bascule sur la note interne explicite quand la Référence est celle du document', () => {
        const csv = [
            'Référence;Type document;Description;Prix;Note interne',
            'DEV #12;Devis;Pose tableau;350;peigne vertical fourni',
        ].join('\n');
        const { items } = parseQuoteCsv(csv);
        expect(items[0].internal_note).toBe('peigne vertical fourni');
    });

    it('signale les en-têtes reconnus (headerless = false)', () => {
        const { headerless } = parseQuoteCsv('Description;Prix\nPose;35\n');
        expect(headerless).toBe(false);
    });

    it('lit une sélection de cellules collée depuis Excel, sans en-têtes', () => {
        // Ce que le presse-papiers d'Excel dépose : des colonnes séparées par des tabulations
        const pasted = [
            "Dépose ancien tableau\t1\tforfait\t150",
            'Tableau 3 rangées\t1\tu\t280,50',
            'Tirage de câbles\t45\tml\t4,20',
        ].join('\n');
        const { items, headerless, error } = parseQuoteCsv(pasted);
        expect(error).toBeNull();
        expect(headerless).toBe(true);
        expect(items).toHaveLength(3);
        expect(items[0]).toMatchObject({ description: 'Dépose ancien tableau', quantity: 1, unit: 'forfait', price: 150 });
        expect(items[2]).toMatchObject({ description: 'Tirage de câbles', quantity: 45, unit: 'ml', price: 4.2 });
    });

    it('sans en-têtes, une seule colonne de chiffres est le prix', () => {
        const { items } = parseQuoteCsv('Pose applique;45\nRemplacement interrupteur;28\n');
        expect(items[0]).toMatchObject({ description: 'Pose applique', quantity: 1, price: 45 });
        expect(items[1]).toMatchObject({ description: 'Remplacement interrupteur', price: 28 });
    });

    it('sans en-têtes, écarte la colonne Total (Qté × PU) au lieu d\'en faire un prix d\'achat', () => {
        const pasted = [
            'Prise 2P+T;4;18,50;74',
            'Interrupteur va-et-vient;2;12,00;24',
        ].join('\n');
        const { items } = parseQuoteCsv(pasted);
        expect(items[0]).toMatchObject({ quantity: 4, price: 18.5, buying_price: 0 });
        expect(items[1]).toMatchObject({ quantity: 2, price: 12, buying_price: 0 });
    });

    it('retire une ligne d\'en-têtes non reconnue au lieu de l\'importer', () => {
        const csv = 'Poste;Nb;PU\nPose luminaire;3;40\nDépose;1;60\n';
        const { items, headerless } = parseQuoteCsv(csv);
        expect(headerless).toBe(true);
        expect(items.map((i) => i.description)).toEqual(['Pose luminaire', 'Dépose']);
        expect(items[0]).toMatchObject({ quantity: 3, price: 40 });
    });

    it('sans en-têtes, ignore une colonne de numérotation en tête de tableau', () => {
        const pasted = '1;Pose prise;4;18,50\n2;Pose interrupteur;2;12\n';
        const { items } = parseQuoteCsv(pasted);
        expect(items[0]).toMatchObject({ description: 'Pose prise', quantity: 4, price: 18.5 });
        expect(items[1]).toMatchObject({ description: 'Pose interrupteur', quantity: 2, price: 12 });
    });

    it('sans en-têtes, reconnaît une colonne Type (Matériel / Main d\'œuvre)', () => {
        const pasted = [
            'Disjoncteur 16A;Matériel;4;12',
            'Pose et raccordement;Main d\'œuvre;2;45',
        ].join('\n');
        const { items } = parseQuoteCsv(pasted);
        expect(items[0]).toMatchObject({ description: 'Disjoncteur 16A', type: 'material', quantity: 4, price: 12 });
        expect(items[1]).toMatchObject({ type: 'service', quantity: 2, price: 45 });
    });

    it('sans en-têtes, accepte une simple liste de désignations', () => {
        const { items, error } = parseQuoteCsv('Pose de 3 prises\nRaccordement tableau\n');
        expect(error).toBeNull();
        expect(items.map((i) => i.description)).toEqual(['Pose de 3 prises', 'Raccordement tableau']);
        expect(items[0]).toMatchObject({ quantity: 1, unit: 'u', price: 0 });
    });

    it('refuse un tableau de chiffres sans aucune désignation', () => {
        const { error } = parseQuoteCsv('12;1\n18;2\n');
        expect(error).toMatch(/Description/);
    });

    it('génère des ids uniques', () => {
        const csv = 'Description\nA\nB\nC\n';
        const { items } = parseQuoteCsv(csv);
        expect(new Set(items.map((i) => i.id)).size).toBe(3);
    });
});
