import { describe, it, expect } from 'vitest';
import {
    DEFAULT_MARGIN_ALERT_THRESHOLD,
    marginAlertThreshold,
    marginAlertLevel,
    chantierDocsFor,
    chantierMarginReport,
    chantierMarginReports,
    chantierMarginAlerts,
} from './chantierMargin';
import { procurementCostByQuote, spentHoursByQuote } from './realizedMargin';

// Devis 9 : 1 000 € HT — matériel prévu 350 € d'achat, 8 h de pose.
const root = {
    id: 9,
    total_ht: 1000,
    items: [
        { type: 'material', description: 'Tableau', quantity: 1, price: 600, buying_price: 350 },
        { type: 'service', description: 'Pose', unit: 'h', quantity: 8, price: 50 },
    ],
};
const signedAmendment = {
    id: 12, type: 'amendment', status: 'accepted', parent_quote_id: 9, total_ht: 200,
    items: [{ type: 'service', description: 'Prise en plus', unit: 'h', quantity: 2, price: 100 }],
};
const draftAmendment = { ...signedAmendment, id: 13, status: 'draft', total_ht: 5000 };
const amendmentAsInvoice = { ...signedAmendment, id: 14, type: 'invoice', status: 'paid', total_ht: 100 };

describe('marginAlertThreshold', () => {
    it('lit le seuil du profil', () => {
        expect(marginAlertThreshold({ margin_alert_threshold: '15' })).toBe(15);
        expect(marginAlertThreshold({ margin_alert_threshold: 0 })).toBe(0);
    });
    it('retombe sur le défaut si absent ou invalide', () => {
        expect(marginAlertThreshold(null)).toBe(DEFAULT_MARGIN_ALERT_THRESHOLD);
        expect(marginAlertThreshold({ margin_alert_threshold: '' })).toBe(DEFAULT_MARGIN_ALERT_THRESHOLD);
        expect(marginAlertThreshold({ margin_alert_threshold: 'abc' })).toBe(DEFAULT_MARGIN_ALERT_THRESHOLD);
        expect(marginAlertThreshold({ margin_alert_threshold: 120 })).toBe(DEFAULT_MARGIN_ALERT_THRESHOLD);
    });
});

describe('marginAlertLevel', () => {
    it('classe sous le seuil, à surveiller, ou correcte', () => {
        expect(marginAlertLevel(0.15, 20)).toBe('below');
        expect(marginAlertLevel(0.22, 20)).toBe('watch');
        expect(marginAlertLevel(0.30, 20)).toBe('ok');
        expect(marginAlertLevel(-0.1, 0)).toBe('below');
    });
    it('null si marge inconnue', () => {
        expect(marginAlertLevel(null, 20)).toBeNull();
    });
});

describe('chantierDocsFor', () => {
    it('garde le devis et ses avenants signés, y compris convertis en facture', () => {
        const docs = chantierDocsFor(root, [signedAmendment, draftAmendment, amendmentAsInvoice]);
        expect(docs.map((d) => d.id)).toEqual([9, 12, 14]);
    });
    it('ignore les acomptes/factures sans parent_quote_id et les avenants d’un autre chantier', () => {
        const deposit = { id: 20, type: 'invoice', status: 'paid', parent_id: 9, total_ht: 300 };
        const other = { ...signedAmendment, id: 30, parent_quote_id: 99 };
        expect(chantierDocsFor(root, [deposit, other]).map((d) => d.id)).toEqual([9]);
    });
});

describe('chantierMarginReport', () => {
    it('null tant que rien n’est réalisé', () => {
        const r = chantierMarginReport({
            root, linkedRows: [], procurementCosts: new Map(), spentHoursMap: new Map(), laborCostRate: 30,
        });
        expect(r).toBeNull();
    });

    it('rapproche achats saisis, heures pointées et devis', () => {
        const procurementCosts = procurementCostByQuote([
            { quote_id: 9, quantity: 1, buying_price: 500 },
        ]);
        const spentHoursMap = spentHoursByQuote([{ quote_id: 9, hours_spent: 12 }]);
        const r = chantierMarginReport({
            root, linkedRows: [signedAmendment], procurementCosts, spentHoursMap, laborCostRate: 30,
        });
        // CA 1 200 ; coûts : 500 achats + 12 h × 30 = 360 (devis) + 2 h × 30 = 60 (avenant, prévu)
        expect(r.revenue).toBe(1200);
        expect(r.materialCost).toBe(500);
        expect(r.laborCost).toBe(420);
        expect(r.margin).toBeCloseTo((1200 - 920) / 1200, 6);
        expect(r.level).toBe('watch') // 23 % : moins de 5 pts au-dessus du seuil de 20 %;
        expect(r.laborRateMissing).toBe(false);
    });

    it('déclenche l’alerte quand la marge passe sous le seuil', () => {
        const procurementCosts = procurementCostByQuote([{ quote_id: 9, quantity: 1, buying_price: 700 }]);
        const spentHoursMap = spentHoursByQuote([{ quote_id: 9, hours_spent: 10 }]);
        const r = chantierMarginReport({
            root, linkedRows: [], procurementCosts, spentHoursMap, laborCostRate: 30, thresholdPct: 20,
        });
        // 1 000 − (700 + 300) = 0 % de marge
        expect(r.margin).toBeCloseTo(0, 6);
        expect(r.level).toBe('below');
        expect(r.gapPts).toBe(-20);
    });

    it('signale un coût horaire manquant quand des heures sont pointées', () => {
        const spentHoursMap = spentHoursByQuote([{ quote_id: 9, hours_spent: 10 }]);
        const procurementCosts = procurementCostByQuote([{ quote_id: 9, quantity: 1, buying_price: 300 }]);
        const r = chantierMarginReport({
            root, linkedRows: [], procurementCosts, spentHoursMap, laborCostRate: 0,
        });
        expect(r.laborRateMissing).toBe(true);
    });
});

describe('chantierMarginReports / chantierMarginAlerts', () => {
    it('calcule chaque chantier et liste les alertes du pire au moins pire', () => {
        const rootB = { ...root, id: 50 };
        const rootC = { ...root, id: 60 };
        const procurementCosts = procurementCostByQuote([
            { quote_id: 9, quantity: 1, buying_price: 300 },  // marge correcte
            { quote_id: 50, quantity: 1, buying_price: 800 }, // 1000 − 800 − 8h×30 < 0
            { quote_id: 60, quantity: 1, buying_price: 650 }, // 1000 − 650 − 240 = 11 %
        ]);
        const reports = chantierMarginReports({
            roots: [root, rootB, rootC, { id: 70, total_ht: 500, items: [] }],
            linkedRows: [signedAmendment],
            procurementCosts,
            spentHoursMap: new Map(),
            laborCostRate: 30,
            thresholdPct: 20,
        });
        expect([...reports.keys()].sort()).toEqual([50, 60, 9]);
        expect(reports.get(9).revenue).toBe(1200);
        const alerts = chantierMarginAlerts([root, rootB, rootC], reports);
        expect(alerts.map((a) => a.root.id)).toEqual([50, 60]);
    });
});
