import { useState, useCallback } from 'react';
import DepositReceivedEmailModal from '../components/DepositReceivedEmailModal';

/**
 * « Acompte encaissé » → mail de confirmation au client.
 *
 * Dès que l'artisan valide la réception d'un acompte, on lui propose un mail
 * prêt à partir : acompte bien reçu, commande du matériel lancée. Il peut le
 * retoucher, l'envoyer (adresse pro si configurée, sinon sa messagerie), le
 * copier, ou passer.
 *
 * Usage :
 *   const [offerDepositEmail, depositEmailModal] = useDepositReceivedEmail();
 *   await markInvoicePaid(…);
 *   if (isDepositInvoice(doc)) offerDepositEmail(doc.id);
 *   …
 *   return <>{depositEmailModal}…</>;
 */
export const useDepositReceivedEmail = () => {
    const [depositId, setDepositId] = useState(null);
    const offer = useCallback((id) => { if (id) setDepositId(id); }, []);
    const element = depositId
        ? <DepositReceivedEmailModal depositId={depositId} onClose={() => setDepositId(null)} />
        : null;
    return [offer, element];
};
