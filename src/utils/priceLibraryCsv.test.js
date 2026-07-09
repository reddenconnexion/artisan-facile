import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { suggestedSellingPrice, mapImportedRows, splitUpsert, priceLibraryCsvColumns } from './priceLibraryCsv';
import { HEADER_ALIASES, parseCsvNumber } from './quoteCsvImport';
import { buildCsv } from './csvExport';

describe('suggestedSellingPrice', () => {
    it('multiplie le prix d\'achat par le coefficient, arrondi au centime', () => {
        expect(suggestedSellingPrice(10, 1.5)).toBe(15);
        expect(suggestedSellingPrice(10.333, 1.5)).toBe(15.5);
        expect(suggestedSellingPrice('12.5', 2)).toBe(25);
    });

    it('renvoie null si prix d\'achat ou coefficient inexploitable', () => {
        expect(suggestedSellingPrice(0, 1.5)).toBeNull();
        expect(suggestedSellingPrice(10, 0)).toBeNull();
        expect(suggestedSellingPrice('', 1.5)).toBeNull();
        expect(suggestedSellingPrice(10, null)).toBeNull();
    });
});

describe('mapImportedRows', () => {
    it('reconnaît les alias de prix d\'achat et les nombres français', () => {
        const { rows } = mapImportedRows([
            { Description: 'Câble R2V 3G2.5', "Prix d'achat": '0,85', Prix: '1,50', 'Unité': 'ml' },
            { Description: 'Disjoncteur 16A', 'Achat': '8,20 €', Prix: '15' },
            { Description: 'Gaine ICTA 20', 'PA': '1 234,56 €', Prix: '2000' },
        ]);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ description: 'Câble R2V 3G2.5', buying_price: 0.85, price: 1.5, unit: 'ml' });
        expect(rows[1].buying_price).toBe(8.2);
        expect(rows[2].buying_price).toBe(1234.56);
    });

    it('calcule le prix de vente par coefficient quand seul le prix d\'achat est fourni', () => {
        const { rows } = mapImportedRows(
            [{ Description: 'Parafoudre T2', "Prix d'achat": '60' }],
            { coefficient: 1.5 }
        );
        expect(rows[0]).toMatchObject({ buying_price: 60, price: 90 });
    });

    it('laisse le prix de vente du fichier prioritaire sur le calcul', () => {
        const { rows } = mapImportedRows(
            [{ Description: 'Spot LED', "Prix d'achat": '10', Prix: '22' }],
            { coefficient: 1.5 }
        );
        expect(rows[0].price).toBe(22);
    });

    it('ignore les lignes sans prix exploitable et les acomptes', () => {
        const { rows, skipped } = mapImportedRows([
            { Description: 'Sans prix' },
            { Description: 'Acompte 30%', Prix: '500' },
            { Description: 'Valide', Prix: '10' },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toBe('Valide');
        expect(skipped).toBe(2);
    });

    it('mappe « Référence » vers la colonne reference du catalogue (pas une note interne)', () => {
        const { rows } = mapImportedRows([
            { Description: 'Différentiel 40A type A', Prix: '95', 'Référence': 'R9ERA240', 'EAN': '3606480' },
        ]);
        expect(rows[0]).toMatchObject({ reference: 'R9ERA240', barcode: '3606480' });
    });

    it('normalise le type Matériel / Main d\'oeuvre', () => {
        const { rows } = mapImportedRows([
            { Description: 'Tableau 3 rangées', Prix: '120', Type: 'Matériel' },
            { Description: 'Pose tableau', Prix: '300', Type: "Main d'oeuvre" },
            { Description: 'Sans type', Prix: '10' },
        ]);
        expect(rows[0].type).toBe('material');
        expect(rows[1].type).toBe('service');
        expect(rows[2].type).toBe('');
    });
});

