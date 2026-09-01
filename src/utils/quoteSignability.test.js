import { describe, expect, it } from 'vitest';
import { isSignatureBlocked, canSignInPortal, SIGNATURE_BLOCKING_STATUSES } from './quoteSignability';

describe('isSignatureBlocked', () => {
    it('ferme la signature sur les statuts de fermeture', () => {
        for (const status of SIGNATURE_BLOCKING_STATUSES) {
            expect(isSignatureBlocked(status)).toBe(true);
        }
    });

    // Le trou historique : le formulaire enregistre « Refusé » sous `refused`,
    // pas `rejected`. Tester l'un sans l'autre laissait passer la signature.
    it('couvre les deux valeurs de « refusé » écrites par l’app', () => {
        expect(isSignatureBlocked('refused')).toBe(true);
        expect(isSignatureBlocked('rejected')).toBe(true);
    });

    it('laisse passer un devis en cours', () => {
        expect(isSignatureBlocked('draft')).toBe(false);
        expect(isSignatureBlocked('sent')).toBe(false);
        expect(isSignatureBlocked(null)).toBe(false);
    });
});

describe('canSignInPortal', () => {
    const quote = (over = {}) => ({ type: 'quote', status: 'sent', ...over });

    it('propose la signature d’un devis envoyé', () => {
        expect(canSignInPortal(quote())).toBe(true);
    });

    it('ne propose rien sur un devis déjà signé', () => {
        expect(canSignInPortal(quote({ status: 'accepted' }))).toBe(false);
        expect(canSignInPortal(quote(), true)).toBe(false);
    });

    it('ne propose rien sur un devis fermé par l’artisan', () => {
        expect(canSignInPortal(quote({ status: 'cancelled' }))).toBe(false);
        expect(canSignInPortal(quote({ status: 'refused' }))).toBe(false);
        expect(canSignInPortal(quote({ status: 'postponed' }))).toBe(false);
    });

    // sign_quote_via_portal refuse tout ce qui n'est pas un devis : le bouton
    // ne doit pas promettre une signature vouée à l'échec.
    it('ne propose pas la signature d’un avenant, d’une facture ou d’un avoir', () => {
        expect(canSignInPortal(quote({ type: 'amendment' }))).toBe(false);
        expect(canSignInPortal(quote({ type: 'invoice' }))).toBe(false);
        expect(canSignInPortal(quote({ type: 'credit_note' }))).toBe(false);
    });
});
