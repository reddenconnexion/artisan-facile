import { describe, expect, it } from 'vitest';
import { reopenedAfterExpiryAt } from './quoteReopen';

const quote = (overrides = {}) => ({
    id: 42,
    type: 'quote',
    status: 'sent',
    date: '2026-08-01',
    valid_until: '2026-08-31',
    last_viewed_at: null,
    last_followup_at: null,
    archived_at: null,
    ...overrides,
});

describe('reopenedAfterExpiryAt', () => {
    it('signale un devis consulté après sa date de validité', () => {
        const at = reopenedAfterExpiryAt(quote({ last_viewed_at: '2026-09-15T10:00:00' }));
        expect(at).toEqual(new Date('2026-09-15T10:00:00'));
    });

    it('compte aussi la réouverture de l’e-mail du devis', () => {
        const at = reopenedAfterExpiryAt(quote({ last_viewed_at: '2026-08-10T10:00:00' }), '2026-09-20T08:00:00');
        expect(at).toEqual(new Date('2026-09-20T08:00:00'));
    });

    it('ignore une consultation le dernier jour de validité', () => {
        expect(reopenedAfterExpiryAt(quote({ last_viewed_at: '2026-08-31T22:00:00' }))).toBeNull();
    });

    it('ignore une consultation pendant la validité', () => {
        expect(reopenedAfterExpiryAt(quote({ last_viewed_at: '2026-08-15T10:00:00' }))).toBeNull();
    });

    it('ne redemande pas de relance une fois le client relancé depuis la réouverture', () => {
        expect(reopenedAfterExpiryAt(quote({
            last_viewed_at: '2026-09-15T10:00:00',
            last_followup_at: '2026-09-15T14:00:00',
        }))).toBeNull();
    });

    it('redemande une relance si le client rouvre après la dernière relance', () => {
        const at = reopenedAfterExpiryAt(quote({
            last_viewed_at: '2026-09-25T10:00:00',
            last_followup_at: '2026-09-15T14:00:00',
        }));
        expect(at).toEqual(new Date('2026-09-25T10:00:00'));
    });

    it('fait revenir un devis archivé avant la réouverture', () => {
        const at = reopenedAfterExpiryAt(quote({
            archived_at: '2026-09-05T09:00:00',
            last_viewed_at: '2026-09-15T10:00:00',
        }));
        expect(at).toEqual(new Date('2026-09-15T10:00:00'));
    });

    it('respecte un archivage décidé après la réouverture', () => {
        expect(reopenedAfterExpiryAt(quote({
            last_viewed_at: '2026-09-15T10:00:00',
            archived_at: '2026-09-16T09:00:00',
        }))).toBeNull();
    });

    it.each(['accepted', 'rejected', 'paid', 'draft', 'cancelled'])('ne relance pas un devis au statut %s', (status) => {
        expect(reopenedAfterExpiryAt(quote({ status, last_viewed_at: '2026-09-15T10:00:00' }))).toBeNull();
    });

    it('ignore les factures et les devis sans date de validité', () => {
        expect(reopenedAfterExpiryAt(quote({ type: 'invoice', last_viewed_at: '2026-09-15T10:00:00' }))).toBeNull();
        expect(reopenedAfterExpiryAt(quote({ valid_until: null, last_viewed_at: '2026-09-15T10:00:00' }))).toBeNull();
    });

    it('ignore un devis jamais rouvert', () => {
        expect(reopenedAfterExpiryAt(quote())).toBeNull();
    });
});
