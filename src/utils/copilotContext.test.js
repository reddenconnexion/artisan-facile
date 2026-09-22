import { describe, it, expect } from 'vitest';
import { buildDashboardCopilotFacts, buildQuoteCopilotFacts, quotesToFollowUp } from './copilotContext';

const NOW = new Date('2026-09-22T12:00:00');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const text = (facts) => facts.join('\n');

describe('buildDashboardCopilotFacts', () => {
    const quotes = [
        { id: 1, type: 'invoice', status: 'paid', total_ttc: 1200, date: '2026-09-05', clients: { name: 'Martin' } },
        { id: 2, type: 'invoice', status: 'paid', total_ttc: 800, date: '2026-08-20', clients: { name: 'Durand' } },
        { id: 3, type: 'quote', status: 'sent', total_ttc: 3500, date: daysAgo(12), quote_number: 'D-012', title: 'Rénovation tableau', clients: { name: 'Petit' } },
        { id: 4, type: 'quote', status: 'sent', total_ttc: 450, date: daysAgo(3), clients: { name: 'Récent' } },
        { id: 5, type: 'quote', status: 'sent', total_ttc: 900, date: daysAgo(20), last_followup_at: daysAgo(2), clients: { name: 'DéjàRelancé' } },
        { id: 6, type: 'invoice', status: 'billed', total_ttc: 640, date: daysAgo(40), invoice_number: 'F-007', clients: { name: 'Lent' } },
        { id: 7, type: 'quote', status: 'draft', total_ttc: 100, date: daysAgo(1) },
    ];

    it('donne le CA encaissé du mois et du mois dernier', () => {
        const t = text(buildDashboardCopilotFacts(quotes, { now: NOW, clientCount: 6 }));
        expect(t).toMatch(/Clients : 6/);
        expect(t).toMatch(/ce mois-ci .*1\s?200,00\s?€/);
        expect(t).toMatch(/mois dernier .*800,00\s?€/);
        expect(t).toMatch(/depuis le 1er janvier .*2\s?000,00\s?€/);
    });

    it('liste les devis à relancer avec la même règle que le tableau de bord', () => {
        expect(quotesToFollowUp(quotes, NOW).map(q => q.id)).toEqual([3]);
        const t = text(buildDashboardCopilotFacts(quotes, { now: NOW }));
        expect(t).toMatch(/Petit D-012 « Rénovation tableau » : 3\s?500,00\s?€, dernier contact il y a 12 j, jamais relancé/);
        expect(t).not.toMatch(/Récent|DéjàRelancé.*dernier contact/);
    });

    it('liste les factures impayées', () => {
        const t = text(buildDashboardCopilotFacts(quotes, { now: NOW }));
        expect(t).toMatch(/Lent F-007 : 640,00\s?€, émise il y a 40 j/);
        expect(t).toMatch(/Devis en brouillon .* 1/);
    });

    it('reste lisible sans aucune donnée', () => {
        const t = text(buildDashboardCopilotFacts([], { now: NOW }));
        expect(t).toMatch(/à relancer .*: aucun/);
        expect(t).toMatch(/non encore payées : aucune/);
    });
});

describe('buildQuoteCopilotFacts', () => {
    it('transmet le détail des lignes, les options et la marge', () => {
        const facts = buildQuoteCopilotFacts({
            type: 'quote', client_name: 'Mme Martin', include_tva: false,
            items: [
                { type: 'section', description: 'Cuisine' },
                { type: 'material', description: 'Prise double', quantity: 4, unit: 'u', price: 45, buying_price: 12 },
                { type: 'service', description: 'Pose', quantity: 2, unit: 'h', price: 0 },
                { type: 'material', description: 'Spot LED', quantity: 3, unit: 'u', price: 30, is_optional: true },
            ],
        }, { subtotal: 180, total: 180 });
        const t = text(facts);
        expect(t).toMatch(/\[Section\] Cuisine/);
        expect(t).toMatch(/Prise double \| 4 u \| 45,00\s?€ \| 180,00\s?€ \| matériel \| coût d'achat de la ligne 48,00\s?€/);
        expect(t).toMatch(/Spot LED .*OPTION \(hors total\)/);
        expect(t).toMatch(/marge avant main d'œuvre 132,00\s?€ \(73 % du HT\)/);
        expect(t).toMatch(/1 ligne\(s\) à 0 €/);
    });

    it('signale un devis vide', () => {
        expect(text(buildQuoteCopilotFacts({ items: [] }))).toMatch(/Aucune ligne/);
    });
});
