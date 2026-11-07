import { describe, it, expect } from 'vitest';
import { STRIPE_PORTAL_LOGIN_URL, portalLoginUrl } from './stripePortal';

describe('portalLoginUrl', () => {
    it('renvoie le lien nu sans e-mail', () => {
        expect(portalLoginUrl()).toBe(STRIPE_PORTAL_LOGIN_URL);
        expect(portalLoginUrl('')).toBe(STRIPE_PORTAL_LOGIN_URL);
    });

    it('pré-remplit l\'e-mail en l\'encodant', () => {
        expect(portalLoginUrl('jean+pro@exemple.fr'))
            .toBe(`${STRIPE_PORTAL_LOGIN_URL}?prefilled_email=jean%2Bpro%40exemple.fr`);
    });
});
