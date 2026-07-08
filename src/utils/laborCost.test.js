import { describe, it, expect } from 'vitest';
import { computeHourlyCost, DEFAULT_BILLABLE_HOURS } from './laborCost';

describe('computeHourlyCost', () => {
    it('additionne rémunération, cotisations et charges puis divise par les heures', () => {
        const r = computeHourlyCost({
            netAnnual: 24000,
            cotisations: 11000,
            fixedCharges: 12000,
            billableHours: 1050,
        });
        expect(r.annualTotal).toBe(47000);
        expect(r.billableHours).toBe(1050);
        expect(r.hourlyCost).toBeCloseTo(44.76, 2);
    });

    it('retourne un coût nul (pas de division par zéro) si heures = 0', () => {
        const r = computeHourlyCost({ netAnnual: 30000, billableHours: 0 });
        expect(r.hourlyCost).toBe(0);
        expect(r.annualTotal).toBe(30000);
    });

    it('tolère les champs manquants ou en texte', () => {
        const r = computeHourlyCost({ netAnnual: '2000', fixedCharges: undefined, billableHours: '100' });
        expect(r.annualTotal).toBe(2000);
        expect(r.hourlyCost).toBe(20);
    });

    it('expose une valeur par défaut réaliste d\'heures facturables', () => {
        expect(DEFAULT_BILLABLE_HOURS).toBe(1200);
    });
});
