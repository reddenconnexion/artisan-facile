import { describe, it, expect } from 'vitest';
import { materialDepositAmounts, quoteLineAmount, depositMaterialItems, depositAmendmentShare, amendmentsTotalTTC } from './materialDeposit';

// Cas réel (devis n° 226) : main d'œuvre 580 € + fournitures fermes 1118,35 €
// + une option non retenue à 190 €, sans TVA (art. 293 B du CGI).
// Le total ferme exclut l'option (1698,35 €) ; l'acompte doit l'exclure aussi,
// sinon le solde affiché (total − acompte) ne retombe pas sur la main d'œuvre.
const devis226 = {
    include_tva: false,
    total_ht: 1698.35,
    total_tva: 0,
    total_ttc: 1698.35,
    has_material_deposit: true,
    items: [
        { type: 'service', description: "Main d'œuvre", quantity: 1, price: 580 },
        { type: 'material', description: 'Fournitures', quantity: 1, price: 1118.35 },
        { type: 'material', description: 'Reprise de la prise de terre', quantity: 1, price: 190, is_optional: true },
    ],
};

describe('materialDepositAmounts', () => {
    it("exclut les fournitures optionnelles : le solde retombe sur la main d'œuvre (devis 226)", () => {
        const amounts = materialDepositAmounts(devis226);
        expect(amounts.materialTTC).toBeCloseTo(1118.35, 2);
        expect(amounts.balanceTTC).toBeCloseTo(580, 2);
    });

    it('applique la TVA effective déduite des totaux quand le devis est TTC', () => {
        const amounts = materialDepositAmounts({
            include_tva: true,
            total_ht: 1000,
            total_tva: 200,
            total_ttc: 1200,
            items: [
                { type: 'service', quantity: 10, price: 40 },
                { type: 'material', quantity: 2, price: 300 },
            ],
        });
        expect(amounts.materialTTC).toBeCloseTo(720, 2); // 600 HT × 1,20
        expect(amounts.balanceTTC).toBeCloseTo(480, 2); // main d'œuvre TTC
    });

    it('retourne null quand toutes les fournitures sont optionnelles (rien à provisionner)', () => {
        expect(materialDepositAmounts({
            include_tva: false,
            total_ht: 500,
            total_tva: 0,
            total_ttc: 500,
            items: [
                { type: 'service', quantity: 1, price: 500 },
                { type: 'material', quantity: 1, price: 190, is_optional: true },
            ],
        })).toBeNull();
    });

    it('retourne null sans aucune fourniture', () => {
        expect(materialDepositAmounts({ items: [{ type: 'service', quantity: 1, price: 100 }] })).toBeNull();
        expect(materialDepositAmounts({})).toBeNull();
    });

    it('ne laisse jamais le solde négatif', () => {
        const amounts = materialDepositAmounts({
            include_tva: false,
            total_ht: 100,
            total_tva: 0,
            total_ttc: 100,
            items: [{ type: 'material', quantity: 1, price: 150 }],
        });
        expect(amounts.balanceTTC).toBe(0);
    });
});

describe('quoteLineAmount', () => {
    it('utilise line_total pour les postes fusionnés (mode poste global)', () => {
        expect(quoteLineAmount({ line_total: '250.50' })).toBeCloseTo(250.5, 2);
    });
    it('calcule quantité × prix sinon', () => {
        expect(quoteLineAmount({ quantity: 3, price: 10 })).toBe(30);
    });
});

