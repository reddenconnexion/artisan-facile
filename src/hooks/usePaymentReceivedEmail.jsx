import { useState, useCallback, useRef } from 'react';
import PaymentReceivedEmailModal from '../components/PaymentReceivedEmailModal';
import { paymentReceivedKind } from '../utils/paymentReceivedEmail';

/**
 * Règlement encaissé → mail de confirmation au client.
 *
 * Dès que l'artisan valide l'encaissement d'un acompte, d'une situation de
 * travaux ou du solde, on lui propose un mail prêt à partir :
 *   - acompte   : bien reçu, commande du matériel lancée ;
 *   - situation : bien reçu, travaux qui se poursuivent ;
 *   - solde     : bien reçu, chantier entièrement réglé.
 * Il peut le retoucher, l'envoyer (adresse pro si configurée, sinon sa
 * messagerie), le copier, ou passer. Rien n'est proposé pour une autre facture.
 *
 * Usage :
 *   const [offerPaymentEmail, paymentEmailModal] = usePaymentReceivedEmail();
 *   await markInvoicePaid(…);
 *   offerPaymentEmail(doc);            // doc : { id, type, title, items… }
 *   …
 *   return <>{paymentEmailModal}…</>;
 *
 * `offerPaymentEmail(doc, { onClose })` renvoie true si le mail est proposé ;
 * `onClose` est alors appelé à la fermeture (pour enchaîner sur autre chose).
 */
export const usePaymentReceivedEmail = () => {
    const [pending, setPending] = useState(null);
    const onCloseRef = useRef(null);
    const offer = useCallback((doc, { onClose } = {}) => {
        const kind = paymentReceivedKind(doc);
        if (!kind || !doc?.id) return false;
        onCloseRef.current = onClose || null;
        setPending({ id: doc.id, kind });
        return true;
    }, []);
    const close = () => {
        setPending(null);
        const after = onCloseRef.current;
        onCloseRef.current = null;
        after?.();
    };
    const element = pending
        ? <PaymentReceivedEmailModal key={`${pending.kind}-${pending.id}`} invoiceId={pending.id} kind={pending.kind} onClose={close} />
        : null;
    return [offer, element];
};
