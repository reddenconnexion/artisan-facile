import React from 'react';
import { PenLine, CheckCircle } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

export const SignatureSection = ({
    formData, setFormData, updateField, openSignaturePad,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-500" />
            Signature client
        </h2>
        {formData.client_signature ? (
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Signature enregistrée
                    {formData.signed_at && (
                        <span className="text-gray-500 dark:text-gray-400">
                            — {formatDateTime(formData.signed_at)}
                        </span>
                    )}
                </div>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-gray-50 dark:bg-gray-700 inline-block">
                    <img
                        src={formData.client_signature}
                        alt="Signature client"
                        className="max-h-24 w-auto"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nom du signataire</label>
                        <input
                            type="text"
                            value={formData.signer_name}
                            onChange={e => updateField('signer_name', e.target.value)}
                            placeholder="Nom et prénom"
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios"
                        />
                    </div>
                    <button
                        onClick={() => {
                            setFormData(prev => ({ ...prev, client_signature: null, signed_at: null, status: 'completed' }));
                        }}
                        className="mt-5 text-xs text-red-500 hover:text-red-700 underline"
                    >
                        Effacer la signature
                    </button>
                </div>
            </div>
        ) : (
            <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Faites signer le rapport par le client pour valider l'intervention.
                </p>
                <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du signataire</label>
                    <input
                        type="text"
                        value={formData.signer_name}
                        onChange={e => updateField('signer_name', e.target.value)}
                        placeholder="Nom et prénom du client"
                        className="w-full md:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-ios focus:border-transparent"
                    />
                </div>
                <button
                    onClick={openSignaturePad}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                >
                    <PenLine className="w-4 h-4" />
                    Ouvrir le pad de signature
                </button>
            </div>
        )}
    </div>
);
