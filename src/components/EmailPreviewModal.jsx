import React, { useState, useEffect } from 'react';
import { X, Send, Mail } from 'lucide-react';

/**
 * Modale pour prévisualiser et modifier l'email avant envoi
 * Extraite de DevisForm.jsx pour réduire sa taille
 */
export default function EmailPreviewModal({ isOpen, onClose, emailData, onConfirmSend }) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Mail className="w-5 h-5 text-blue-600" />
                        Aperçu de l'email
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Destinataire
                        </label>
                        <input
                            type="text"
                            value={emailData.email}
                            disabled
                            className="w-full p-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Objet
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Message
                        </label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={12}
                            className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        />
                    </div>

                    <p className="text-xs text-gray-500 italic">
                        Vous pouvez modifier le contenu avant l'envoi. L'email s'ouvrira dans votre application de messagerie.
                    </p>
                </div>

                <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSend}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                        Ouvrir dans ma messagerie
                    </button>
                </div>
            </div>
        </div>
    );
}
