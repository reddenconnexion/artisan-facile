import { describe, expect, it } from 'vitest';
import {
    isSignatureBlocked,
    canSignInPortal,
    closedWatermarkKind,
    isSignatureSuspended,
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

    // Le cas que le statut seul ne dit pas : la signature est fermée, le devis
    // reste « envoyé ». Sans ce marquage, le PDF s'imprimait comme un devis
    // valide.
    it('marque un devis dont la signature a été suspendue', () => {
        expect(closedWatermarkKind({ status: 'sent', signature_suspended_at: '2026-09-01T10:00:00Z' }))
            .toBe('suspended');
    });

    // Le bug de production : `cleanup_expired_tokens` révoque chaque nuit les
    // liens expirés depuis plus de 7 jours — 126 documents sur 253, dont 33
    // devis signés. Marquer ce ménage « SUSPENDU » imprimait un mensonge sur
    // le PDF de devis signés depuis des mois.
    it('ne marque pas un lien révoqué par le ménage des liens expirés', () => {
        expect(closedWatermarkKind({ status: 'sent', token_revoked: true })).toBeNull();
        expect(closedWatermarkKind({ status: 'accepted', signed_at: '2026-07-06', token_revoked: true }))
            .toBeNull();
    });

    // Même suspendu à la main, un devis déjà signé n'a plus rien en attente :
    // son exemplaire ne doit pas dire le contraire.
    it('ne marque pas « suspendu » un devis déjà signé', () => {
        expect(closedWatermarkKind({
            status: 'accepted', signed_at: '2026-07-06', signature_suspended_at: '2026-09-01T10:00:00Z',
        })).toBeNull();
    });

    // Le statut, lui, continue de parler : un devis signé puis annulé garde
    // son « ANNULÉ », qui dit quelque chose de vrai.
    it('marque un devis signé puis annulé', () => {
        expect(closedWatermarkKind({ status: 'cancelled', signed_at: '2026-07-06' })).toBe('cancelled');
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

describe('isSignatureSuspended', () => {
    it("ne reconnaît que la suspension décidée par l'artisan", () => {
        expect(isSignatureSuspended({ signature_suspended_at: '2026-09-01T10:00:00Z' })).toBe(true);
        expect(isSignatureSuspended({ token_revoked: true })).toBe(false);
        expect(isSignatureSuspended({})).toBe(false);
        expect(isSignatureSuspended(null)).toBe(false);
    });
});
