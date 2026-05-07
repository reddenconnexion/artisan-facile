import { describe, it, expect } from 'vitest';
import { getUrssafRate, URSSAF_RATES } from './taxUtils';

describe('getUrssafRate', () => {
    it('returns 0 for non micro-entreprise statuses', () => {
        expect(getUrssafRate({ artisan_status: 'eurl' }, 'service')).toBe(0);
        expect(getUrssafRate({ artisan_status: 'sasu' }, 'material')).toBe(0);
    });

    it('defaults to micro-entreprise when status is missing', () => {
        // No status → assume micro-entreprise (default activity = services)
        expect(getUrssafRate({}, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.services.normal);
    });

    it('returns the services rate for default activity', () => {
        const rate = getUrssafRate({ artisan_status: 'micro_entreprise', activity_type: 'services' }, 'service');
        expect(rate).toBe(URSSAF_RATES.micro_entreprise.services.normal);
    });

    it('returns the libéral rate for liberal activity', () => {
        const rate = getUrssafRate({ artisan_status: 'micro_entreprise', activity_type: 'liberal' }, 'service');
        expect(rate).toBe(URSSAF_RATES.micro_entreprise.liberal.normal);
    });

    it('returns the vente rate for vente activity', () => {
        const rate = getUrssafRate({ artisan_status: 'micro_entreprise', activity_type: 'vente' }, 'material');
        expect(rate).toBe(URSSAF_RATES.micro_entreprise.vente.normal);
    });

    it('mixte activity uses vente rate for material items, services for the rest', () => {
        const profile = { artisan_status: 'micro_entreprise', activity_type: 'mixte' };
        expect(getUrssafRate(profile, 'material'))
            .toBe(URSSAF_RATES.micro_entreprise.mixte.vente.normal);
        expect(getUrssafRate(profile, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.mixte.services.normal);
    });

    it('uses the ACRE-discounted rate when has_acre is true', () => {
        const profile = { artisan_status: 'micro_entreprise', activity_type: 'services', has_acre: true };
        expect(getUrssafRate(profile, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.services.acre);
    });

    it('ACRE applies to libéral and mixte too', () => {
        const liberal = { artisan_status: 'micro_entreprise', activity_type: 'liberal', has_acre: true };
        expect(getUrssafRate(liberal, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.liberal.acre);

        const mixte = { artisan_status: 'micro_entreprise', activity_type: 'mixte', has_acre: true };
        expect(getUrssafRate(mixte, 'material'))
            .toBe(URSSAF_RATES.micro_entreprise.mixte.vente.acre);
        expect(getUrssafRate(mixte, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.mixte.services.acre);
    });

    it('ignores has_acre when not strictly true', () => {
        // The implementation checks `has_acre === true`, not truthy — guard
        // against unexpected non-boolean values.
        const profile = { artisan_status: 'micro_entreprise', activity_type: 'services', has_acre: 'yes' };
        expect(getUrssafRate(profile, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.services.normal);
    });

    it('returns 0 when profilePrefs is null/undefined and status defaults to micro_entreprise', () => {
        // null profilePrefs → status defaults to micro_entreprise, activity defaults to services
        expect(getUrssafRate(null, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.services.normal);
        expect(getUrssafRate(undefined, 'service'))
            .toBe(URSSAF_RATES.micro_entreprise.services.normal);
    });
});
