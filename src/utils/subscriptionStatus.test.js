import { describe, it, expect } from 'vitest';
import { cancellationNotice } from './subscriptionStatus';

const NOW = new Date('2026-11-07T08:00:00Z');

describe('cancellationNotice', () => {
    it('affiche la date de fin (heure de Paris)', () => {
        expect(cancellationNotice('2026-12-07T07:01:06Z', NOW))
            .toBe("Résilié · actif jusqu'au 7 décembre 2026");
    });

    it('bascule au jour suivant en heure de Paris', () => {
        expect(cancellationNotice('2026-12-06T23:30:00Z', NOW))
            .toBe("Résilié · actif jusqu'au 7 décembre 2026");
    });

    it('ignore une date absente, invalide ou passée', () => {
        expect(cancellationNotice(null, NOW)).toBeNull();
        expect(cancellationNotice(undefined, NOW)).toBeNull();
        expect(cancellationNotice('pas une date', NOW)).toBeNull();
        expect(cancellationNotice('2026-11-01T00:00:00Z', NOW)).toBeNull();
    });
});
