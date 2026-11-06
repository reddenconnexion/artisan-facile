import { useState, useEffect, useRef } from 'react';
import { X, Mail, Copy, PackageCheck, BadgeCheck, HardHat, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useUserProfile } from '../hooks/useDataCache';
import { buildPaymentReceivedEmail } from '../utils/paymentReceivedEmail';
import { sendDocumentEmail, probablySentMessage } from '../utils/sendDocumentEmail';

const COPY = {
    deposit: {
        Icon: PackageCheck,
        title: 'Acompte reçu : prévenez le client',
        caption: 'Mail suggéré : réception confirmée et commande du matériel lancée.',
        logDetail: (ref) => `Confirmation de réception de l'acompte${ref} et lancement de la commande`,
    },
    situation: {
        Icon: HardHat,
        title: 'Situation réglée : prévenez le client',
        caption: 'Mail suggéré : règlement de la situation confirmé, travaux qui se poursuivent.',
        logDetail: (ref) => `Confirmation de réception du règlement de la situation${ref}`,
    },
    balance: {
        Icon: BadgeCheck,
        title: 'Solde reçu : remerciez le client',
        caption: 'Mail suggéré : règlement du solde confirmé, chantier entièrement réglé.',
        logDetail: (ref) => `Confirmation de réception du solde${ref}`,
    },
};

/**
 * Mail « règlement bien reçu » proposé après l'encaissement d'un acompte
 * (commande lancée), d'une situation de travaux (travaux qui se poursuivent)
 * ou du solde (chantier réglé) — voir usePaymentReceivedEmail.
 * Charge la facture, son client et son devis d'origine, rédige le mail, et le
 * laisse retoucher avant l'envoi.
 */
const PaymentReceivedEmailModal = ({ invoiceId, kind = 'deposit', onClose }) => {
    const copy = COPY[kind] || COPY.deposit;
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const { data: userProfile, isLoading: profileLoading } = useUserProfile();

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [invoice, setInvoice] = useState(null);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    // Charge la facture (avec son client et son devis d'origine), puis rédige le mail.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: doc, error } = await supabase
                .from('quotes')
                .select('id, title, total_ttc, invoice_number, quote_number, payment_method, client_id, parent_id, amendment_details, clients(name, email, civility)')
                .eq('id', invoiceId)
                .maybeSingle();
            if (cancelled) return;
            if (error || !doc) {
                console.error('Facture introuvable pour le mail de confirmation', error);
                onClose();
                return;
            }
            let parentQuote = null;
            if (doc.parent_id) {
                const { data: parent } = await supabase
                    .from('quotes')
                    .select('title, quote_number')
                    .eq('id', doc.parent_id)
                    .maybeSingle();
                parentQuote = parent || null;
            }
            if (cancelled) return;
            setInvoice(doc);
            setTo(doc.clients?.email || '');
            // Le texte se rédige une fois le profil connu (signature).
            setDraftInputs({ kind, invoice: doc, parentQuote, client: doc.clients });
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceId]);

    // Rédigé une seule fois : un rafraîchissement du profil ne doit pas
    // écraser les retouches de l'artisan.
    const [draftInputs, setDraftInputs] = useState(null);
    const draftedRef = useRef(false);
    useEffect(() => {
        if (!draftInputs || profileLoading || draftedRef.current) return;
        draftedRef.current = true;
        const draft = buildPaymentReceivedEmail({ ...draftInputs, userProfile });
        setSubject(draft.subject);
        setBody(draft.body);
        setLoading(false);
    }, [draftInputs, userProfile, profileLoading]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, sending]);

    const logInteraction = () => {
        if (!invoice?.client_id || !user?.id) return;
        supabase.from('client_interactions').insert([{
            user_id: user.id,
            client_id: invoice.client_id,
            type: 'email',
            date: new Date(),
            details: copy.logDetail(invoice.invoice_number ? ` ${invoice.invoice_number}` : ''),
        }]).then(({ error }) => {
            if (error) console.error('Error logging payment email interaction:', error);
        });
    };

    const handleSend = async () => {
        const recipient = to.trim();
        const smtpConfigured = !!userProfile?.smtp_config?.host && !!userProfile?.smtp_config?.from_email;
        const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        if (isTestMode) {
            captureEmail({ email: recipient, subject, body });
            toast.success("📬 Email capturé dans l'inbox test", { duration: 4000 });
        } else if (smtpConfigured && recipient) {
            setSending(true);
            const { status, error } = await sendDocumentEmail({
                to: recipient,
                subject,
                text: body,
                quote_id: invoice?.id,
                client_id: invoice?.client_id,
            });
            setSending(false);
            if (status === 'sent') {
                toast.success(`Email envoyé à ${recipient}`);
            } else if (status === 'probably_sent') {
                toast.warning(probablySentMessage(recipient), { duration: 12000 });
            } else {
                toast.error(error || "Échec de l'envoi direct — ouverture du client mail");
                window.location.href = mailtoUrl;
            }
        } else {
            window.location.href = mailtoUrl;
            toast.success('Application de messagerie ouverte');
        }
        logInteraction();
        onClose();
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`${subject}\n\n${body}`);
            toast.success('Mail copié');
        } catch {
            toast.error('Copie impossible : sélectionnez le texte à la main.');
        }
    };

    const smtpConfigured = !!userProfile?.smtp_config?.host && !!userProfile?.smtp_config?.from_email;

    return (
        <div
            className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => { if (!sending) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={copy.title}
                className="w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col safe-area-bottom"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                            <copy.Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{copy.title}</h2>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {copy.caption}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} disabled={sending} className="p-1 -mr-1 text-gray-400" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Préparation du mail…
                    </div>
                ) : (
                    <>
                        <div className="px-5 space-y-3 overflow-y-auto">
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Pour</span>
                                <input
                                    type="email"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    placeholder="email du client"
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Objet</span>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Message</span>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    rows={11}
                                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                            </label>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-5 pt-4 shrink-0">
                            <button type="button" onClick={onClose} disabled={sending} className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
                                Plus tard
                            </button>
                            <button type="button" onClick={handleCopy} disabled={sending} className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                                <Copy className="w-4 h-4" /> Copier
                            </button>
                            <button type="button" onClick={handleSend} disabled={sending} className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-60">
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                {smtpConfigured || isTestMode ? 'Envoyer' : 'Ouvrir dans ma messagerie'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PaymentReceivedEmailModal;
