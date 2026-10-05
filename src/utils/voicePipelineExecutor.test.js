import { describe, it, expect, beforeEach, vi } from 'vitest';

// Faux client Supabase : chaque requête est une chaîne de méthodes dont on
// garde la trace (table, filtres, écritures) ; le résultat dépend de la table.
const calls = [];
let results = {};
const makeBuilder = (table) => {
    const entry = { table, ops: [] };
    calls.push(entry);
    const builder = {};
    ['select', 'eq', 'in', 'ilike', 'order', 'limit', 'update', 'delete', 'insert', 'single'].forEach((m) => {
        builder[m] = (...args) => { entry.ops.push([m, ...args]); return builder; };
    });
    builder.then = (resolve) => resolve({ data: results[table] ?? null, error: null });
    return builder;
};
vi.mock('./supabase', () => ({
    supabase: { from: (table) => makeBuilder(table) },
}));

import { executePipelineActions, cancelPipelineActions } from './voicePipelineExecutor';

const writes = () => calls.flatMap(c => c.ops.filter(([m]) => ['update', 'delete', 'insert'].includes(m)).map(op => [c.table, op[0]]));

beforeEach(() => {
    calls.length = 0;
    results = {};
});

describe('commande vocale « envoie la facture »', () => {
    it('ne modifie rien en base et ne laisse rien à annuler', async () => {
        results = {
            clients: [{ id: 7 }],
            quotes: [{ id: 42, title: 'Facture Dupont', clients: { email: 'a@b.fr' } }],
        };
        const { actionsTaken, recordIds } = await executePipelineActions(
            { intent: 'send_invoice', data: { client_name: 'Dupont' } }, 'u1');

        expect(writes()).toEqual([]);
        expect(recordIds).toEqual({});
        expect(actionsTaken[0]).toMatchObject({ type: 'send_invoice', id: 42, link: '/app/devis/42' });
    });

    it('ne cherche que des factures, du client dicté', async () => {
        results = { clients: [{ id: 7 }], quotes: [] };
        await executePipelineActions({ intent: 'send_invoice', data: { client_name: 'Dupont' } }, 'u1');
        const quoteQuery = calls.find(c => c.table === 'quotes');
        expect(quoteQuery.ops).toContainEqual(['eq', 'type', 'invoice']);
        expect(quoteQuery.ops).toContainEqual(['eq', 'client_id', 7]);
    });

    it('client dicté introuvable : aucune recherche chez un autre client', async () => {
        results = { clients: [], quotes: [{ id: 99, title: 'Autre client' }] };
        const { actionsTaken } = await executePipelineActions(
            { intent: 'send_invoice', data: { client_name: 'Inconnu' } }, 'u1');
        expect(calls.some(c => c.table === 'quotes')).toBe(false);
        expect(actionsTaken[0].type).toBe('send_invoice_not_found');
    });

    it("l'annulation qui suit ne supprime aucun document", async () => {
        results = { quotes: [{ id: 42, title: 'Facture' }] };
        const { recordIds } = await executePipelineActions({ intent: 'send_invoice', data: {} }, 'u1');
        calls.length = 0;
        await cancelPipelineActions(recordIds, 'u1');
        expect(writes()).toEqual([]);
    });
});
