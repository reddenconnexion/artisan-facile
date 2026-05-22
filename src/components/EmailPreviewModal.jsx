import React, { useState, useEffect } from 'react';
import { X, Send, Mail } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';

/**
 * Modale pour prévisualiser et modifier l'email avant envoi
 * Extraite de DevisForm.jsx pour réduire sa taille
 */
export default function EmailPreviewModal({ isOpen, onClose, emailData, onConfirmSend }) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const containerRef = useModalA11y(isOpen && !!emailData, onClose);

    useEffect(() => {
        if (emailData) {
            setSubject(emailData.rawSubject || '');
            setBody(emailData.rawBody || '');
        }
    }, [emailData]);

    if (!isOpen || !emailData) return null;

    const handleSend = () => {
        onConfirmSend(subject, body);
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu de l'email"
        >
            <div
                ref={containerRef}
                className="bg-white dark:bg-gray-900 rounded-t-xl sm:rounded-xl shadow-2xl max-w-2xl w-full h-[92vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Mail className="w-5 h-5 text-blue-600" />
                        Aperçu de l'email
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
                        aria-label="Fermer la modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Destinataire
                        </label>
                        <input
                            type="text"
                            value={emailData.email}
                            disabled
                            className="w-full p-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Objet
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Message
                        </label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={8}
                            className="w-full p-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        />
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        Vous pouvez modifier le contenu avant l'envoi. L'email s'ouvrira dans votre application de messagerie.
                    </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSend}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                        Ouvrir dans ma messagerie
                    </button>
                </div>
            </div>
        </div>
    );
}
