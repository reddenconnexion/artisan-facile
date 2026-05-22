import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Send, Copy, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { generateDevisPDF } from '../utils/pdfGenerator';

/**
 * Modal de prévisualisation avant envoi d'un devis/facture par email.
 * Gère en interne la génération du PDF d'aperçu et les onglets mobile.
 *
 * Props:
 *   preview    { email, rawSubject, rawBody } | null — null = fermé
 *   onClose    () => void
 *   onConfirm  (subject: string, body: string) => void
 *   formData   objet courant du formulaire
 *   clients    liste des clients chargés
 *   userProfile profil de l'artisan
 *   quoteId    id du devis (string | undefined)
 *   isEditing  boolean
 *   totals     { subtotal, tva, total }
 */
const DevisEmailModal = ({ preview, onClose, onConfirm, formData, clients, userProfile, quoteId, isEditing, totals }) => {
    const [localPreview, setLocalPreview] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('pdf');

    // Synchronise l'état local quand le parent ouvre/ferme la modal
    useEffect(() => {
        if (preview) {
            setLocalPreview({ ...preview });
            setActiveTab('pdf');
        } else {
            setLocalPreview(null);
        }
    }, [preview]);

    // Génère la prévisualisation PDF dès que la modal s'ouvre
    useEffect(() => {
        if (!localPreview || !userProfile) return;

        const selectedClient = clients.find(
            c => c.id?.toString() === formData.client_id?.toString()
        );
        if (!selectedClient) return;

        let cancelled = false;
        let blobUrl = null;
        setPdfLoading(true);
        setPdfUrl(null);

        const { subtotal, tva, total } = totals;
        const devisData = {
            id: isEditing ? quoteId : 'PROVISOIRE',
            ...formData,
            items: formData.items.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity) || 0,
                price: parseFloat(i.price) || 0,
            })),
            total_ht: subtotal,
            total_tva: tva,
            total_ttc: total,
            include_tva: formData.include_tva,
            has_material_deposit: formData.has_material_deposit,
            amendment_details: formData.amendment_details || {},
        };

        generateDevisPDF(devisData, selectedClient, userProfile, formData.type === 'invoice', 'bloburl')
            .then(url => {
                if (cancelled) {
                    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
                    return;
                }
                blobUrl = url;
                setPdfUrl(url);
            })
            .catch(err => {
                if (!cancelled) {
                    console.error('Email PDF preview error:', err);
                    toast.error('Impossible de générer la prévisualisation PDF');
                }
            })
            .finally(() => { if (!cancelled) setPdfLoading(false); });

        return () => {
            cancelled = true;
            if (blobUrl?.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
            setPdfUrl(null);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localPreview?.email, formData.client_id, isEditing, quoteId, userProfile?.id, totals.subtotal, totals.tva, totals.total]);

    if (!localPreview) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
            <div className="bg-white dark:bg-gray-900 rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-5xl flex flex-col h-[95vh] sm:h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                        <Mail className="w-5 h-5 mr-2 text-blue-600" />
                        Vérifiez avant d'envoyer
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Onglets mobile */}
                <div className="md:hidden flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab('pdf')}
                        className={`flex-1 py-2.5 text-sm font-medium ${activeTab === 'pdf' ? 'text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        Aperçu du PDF
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('email')}
                        className={`flex-1 py-2.5 text-sm font-medium ${activeTab === 'email' ? 'text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        Email
                    </button>
                </div>

                {/* Corps : 2 panneaux desktop, 1 selon onglet mobile */}
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    {/* Panneau PDF */}
                    <div className={`flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 ${activeTab === 'pdf' ? 'flex' : 'hidden md:flex'} flex-col`}>
                        {pdfLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-3">
                                <Loader2 className="w-7 h-7 animate-spin" />
                                <p className="text-sm">Génération de l'aperçu PDF…</p>
                            </div>
                        ) : pdfUrl ? (
                            <iframe src={pdfUrl} title="Aperçu PDF" className="flex-1 w-full border-0 bg-white" />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-2 px-6 text-center">
                                <FileText className="w-7 h-7" />
                                <p className="text-sm">Aperçu indisponible — vous pouvez quand même envoyer.</p>
                            </div>
                        )}
                    </div>

                    {/* Panneau Email */}
                    <div className={`md:w-96 flex-shrink-0 ${activeTab === 'email' ? 'flex' : 'hidden md:flex'} flex-col overflow-y-auto`}>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pour</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={localPreview.email}
                                    className="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Objet</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={localPreview.rawSubject}
                                        onChange={e => setLocalPreview(p => ({ ...p, rawSubject: e.target.value }))}
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { navigator.clipboard.writeText(localPreview.rawSubject); toast.success('Objet copié !'); }}
                                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg flex-shrink-0"
                                        title="Copier l'objet"
                                    >
                                        <Copy className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                                <div className="relative">
                                    <textarea
                                        rows={10}
                                        value={localPreview.rawBody}
                                        onChange={e => setLocalPreview(p => ({ ...p, rawBody: e.target.value }))}
                                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { navigator.clipboard.writeText(localPreview.rawBody); toast.success('Message copié !'); }}
                                        className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-gray-900/80 hover:bg-white dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 shadow-sm transition-colors"
                                        title="Copier le message"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                Le PDF affiché à gauche est exactement celui que recevra le client en pièce jointe.
                                Vérifiez le montant, l'adresse et les coordonnées avant l'envoi.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(localPreview.rawSubject, localPreview.rawBody)}
                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center justify-center"
                        title={userProfile?.smtp_config?.host ? `Envoi direct depuis ${userProfile.smtp_config.from_email}` : 'Ouvre votre client mail'}
                    >
                        <Send className="w-4 h-4 mr-2" />
                        {userProfile?.smtp_config?.host ? 'Envoyer depuis mon mail pro' : 'Envoyer'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DevisEmailModal;
