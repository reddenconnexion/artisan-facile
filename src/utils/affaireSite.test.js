import { describe, it, expect } from 'vitest';
import {
    affaireQuoteIds, photoFolderNames, summarizeMaterial, summarizeHours,
    affaireEvents, openExtras, extrasToAmendmentItems, markExtrasConverted,
} from './affaireSite';

describe('affaireQuoteIds', () => {
    it('réunit le devis racine et ses documents liés, sans doublon', () => {
        expect(affaireQuoteIds({ id: 10 }, [{ id: 11 }, { id: '12' }, { id: 10 }])).toEqual([10, 11, 12]);
    });
    it('tolère une affaire sans document lié', () => {
        expect(affaireQuoteIds({ id: 5 })).toEqual([5]);
    });
});

describe('photoFolderNames', () => {
    it('prend le titre du devis et des avenants, pas des factures', () => {
        const names = photoFolderNames(
            { title: ' Rénovation cuisine ' },
            [{ type: 'amendment', title: 'Avenant prises' }, { type: 'invoice', title: 'Facture acompte' }],
        );
        expect(names).toEqual(['Rénovation cuisine', 'Avenant prises']);
    });
});

describe('summarizeMaterial', () => {
    it('compte par état et totalise le coût connu', () => {
        const s = summarizeMaterial([
            { status: 'pending', quantity: 2, buying_price: 10 },
            { status: 'ordered', quantity: 1, buying_price: 5.5 },
            { status: 'received', quantity: 3 },
            { status: 'bizarre' },
        ]);
        expect(s).toEqual({ pending: 2, ordered: 1, received: 1, total: 4, cost: 25.5 });
    });
});

describe('summarizeHours', () => {
    it('additionne les heures et garde la date du dernier pointage', () => {
        const s = summarizeHours([
            { hours_spent: 2.5, date: '2026-09-01' },
            { hours_spent: '1.25', date: '2026-09-03' },
            { hours_spent: 0, date: '2026-09-09' },
        ]);
        expect(s).toEqual({ total: 3.75, count: 2, lastDate: '2026-09-03' });
    });
});

describe('affaireEvents', () => {
    const events = [
        { id: 1, quote_id: null, client_id: 7, date: '2026-09-20', time: '09:00' },
        { id: 2, quote_id: null, client_id: 7, date: '2026-10-10', time: '14:00' },
        { id: 3, quote_id: null, client_id: 7, date: '2026-10-06', time: '08:00' },
        { id: 4, quote_id: null, client_id: 7, date: '2026-01-01', time: '08:00' },
        { id: 5, quote_id: null, client_id: 8, date: '2026-10-07', time: '08:00' },
    ];
    it('sans RDV rattaché, prend ceux du client depuis le devis', () => {
        const { upcoming, past } = affaireEvents(events, { quoteIds: [99], clientId: 7, sinceDate: '2026-09-01', today: '2026-10-04' });
        expect(upcoming.map(e => e.id)).toEqual([3, 2]);
        expect(past.map(e => e.id)).toEqual([1]);
    });
    it('préfère les RDV rattachés à un document de l\'affaire', () => {
        const linked = [...events, { id: 6, quote_id: 99, client_id: 7, date: '2026-10-05' }];
        const { upcoming, past } = affaireEvents(linked, { quoteIds: [99], clientId: 7, today: '2026-10-04' });
        expect(upcoming.map(e => e.id)).toEqual([6]);
        expect(past).toEqual([]);
    });
});

describe('notes hors devis', () => {
    const extras = [
        { id: 'a', description: 'Ajouter une prise cuisine' },
        { id: 'b', description: '  ' },
        { id: 'c', description: 'Déplacer le tableau', amendment_id: 42 },
        { id: 'd', description: 'Spot salle de bain', deleted: true },
    ];
    it('ne garde que les notes à chiffrer', () => {
        expect(openExtras(extras).map(e => e.id)).toEqual(['a']);
    });
    it('en fait des lignes d\'avenant à prix à renseigner', () => {
        expect(extrasToAmendmentItems(extras, 1000)).toEqual([
            { id: 1000, description: 'Ajouter une prise cuisine', quantity: 1, unit: 'forfait', price: 0, buying_price: 0, type: 'service' },
        ]);
    });
    it('marque les notes reprises sans toucher aux autres', () => {
        const out = markExtrasConverted(extras, 77, 'T');
        expect(out.find(e => e.id === 'a')).toMatchObject({ amendment_id: 77, updated_at: 'T' });
        expect(out.find(e => e.id === 'c').amendment_id).toBe(42);
        expect(out).toHaveLength(4);
    });
});
