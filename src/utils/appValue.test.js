import { describe, it, expect } from 'vitest';
import { computeAppValue } from './appValue';

const NOW = new Date('2026-10-14T10:00:00Z');

describe('computeAppValue', () => {
    it('renvoie hasData=false sans document', () => {
        expect(computeAppValue([], NOW).hasData).toBe(false);
        expect(computeAppValue(null, NOW).hasData).toBe(false);
    });

    it('compte le CA des devis signés après relance, cette année seulement', () => {
        const r = computeAppValue([
            { type: 'quote', status: 'accepted', total_ht: 1000, follow_up_count: 2, signed_at: '2026-05-01' },
            { type: 'quote', status: 'accepted', total_ht: 500, follow_up_count: 0, signed_at: '2026-06-01' },
            { type: 'quote', status: 'accepted', total_ht: 900, follow_up_count: 1, signed_at: '2025-06-01' },
            { type: 'quote', status: 'sent', total_ht: 700, follow_up_count: 3 },
        ], NOW);
        expect(r.recoveredRevenue).toBe(1000);
        expect(r.recoveredCount).toBe(1);
        expect(r.followUps).toBe(6);
        expect(r.signedThisYear).toBe(2);
    });

    it('ignore brouillons et annulés pour le temps gagné', () => {
        const r = computeAppValue([
            { type: 'quote', status: 'draft' },
            { type: 'quote', status: 'cancelled' },
            { type: 'invoice', status: 'paid', total_ht: 100, follow_up_count: 1 },
        ], NOW);
        expect(r.documents).toBe(1);
        expect(r.minutesSaved).toBe(5 + 15);
    });
});
