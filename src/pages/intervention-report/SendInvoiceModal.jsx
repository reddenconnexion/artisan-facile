import { CheckCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';

// Modal d'envoi de la facture (automatique à la clôture, ou renvoi) :
// SMTP pro, inbox du mode test ou repli sur la messagerie (mailto:).
// Affichée seulement quand sendInvoiceModal est renseigné.
export const SendInvoiceModal = ({
    sendInvoiceModal, setSendInvoiceModal, userProfile, isTestMode, captureEmail,
}) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Rapport terminé !</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Facture de clôture créée. Envoyez-la au client avec le rapport d'intervention.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Destinataire</label>
                        <input
                            type="text"
                            value={sendInvoiceModal.email}
                            onChange={e => setSendInvoiceModal(prev => ({ ...prev, email: e.target.value }))}
                            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-ios outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Objet</label>
                        <input
                            type="text"
                            value={sendInvoiceModal.subject}
                            onChange={e => setSendInvoiceModal(prev => ({ ...prev, subject: e.target.value }))}
                            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-ios outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Message</label>
                        <textarea
                            rows={7}
                            value={sendInvoiceModal.body}
                            onChange={e => setSendInvoiceModal(prev => ({ ...prev, body: e.target.value }))}
                            className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-ios outline-none resize-none"
                        />
                    </div>
                </div>

                <div className="flex gap-3 pt-1">
                    <button
                        onClick={() => setSendInvoiceModal(null)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        Ignorer
                    </button>
                    <button
                        onClick={async () => {
                            const smtpConfigured = !!userProfile?.smtp_config?.host && !!userProfile?.smtp_config?.from_email;
                            if (isTestMode) {
                                captureEmail({ email: sendInvoiceModal.email, subject: sendInvoiceModal.subject, body: sendInvoiceModal.body });
                                toast.success('📬 Email capturé dans l\'inbox test', { duration: 4000 });
                            } else if (smtpConfigured && sendInvoiceModal.email) {
                                const sendingToast = toast.loading('Envoi en cours depuis votre adresse pro...');
                                try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                                    const res = await fetch(`${supabaseUrl}/functions/v1/send-document-email`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${session.access_token}`,
                                        },
                                        body: JSON.stringify({
                                            to: sendInvoiceModal.email,
                                            subject: sendInvoiceModal.subject,
                                            text: sendInvoiceModal.body,
                                            quote_id: sendInvoiceModal.invoice_id ?? null,
                                            client_id: sendInvoiceModal.client_id ?? null,
                                        }),
                                    });
                                    const result = await res.json();
                                    toast.dismiss(sendingToast);
                                    if (!res.ok) throw new Error(result.error || 'Échec de l\'envoi');
                                    toast.success(`Email envoyé à ${sendInvoiceModal.email}`);
                                } catch (err) {
                                    toast.dismiss(sendingToast);
                                    console.error('Direct email send failed:', err);
                                    toast.error(err.message || 'Échec — ouverture du client mail');
                                    const url = `mailto:${sendInvoiceModal.email}?subject=${encodeURIComponent(sendInvoiceModal.subject)}&body=${encodeURIComponent(sendInvoiceModal.body)}`;
                                    window.location.href = url;
                                }
                            } else {
                                const url = `mailto:${sendInvoiceModal.email}?subject=${encodeURIComponent(sendInvoiceModal.subject)}&body=${encodeURIComponent(sendInvoiceModal.body)}`;
                                window.location.href = url;
                            }
                            setSendInvoiceModal(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ios rounded-lg hover:bg-ios-dark transition-colors"
                    >
                        <Send className="w-4 h-4" />
                        {userProfile?.smtp_config?.host ? 'Envoyer depuis mon mail pro' : 'Ouvrir dans la messagerie'}
                    </button>
                </div>
            </div>
        </div>
    </div>
);