describe('splitUpsert', () => {
    const existing = [
        { id: 1, user_id: 'u1', description: 'Câble R2V 3G2.5', price: 1.5, buying_price: 0.8, unit: 'ml', category: '', barcode: '', reference: '', stock_quantity: 40 },
        { id: 2, user_id: 'u1', description: 'Disjoncteur 16A', price: 15, buying_price: 0, unit: 'u', category: '', barcode: '360111', reference: 'A9F77616' },
    ];

    it('matche par code-barres puis référence puis description', () => {
        const { toInsert, toUpdate } = splitUpsert([
            { description: 'Autre libellé', price: 18, buying_price: 8, unit: '', category: '', type: '', barcode: '360111', reference: '' },
            { description: 'câble r2v 3g2.5', price: 1.5, buying_price: 0.9, unit: '', category: '', type: '', barcode: '', reference: '' },
            { description: 'Nouveau produit', price: 5, buying_price: 2, unit: '', category: '', type: '', barcode: '', reference: '' },
        ], existing, 'u1');

        expect(toUpdate).toHaveLength(2);
        expect(toUpdate[0].id).toBe(2); // matché par EAN malgré la description différente
        expect(toUpdate[0].buying_price).toBe(8);
        expect(toUpdate[1].id).toBe(1); // matché par description insensible à la casse
        expect(toUpdate[1].buying_price).toBe(0.9);
        expect(toInsert).toHaveLength(1);
        expect(toInsert[0]).toMatchObject({ user_id: 'u1', description: 'Nouveau produit', unit: 'unité' });
    });

    it('ne remet jamais à zéro un prix d\'achat connu et préserve le stock', () => {
        const { toUpdate } = splitUpsert([
            { description: 'Câble R2V 3G2.5', price: 2, buying_price: 0, unit: '', category: '', type: '', barcode: '', reference: '' },
        ], existing, 'u1');
        expect(toUpdate).toHaveLength(1);
        expect(toUpdate[0].buying_price).toBe(0.8);
        expect(toUpdate[0].price).toBe(2);
        expect(toUpdate[0].stock_quantity).toBe(40);
        expect(toUpdate[0].user_id).toBe('u1');
    });

    it('n\'émet pas de mise à jour quand rien ne change', () => {
        const { toInsert, toUpdate } = splitUpsert([
            { description: 'Câble R2V 3G2.5', price: 1.5, buying_price: 0.8, unit: '', category: '', type: '', barcode: '', reference: '' },
        ], existing, 'u1');
        expect(toInsert).toHaveLength(0);
        expect(toUpdate).toHaveLength(0);
    });

    it('déduplique les lignes du fichier sur la même clé', () => {
        const { toInsert } = splitUpsert([
            { description: 'Produit X', price: 5, buying_price: 0, unit: '', category: '', type: '', barcode: '', reference: '' },
            { description: 'produit x', price: 6, buying_price: 0, unit: '', category: '', type: '', barcode: '', reference: '' },
        ], [], 'u1');
        expect(toInsert).toHaveLength(1);
    });
});

describe('round-trip export → import', () => {
    it('un CSV exporté puis réimporté met à jour sans dupliquer ni perdre de valeurs', () => {
        const items = [
            { description: 'Différentiel 40A type A', reference: 'R9ERA240', barcode: '3606480', buying_price: 42.5, price: 95, unit: 'u', category: 'Tableau', type: 'material' },
            { description: 'Pose tableau complet', reference: '', barcode: '', buying_price: 0, price: 350, unit: 'forfait', category: '', type: 'service' },
        ];
        const csv = buildCsv(items, priceLibraryCsvColumns);
        const parsed = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
        const { rows } = mapImportedRows(parsed.data);

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            description: 'Différentiel 40A type A',
            reference: 'R9ERA240',
            barcode: '3606480',
            buying_price: 42.5,
            price: 95,
            unit: 'u',
            category: 'Tableau',
            type: 'material',
        });
        expect(rows[1]).toMatchObject({ description: 'Pose tableau complet', buying_price: 0, price: 350, type: 'service' });

        // Réimport tel quel = aucun changement, aucune duplication
        const { toInsert, toUpdate } = splitUpsert(rows, items.map((it, i) => ({ id: i, user_id: 'u1', ...it })), 'u1');
        expect(toInsert).toHaveLength(0);
        expect(toUpdate).toHaveLength(0);
    });
});

describe('contrat partagé avec quoteCsvImport', () => {
    it('HEADER_ALIASES et parseCsvNumber restent exportés avec les clés attendues', () => {
        expect(typeof parseCsvNumber).toBe('function');
        for (const key of ['description', 'price', 'buying_price', 'unit']) {
            expect(Array.isArray(HEADER_ALIASES[key])).toBe(true);
        }
        expect(HEADER_ALIASES.buying_price).toContain("prix d'achat");
    });
});
