import React from 'react';
import { Save, Send, CheckCircle } from 'lucide-react';

const PdpSection = ({
    pdpKeyConfigured,
    pdpUrlInput,
    setPdpUrlInput,
    pdpServiceInput,
    setPdpServiceInput,
    pdpKeyInput,
    setPdpKeyInput,
    savingPdpConfig,
    handleSavePdpConfig,
    handleDeletePdpConfig,
}) => {
    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                    <Send className="w-5 h-5 mr-2 text-indigo-600" />
                    Plateforme Agréée — Facturation électronique
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    Connectez votre Plateforme Agréée (PA) pour transmettre automatiquement vos factures à l'administration fiscale.
                    Obligatoire à partir de septembre 2027 pour les micro-entreprises.{' '}
                    <a href="https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        Consulter la liste des PA immatriculées →
                    </a>
                </p>

                {pdpKeyConfigured && !pdpKeyInput && (
                    <div className="flex items-center gap-2 mb-4 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Plateforme Agréée configurée — {pdpUrlInput || 'URL enregistrée'}</span>
                    </div>
                )}

                <div className="space-y-3 max-w-lg">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL de l'API de la PA</label>
                        <input
                            type="url"
                            value={pdpUrlInput}
                            onChange={e => setPdpUrlInput(e.target.value)}
                            placeholder="https://api.ma-plateforme-agreee.fr/v1"
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la plateforme</label>
                        <input
                            type="text"
                            value={pdpServiceInput}
                            onChange={e => setPdpServiceInput(e.target.value)}
                            placeholder="ex: chorus_pro, yooz, pennylane…"
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Clé API / Bearer token {pdpKeyConfigured && <span className="text-green-600 font-normal">(déjà configurée)</span>}
                        </label>
                        <input
                            type="password"
                            value={pdpKeyInput}
                            onChange={e => setPdpKeyInput(e.target.value)}
                            placeholder={pdpKeyConfigured ? "Laissez vide pour conserver la clé existante" : "Entrez votre clé API…"}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleSavePdpConfig}
                            disabled={savingPdpConfig || !pdpUrlInput.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm transition-colors flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {savingPdpConfig ? 'Sauvegarde…' : 'Sauvegarder la configuration PDP'}
                        </button>
                        {pdpKeyConfigured && (
                            <button
                                type="button"
                                onClick={handleDeletePdpConfig}
                                disabled={savingPdpConfig}
                                className="px-4 py-2 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/40 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 font-medium text-sm transition-colors"
                            >
                                Supprimer
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PdpSection;