describe('depositMaterialItems', () => {
    const material = (description, price, extra = {}) => ({
        type: 'material', description, quantity: 1, price, ...extra,
    });
    const labour = (description, price) => ({ type: 'service', description, quantity: 1, price });

    it("retient les fournitures fermes du devis et écarte main d'œuvre et options", () => {
        const items = depositMaterialItems(
            [material('Coffret', 136), labour('Pose', 200), material('Piquet', 125, { is_optional: true })],
            [],
        );
        expect(items.map(i => i.description)).toEqual(['Coffret']);
    });

    // Un avenant signé engage le client : ses fournitures sont à acheter comme
    // les autres, et la facture de clôture les reprend déjà.
    it('ajoute les fournitures des avenants signés, étiquetées', () => {
        const items = depositMaterialItems(
            [material('Coffret', 136)],
            [{ type: 'amendment', status: 'accepted', quote_number: 236, items: [material('Terre hangar', 80)] }],
        );
        expect(items.map(i => [i.description, i.amendmentLabel])).toEqual([
            ['Coffret', undefined],
            ['Terre hangar', 'Avenant n°236'],
        ]);
    });

    it("ignore un avenant non signé : rien n'y est dû", () => {
        const items = depositMaterialItems(
            [material('Coffret', 136)],
            [{ type: 'amendment', status: 'draft', quote_number: 236, items: [material('Terre hangar', 80)] }],
        );
        expect(items).toHaveLength(1);
    });

    it("ignore les factures liées, qui ne sont pas des fournitures à provisionner", () => {
        const items = depositMaterialItems(
            [material('Coffret', 136)],
            [{ type: 'invoice', status: 'billed', items: [material('Acompte', 500)] }],
        );
        expect(items).toHaveLength(1);
    });

    it('écarte aussi les options non retenues portées par un avenant', () => {
        const items = depositMaterialItems(
            [],
            [{ type: 'amendment', status: 'paid', quote_number: 12, items: [material('Option', 90, { is_optional: true })] }],
        );
        expect(items).toEqual([]);
    });

    it('retombe sur le titre quand l’avenant n’a pas encore de numéro', () => {
        const items = depositMaterialItems(
            [],
            [{ type: 'amendment', status: 'accepted', title: 'Avenant tranchée', items: [material('Câble', 40)] }],
        );
        expect(items[0].amendmentLabel).toBe('Avenant tranchée');
    });

    it('accepte un devis sans document lié', () => {
        expect(depositMaterialItems([material('Coffret', 136)], null)).toHaveLength(1);
        expect(depositMaterialItems(null, null)).toEqual([]);
    });
});

describe('depositAmendmentShare', () => {
    const fromAmendment = (price, label) => ({
        type: 'material', quantity: 1, price, amendmentLabel: label,
    });

    // Le cas du devis 223 : 80 € + 50 € de fournitures portées par l'avenant.
    it("somme la part venant des avenants et liste-les sans doublon", () => {
        const share = depositAmendmentShare([
            { type: 'material', quantity: 1, price: 1356.91 },
            fromAmendment(80, 'Avenant n°236'),
            fromAmendment(50, 'Avenant n°236'),
        ]);
        expect(share.totalHT).toBe(130);
        expect(share.labels).toEqual(['Avenant n°236']);
    });

    it('renvoie une part nulle sans avenant', () => {
        expect(depositAmendmentShare([{ type: 'material', quantity: 1, price: 100 }]))
            .toEqual({ totalHT: 0, labels: [] });
    });
});

describe('amendmentsTotalTTC', () => {
    const amendment = (total_ttc, status = 'accepted') => ({ type: 'amendment', status, total_ttc });

    // Le cas du devis 223 : 2 181,91 € de devis + un avenant signé de 230 €,
    // soit une assiette de 2 411,91 € pour l'acompte en pourcentage.
    it('somme les totaux TTC des avenants signés', () => {
        expect(amendmentsTotalTTC([amendment(230)])).toBe(230);
        expect(amendmentsTotalTTC([amendment(230), amendment(120, 'paid')])).toBe(350);
    });

    it("ignore un avenant non signé : il n'engage pas encore le client", () => {
        expect(amendmentsTotalTTC([amendment(230, 'draft'), amendment(90, 'sent')])).toBe(0);
    });

    it('ignore les factures liées, déjà déduites par ailleurs', () => {
        expect(amendmentsTotalTTC([{ type: 'invoice', status: 'billed', total_ttc: 1356.91 }])).toBe(0);
    });

    // Un avenant de moins-value réduit le chantier : l'assiette doit suivre.
    it("prend en compte un avenant négatif", () => {
        expect(amendmentsTotalTTC([amendment(230), amendment(-80)])).toBe(150);
    });

    it('accepte une liste vide ou absente', () => {
        expect(amendmentsTotalTTC([])).toBe(0);
        expect(amendmentsTotalTTC(null)).toBe(0);
    });

    it('traite un total manquant ou illisible comme nul', () => {
        expect(amendmentsTotalTTC([amendment(null), amendment(undefined), amendment(230)])).toBe(230);
    });
});
