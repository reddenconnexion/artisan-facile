import { describe, it, expect } from 'vitest';
import {
    computeNetIncome,
    estimateUrssafCharges,
    estimateIncomeTax,
    DEFAULT_MATERIAL_MARGIN_RATE,
    VERSEMENT_LIBERATOIRE_RATES,
} from './netIncome';

describe('computeNetIncome — marge chantier (Figure 1)', () => {
    it('matériel pur : ne garde que la marge (25 % par défaut)', () => {
        const r = computeNetIncome({ caServices: 0, caMateriel: 1000 });
        expect(r.margeMateriel).toBe(250);
        expect(r.margeChantier).toBe(250);
    });

    it('main d\'œuvre pure : conservée à 100 %', () => {
        const r = computeNetIncome({ caServices: 800, caMateriel: 0 });
        expect(r.margeChantier).toBe(800);
    });

    it('mixte : main d\'œuvre + 25 % du matériel', () => {
        const r = computeNetIncome({ caServices: 2000, caMateriel: 1200 });
        expect(r.caTotal).toBe(3200);
        expect(r.margeMateriel).toBe(300);
        expect(r.margeChantier).toBe(2300);
    });

    it('respecte un taux de marge personnalisé', () => {
        const r = computeNetIncome({ caServices: 1000, caMateriel: 1000, materialMarginRate: 0.4 });
        expect(r.margeChantier).toBe(1400);
    });
});

describe('computeNetIncome — coûts matériel réels (Matériel à commander)', () => {
    it('sans paramètres réels, le calcul historique est inchangé', () => {
        const before = computeNetIncome({ caServices: 2000, caMateriel: 1200 });
        const after = computeNetIncome({ caServices: 2000, caMateriel: 1200, caMaterielReal: 0, realMaterialCost: 0 });
        expect(after.margeChantier).toBe(before.margeChantier);
        expect(after.margeMaterielReelle).toBe(0);
    });

    it('la part couverte bascule au réel, le forfait ne s\'applique qu\'au reste', () => {
        // 1000 € de matériel dont 600 € couverts par des achats réels à 450 €.
        const r = computeNetIncome({
            caServices: 0,
            caMateriel: 1000,
            caMaterielReal: 600,
            realMaterialCost: 450,
        });
        // forfait sur 400 € (25 % = 100) + réel 600 − 450 = 150 → 250
        expect(r.margeMaterielReelle).toBe(150);
        expect(r.margeMateriel).toBe(250);
        expect(r.margeChantier).toBe(250);
    });

    it('une marge réelle négative (achat plus cher que prévu) est conservée', () => {
        const r = computeNetIncome({
            caServices: 500,
            caMateriel: 1000,
            caMaterielReal: 1000,
            realMaterialCost: 1100,
        });
        expect(r.margeMaterielReelle).toBe(-100);
        expect(r.margeChantier).toBe(400); // 500 − 100
    });

    it('borne la part réelle au CA matériel de la période (CA corrigé à la main)', () => {
        const r = computeNetIncome({
            caServices: 0,
            caMateriel: 500,
            caMaterielReal: 800, // > CA matériel
            realMaterialCost: 300,
        });
        expect(r.caMaterielReal).toBe(500);
        expect(r.margeMateriel).toBe(200); // 0 forfait + (500 − 300)
    });
});

describe('computeNetIncome — revenu net réel (Figure 2)', () => {
    it('déduit URSSAF, charges pro et impôt de la marge chantier', () => {
        const r = computeNetIncome({
            caServices: 3000,
            caMateriel: 2000,
            urssafCharges: 900,
            proChargesForPeriod: 400,
            incomeTax: 150,
        });
        // marge chantier = 3000 + 0,25×2000 = 3500
        expect(r.margeChantier).toBe(3500);
        expect(r.revenuNet).toBe(3500 - 900 - 400 - 150);
    });

    it('sans charges ni impôt, revenu net = marge chantier (pas de double comptage matériel)', () => {
        const r = computeNetIncome({ caServices: 1000, caMateriel: 4000 });
        expect(r.revenuNet).toBe(r.margeChantier);
        expect(r.revenuNet).toBe(2000); // 1000 + 0,25×4000
    });

    it('tolère les entrées manquantes ou en texte', () => {
        const r = computeNetIncome({ caServices: '1000', caMateriel: '2000', urssafCharges: undefined });
        expect(r.margeChantier).toBe(1500);
        expect(r.revenuNet).toBe(1500);
    });
});

describe('estimateUrssafCharges', () => {
    it('calcule sur le CA total, part par part (services 21,2 % / vente 12,3 %)', () => {
        const c = estimateUrssafCharges({ caServices: 1000, caMateriel: 1000, activityType: 'mixte' });
        expect(c).toBeCloseTo(1000 * 0.212 + 1000 * 0.123, 6);
    });

    it('applique les taux ACRE quand hasAcre', () => {
        const c = estimateUrssafCharges({ caServices: 1000, caMateriel: 0, activityType: 'services', hasAcre: true });
        expect(c).toBeCloseTo(1000 * 0.106, 6);
    });

    it('libéral : tout le CA au taux libéral', () => {
        const c = estimateUrssafCharges({ caServices: 2000, caMateriel: 0, activityType: 'liberal' });
        expect(c).toBeCloseTo(2000 * 0.256, 6);
    });

    it('retourne null hors micro-entreprise', () => {
        expect(estimateUrssafCharges({ caServices: 1000, status: 'sasu' })).toBeNull();
    });
});

describe('estimateIncomeTax', () => {
    it('versement libératoire : % du CA par part', () => {
        const t = estimateIncomeTax({ caServices: 1000, caMateriel: 1000, activityType: 'mixte' });
        expect(t).toBeCloseTo(
            1000 * VERSEMENT_LIBERATOIRE_RATES.services + 1000 * VERSEMENT_LIBERATOIRE_RATES.vente,
            6,
        );
    });

    it('barème : taxable après abattement × TMI', () => {
        const t = estimateIncomeTax({ caServices: 1000, caMateriel: 0, activityType: 'services', method: 'bareme', tmi: 0.11 });
        // abattement services = 50 % → taxable = 500 → impôt = 55
        expect(t).toBeCloseTo(55, 6);
    });

    it('barème : la TMI choisie est bien prise en compte', () => {
        const t = estimateIncomeTax({ caServices: 1000, caMateriel: 0, activityType: 'services', method: 'bareme', tmi: 0.30 });
        // taxable = 500 → impôt = 150 à 30 %
        expect(t).toBeCloseTo(150, 6);
    });

    it('les deux méthodes donnent des résultats différents (sanity check)', () => {
        const vl = estimateIncomeTax({ caServices: 5000, activityType: 'services', method: 'versement_liberatoire' });
        const bar = estimateIncomeTax({ caServices: 5000, activityType: 'services', method: 'bareme' });
        expect(vl).not.toBeCloseTo(bar, 2);
    });
});

describe('constantes', () => {
    it('marge matériel par défaut = 25 %', () => {
        expect(DEFAULT_MATERIAL_MARGIN_RATE).toBe(0.25);
    });
});
