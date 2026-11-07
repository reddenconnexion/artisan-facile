import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { postponeDate, isPostponedNow } = await import('./followUpPostpone');

describe('projet reporté', () => {
    it('ajoute des mois, sans déborder en fin de mois', () => {
        expect(postponeDate(3, new Date(2026, 10, 7))).toBe('2027-02-07');
        expect(postponeDate(1, new Date(2027, 0, 31))).toBe('2027-02-28');
        expect(postponeDate(6, new Date(2026, 7, 31))).toBe('2027-02-28');
    });

    it('reporté tant que la date de reprise est à venir', () => {
        const now = new Date('2026-11-10T09:00:00Z');
        expect(isPostponedNow({ relance_postponed: true, relance_snoozed_until: '2027-02-07T06:00:00Z' }, now)).toBe(true);
        expect(isPostponedNow({ relance_postponed: true, relance_snoozed_until: '2026-11-01T06:00:00Z' }, now)).toBe(false);
        expect(isPostponedNow({ relance_postponed: false, relance_snoozed_until: '2027-02-07T06:00:00Z' }, now)).toBe(false);
    });
});
