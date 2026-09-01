import { describe, expect, it } from 'vitest';
import {
    isSignatureBlocked,
    canSignInPortal,
    closedWatermarkKind,
    SIGNATURE_BLOCKING_STATUSES,
} from './quoteSignability';

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

describe('closedWatermarkKind', () => {
    it('marque un document annulé, refusé ou reporté', () => {
        expect(closedWatermarkKind({ status: 'cancelled' })).toBe('cancelled');
        expect(closedWatermarkKind({ status: 'refused' })).toBe('refused');
        expect(closedWatermarkKind({ status: 'rejected' })).toBe('refused');
        expect(closedWatermarkKind({ status: 'postponed' })).toBe('postponed');
    });

    // Le cas que le statut seul ne dit pas : le lien est fermé, le devis reste
    // « envoyé ». Sans ce marquage, le PDF d'un devis suspendu s'imprimait
    // comme un devis valide.
    it('marque un devis dont le lien est suspendu, sans toucher au statut', () => {
        expect(closedWatermarkKind({ status: 'sent', token_revoked: true })).toBe('suspended');
    });

    it('ne marque pas un document en cours', () => {
        expect(closedWatermarkKind({ status: 'sent' })).toBeNull();
        expect(closedWatermarkKind({ status: 'draft', token_revoked: false })).toBeNull();
        expect(closedWatermarkKind(null)).toBeNull();
    });

    // Une facture porte déjà « ACQUITTÉE » et n'attend aucune signature :
    // un second filigrane n'aurait rien à dire.
    it('ne marque pas une facture réglée ou facturée', () => {
        expect(closedWatermarkKind({ status: 'paid' })).toBeNull();
        expect(closedWatermarkKind({ status: 'billed' })).toBeNull();
    });
});
