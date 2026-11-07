import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { describe, it, expect } from 'vitest';
import {
    FOUNDER_SPOTS, TRIAL_DAYS, PRO_PRICES, formatEuros, proOffer, spotsLabel, trialNotice, founderVisioMailto,
    founderVisioTel, founderVisioSms,
} from './founderOffer';

const NOW = new Date('2026-11-07T08:00:00Z');

describe('tarifs : appli et Edge Functions identiques', () => {
    const ts = readFileSync(path.join(cwd(), 'supabase/functions/_shared/pricing.ts'), 'utf8');
    const num = (re) => Number(ts.match(re)?.[1]);

    it('places et essai', () => {
        expect(num(/FOUNDER_SPOTS\s*=\s*(\d+)/)).toBe(FOUNDER_SPOTS);
        expect(num(/TRIAL_DAYS\s*=\s*(\d+)/)).toBe(TRIAL_DAYS);
    });

    it('prix standard et fondateur', () => {
        expect(num(/standard:\s*\{\s*month:\s*(\d+)/)).toBe(PRO_PRICES.standard.month);
        expect(num(/standard:\s*\{\s*month:\s*\d+,\s*year:\s*(\d+)/)).toBe(PRO_PRICES.standard.year);
        expect(num(/founder:\s*\{\s*month:\s*(\d+)/)).toBe(PRO_PRICES.founder.month);
        expect(num(/founder:\s*\{\s*month:\s*\d+,\s*year:\s*(\d+)/)).toBe(PRO_PRICES.founder.year);
    });
});

describe('formatEuros', () => {
    it('garde les centimes seulement quand il y en a', () => {
        expect(formatEuros(990)).toBe('9,90 €');
        expect(formatEuros(9900)).toBe('99 €');
        expect(formatEuros(14990).replace(/\s/g, ' ')).toBe('149,90 €');
    });
});

describe('proOffer', () => {
    it('tarif fondateur tant qu\'il reste des places', () => {
        expect(proOffer(12, 'month')).toMatchObject({ founder: true, cents: 990, priceLabel: '9,90 €/mois', standardLabel: '14,99 €/mois' });
        expect(proOffer(12, 'year')).toMatchObject({ founder: true, cents: 9900, priceLabel: '99 €/an', monthlyEquivalent: '8,25 €/mois' });
    });

    it('tarif normal quand les places sont épuisées ou inconnues', () => {
        expect(proOffer(0, 'month')).toMatchObject({ founder: false, cents: 1499 });
        expect(proOffer(null, 'month')).toMatchObject({ founder: false, cents: 1499 });
    });

    it('un fondateur qui se réabonne garde son tarif', () => {
        expect(proOffer(0, 'month', { alreadyFounder: true })).toMatchObject({ founder: true, cents: 990 });
    });
});

describe('spotsLabel', () => {
    it('affiche les places restantes', () => {
        expect(spotsLabel(50)).toBe('50 places seulement');
        expect(spotsLabel(12)).toBe('Plus que 12 places sur 50');
        expect(spotsLabel(1)).toBe('Dernière place !');
    });

    it('rien quand c\'est complet ou inconnu', () => {
        expect(spotsLabel(0)).toBeNull();
        expect(spotsLabel(null)).toBeNull();
    });
});

describe('trialNotice', () => {
    it('date du premier prélèvement, heure de Paris', () => {
        expect(trialNotice('2026-12-07T07:01:06Z', NOW)).toBe('Essai gratuit · 1er prélèvement le 7 décembre 2026');
    });

    it('rien hors essai', () => {
        expect(trialNotice(null, NOW)).toBeNull();
        expect(trialNotice('2026-11-01T00:00:00Z', NOW)).toBeNull();
        expect(trialNotice('n/a', NOW)).toBeNull();
    });
});

describe('founderVisioMailto', () => {
    it('e-mail prérempli à Denis', () => {
        const url = founderVisioMailto({ name: 'Jean Dupont', company: 'Dupont Élec' });
        expect(url.startsWith('mailto:rotvener97@gmail.com?subject=')).toBe(true);
        expect(decodeURIComponent(url)).toContain('membre fondateur (Jean Dupont — Dupont Élec)');
    });
});

describe('founderVisioTel / founderVisioSms', () => {
    it('appel au format international', () => {
        expect(founderVisioTel()).toBe('tel:+33695100823');
    });

    it('SMS prérempli, compatible iOS et Android', () => {
        const url = founderVisioSms({ name: 'Jean Dupont' });
        expect(url.startsWith('sms:+33695100823?&body=')).toBe(true);
        expect(decodeURIComponent(url)).toContain('membre fondateur Artisan Facile (Jean Dupont)');
    });
});
