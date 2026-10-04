import { describe, it, expect } from 'vitest';
import { affaireJourney, affaireAmounts, depositInvoicesOf, closingInvoicesOf } from './affaireJourney';

const quote = (over = {}) => ({ id: 1, type: 'quote', status: 'draft', total_ttc: 1000, ...over });
const stateOf = (journey) => Object.fromEntries(journey.steps.map(s => [s.id, s.state]));

describe('affaireJourney', () => {
    it('un brouillon attend d\'être finalisé et envoyé', () => {
        const j = affaireJourney(quote());
        expect(j.current.id).toBe('devis');
        expect(j.current.action.kind).toBe('open_quote');
        expect(stateOf(j)).toMatchObject({ devis: 'current', signature: 'todo' });
    });

    it('un devis envoyé attend la signature', () => {
        const j = affaireJourney(quote({ status: 'sent' }));
        expect(j.current.id).toBe('signature');
        expect(j.steps[0].state).toBe('done');
    });

    it('un devis refusé bloque l\'affaire à la signature', () => {
        const j = affaireJourney(quote({ status: 'refused' }));
        expect(j.refused).toBe(true);
        expect(j.current.id).toBe('signature');
        expect(j.current.state).toBe('blocked');
    });

    it('sans acompte prévu, l\'étape est sautée et le chantier devient l\'étape courante', () => {
        const j = affaireJourney(quote({ status: 'accepted' }));
        expect(stateOf(j).acompte).toBe('skipped');
        expect(j.current.id).toBe('chantier');
        expect(j.current.action).toMatchObject({ kind: 'set_stage', stage: 'in_progress' });
    });

    it('acompte matériel prévu et non facturé : propose de le facturer', () => {
        const j = affaireJourney(quote({ status: 'accepted', has_material_deposit: true }));
        expect(j.current.id).toBe('acompte');
        expect(j.current.action.kind).toBe('create_material_deposit');
    });

    it('acompte en % prévu : propose l\'acompte classique', () => {
        const j = affaireJourney(quote({ status: 'accepted', deposit_percentage: 30 }));
        expect(j.current.action.kind).toBe('create_deposit');
    });

    it('pas d\'action de facturation avant la signature', () => {
        const j = affaireJourney(quote({ status: 'sent', has_material_deposit: true }));
        const acompte = j.steps.find(s => s.id === 'acompte');
        expect(acompte.action).toBeUndefined();
    });

    it('acompte émis non payé : propose de l\'encaisser', () => {
        const children = [{ id: 5, type: 'invoice', status: 'billed', title: "Facture d'Acompte - Cuisine", invoice_number: 'F-12' }];
        const j = affaireJourney(quote({ status: 'accepted', has_material_deposit: true }), children);
        expect(j.current.id).toBe('acompte');
        expect(j.current.action).toEqual({ kind: 'mark_paid', label: 'Acompte encaissé', docId: 5 });
        expect(j.current.detail).toContain('F-12');
    });

    it('acompte payé puis chantier en cours : propose de le terminer', () => {
        const children = [{ id: 5, type: 'invoice', status: 'paid', title: "Facture d'Acompte - Cuisine" }];
        const j = affaireJourney(quote({ status: 'accepted', deposit_percentage: 30, work_stage: 'in_progress' }), children);
        expect(stateOf(j).acompte).toBe('done');
        expect(j.current.id).toBe('chantier');
        expect(j.current.action.stage).toBe('completed');
    });

    it('chantier terminé sans facture : propose la clôture', () => {
        const j = affaireJourney(quote({ status: 'accepted', work_stage: 'completed' }));
        expect(j.current.id).toBe('facture');
        expect(j.current.action.kind).toBe('create_closing');
    });

    it('facture de clôture payée : affaire soldée, chantier clos de fait', () => {
        const children = [{ id: 9, type: 'invoice', status: 'paid', title: 'Facture de Clôture - Cuisine' }];
        const j = affaireJourney(quote({ status: 'billed', work_stage: 'in_progress' }), children);
        expect(j.completed).toBe(true);
        expect(j.current).toBeNull();
        expect(stateOf(j).chantier).toBe('done');
    });

    it('devis converti directement en facture : c\'est lui la facture finale', () => {
        const j = affaireJourney(quote({ type: 'invoice', status: 'billed', invoice_number: 'F-3', work_stage: 'completed' }));
        expect(j.current.id).toBe('facture');
        expect(j.current.action).toMatchObject({ kind: 'mark_paid', docId: 1 });
    });

    it('ignore les documents annulés', () => {
        const children = [{ id: 5, type: 'invoice', status: 'cancelled', title: "Facture d'Acompte" }];
        const j = affaireJourney(quote({ status: 'accepted' }), children);
        expect(stateOf(j).acompte).toBe('skipped');
    });
});

describe('depositInvoicesOf / closingInvoicesOf', () => {
    it('distingue acomptes et clôture', () => {
        const children = [
            { id: 1, type: 'invoice', status: 'billed', title: 'Facture de Clôture - X' },
            { id: 2, type: 'invoice', status: 'billed', title: 'Facture X', items: [{ description: 'Acompte matériel sur devis n°3' }] },
            { id: 3, type: 'amendment', status: 'accepted', title: 'Avenant acompte' },
        ];
        expect(depositInvoicesOf(children).map(d => d.id)).toEqual([2]);
        expect(closingInvoicesOf(children).map(d => d.id)).toEqual([1]);
    });
});

describe('affaireAmounts', () => {
    it('total = devis + avenants signés ; encaissé = factures liées payées', () => {
        const children = [
            { id: 2, type: 'amendment', status: 'accepted', total_ttc: 200 },
            { id: 3, type: 'amendment', status: 'draft', total_ttc: 500 },
            { id: 4, type: 'invoice', status: 'paid', total_ttc: 300 },
            { id: 5, type: 'invoice', status: 'billed', total_ttc: 900 },
        ];
        expect(affaireAmounts(quote(), children)).toEqual({
            quoteTTC: 1000, amendmentsTTC: 200, totalTTC: 1200, paidTTC: 300, remainingTTC: 900,
        });
    });
});
