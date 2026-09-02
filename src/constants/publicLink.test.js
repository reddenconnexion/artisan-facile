import { describe, expect, it } from 'vitest';
import {
    PUBLIC_LINK_VALIDITY_DAYS,
    publicLinkExpiry,
    publicLinkValidityLabel,
} from './publicLink';

describe('validité du lien public', () => {
    it('place l’expiration à la durée annoncée', () => {
        const expiry = new Date(publicLinkExpiry()).getTime();
        const attendu = Date.now() + PUBLIC_LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
        // Tolérance de quelques secondes : les deux dates ne sont pas calculées
        // au même instant.
        expect(Math.abs(expiry - attendu)).toBeLessThan(5000);
    });

    it('produit une date future', () => {
        expect(new Date(publicLinkExpiry()).getTime()).toBeGreaterThan(Date.now());
    });

    // Le libellé montré à l'artisan doit suivre la constante : promettre une
    // durée que le lien n'a pas est pire que ne rien dire.
    it('annonce la même durée que celle qui est appliquée', () => {
        expect(publicLinkValidityLabel()).toBe(`${PUBLIC_LINK_VALIDITY_DAYS} jours`);
    });
});
