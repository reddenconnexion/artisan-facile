import { ChevronDown, RotateCcw } from 'lucide-react';
import { DEFAULT_QUOTE_PROMPT } from '../../utils/aiService';
import { coefficientFromCatalog } from '../../utils/priceLibraryCsv';

const AdvancedSettingsSection = ({
    formData,
    setFormData,
    showAdvanced,
    setShowAdvanced,
    apiKeyConfigured,
    apiKeyInput,
    setApiKeyInput,
    savingApiKey,
    handleSaveApiKey,
    handleDeleteApiKey,
    calcCatalog,
    setCalcCatalog,
    calcDiscount,
    setCalcDiscount,
}) => {
    return (
        <>
            <div className="mt-8">
                <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors mb-3"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    Paramètres avancés (IA, zones de déplacement)
                </button>
            </div>
            {showAdvanced && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-800/40 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-200 mb-4 flex items-center">
                        <span className="mr-2">✨</span>
                        Intelligence Artificielle
                    </h3>
                    <p className="text-sm text-purple-800 dark:text-purple-300 mb-6">
                        Configurez votre clé API pour activer les fonctionnalités d'assistant intelligent (génération de devis automatique, etc.).
                    </p>

                    <div className="max-w-md space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">Fournisseur d'IA</label>
                            <div className="flex gap-2 p-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'openai' });
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(!formData.ai_provider || formData.ai_provider === 'openai')
                                        ? 'bg-white dark:bg-gray-900 text-purple-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    OpenAI (GPT)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'gemini' });
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formData.ai_provider === 'gemini'
                                        ? 'bg-white dark:bg-gray-900 text-blue-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    Google Gemini
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">
                                Clé API ({(!formData.ai_provider || formData.ai_provider === 'openai') ? 'OpenAI' : 'Gemini'})
                            </label>
                            {apiKeyConfigured && !apiKeyInput ? (
                                <div className="flex items-center gap-2">
                                    <span className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800/40 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 text-sm">
                                        ✓ Clé configurée
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setApiKeyInput(' ')}
                                        className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                                    >
                                        Modifier
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteApiKey}
                                        disabled={savingApiKey}
                                        className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm disabled:opacity-50"
                                    >
                                        Supprimer
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="password"
                                        placeholder={(!formData.ai_provider || formData.ai_provider === 'openai') ? "sk-..." : "AIza..."}
                                        className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                        value={apiKeyInput.trim() === '' ? '' : apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        autoFocus={apiKeyConfigured}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveApiKey}
                                        disabled={savingApiKey || !apiKeyInput.trim()}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {savingApiKey ? 'Sauvegarde…' : 'Sauvegarder'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-purple-100 dark:border-purple-800/40">
                            <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-3">Personnalisation du contexte</h4>

                            <div>
                                <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Taux Horaire Moyen (€/h)</label>
                                <input
                                    type="number"
                                    placeholder="ex: 50"
                                    className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    value={formData.ai_hourly_rate || ''}
                                    onChange={(e) => {
                                        setFormData({ ...formData, ai_hourly_rate: e.target.value });
                                    }}
                                />
                            </div>

                            <div className="mt-3">
                                <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Coefficient de marge par défaut</label>
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    placeholder="ex: 1.9"
                                    className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    value={formData.default_margin_coefficient || ''}
                                    onChange={(e) => {
                                        setFormData({ ...formData, default_margin_coefficient: e.target.value });
                                    }}
                                />
                                <p className="text-xs text-purple-600/70 dark:text-purple-300/60 mt-1">
                                    Dans la Bibliothèque de Prix, le prix de vente est pré-calculé : <strong>prix d'achat réel × coefficient</strong>.
                                    Attention : ce coefficient s'applique à votre coût fournisseur (ex. Sonepar), <strong>pas</strong> au prix catalogue public.
                                    N'y reportez pas votre marge catalogue (ex. 1,25) : sur un coût déjà remisé, elle brade vos prix. Utilisez le calculateur.
                                </p>

                                {/* Calculateur : marge catalogue + remise fournisseur → coefficient */}
                                {(() => {
                                    const suggestedCoef = coefficientFromCatalog(calcCatalog, calcDiscount);
                                    return (
                                        <div className="mt-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40">
                                            <p className="text-xs font-semibold text-purple-800 dark:text-purple-200 mb-2">Trouver mon coefficient</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-purple-700 dark:text-purple-300 mb-1">Marge sur catalogue</label>
                                                    <input
                                                        type="number"
                                                        step="0.05"
                                                        min="0"
                                                        placeholder="1.25"
                                                        className="w-full px-2 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                                        value={calcCatalog}
                                                        onChange={(e) => setCalcCatalog(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-purple-700 dark:text-purple-300 mb-1">Remise fournisseur (%)</label>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max="99"
                                                        placeholder="ex: 35"
                                                        className="w-full px-2 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                                        value={calcDiscount}
                                                        onChange={(e) => setCalcDiscount(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-purple-500/80 dark:text-purple-300/60 mt-1.5">= marge catalogue ÷ (1 − remise fournisseur)</p>
                                            <div className="flex items-center justify-between gap-2 mt-2">
                                                <p className="text-sm text-purple-800 dark:text-purple-200">
                                                    Coefficient conseillé : <strong>{suggestedCoef !== null ? suggestedCoef : '—'}</strong>
                                                </p>
                                                <button
                                                    type="button"
                                                    disabled={suggestedCoef === null}
                                                    onClick={() => setFormData({ ...formData, default_margin_coefficient: String(suggestedCoef) })}
                                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Utiliser ce coefficient
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-2">Zones de Déplacement (Auto-calculé)</label>
                            <div className="space-y-2">
                                {[1, 2, 3].map((zoneIndex) => {
                                    const radiusKey = `zone${zoneIndex}_radius`;
                                    const priceKey = `zone${zoneIndex}_price`;
                                    return (
                                        <div key={zoneIndex} className="flex gap-2 items-center">
                                            <span className="text-xs text-purple-600 dark:text-purple-300 w-12 font-medium">Zone {zoneIndex}</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="km"
                                                    className="w-full pl-3 pr-8 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                                                    value={formData[radiusKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [radiusKey]: val }));
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400 dark:text-gray-500">km</span>
                                            </div>
                                            <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="€"
                                                    className="w-full pl-3 pr-6 py-1.5 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm"
                                                    value={formData[priceKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [priceKey]: val }));
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400 dark:text-gray-500">€</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-purple-600 mt-1">
                                Laissez vide pour désactiver une zone. Le calcul se fera automatiquement selon l'adresse du client.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Instructions Spéciales pour l'IA</label>
                            <textarea
                                rows={3}
                                placeholder="Ex: Ne touche jamais à l'électricité. Ajoute toujours 10% de marge sur les matériaux. Je suis plombier spécialisé..."
                                className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                                value={formData.ai_instructions || ''}
                                onChange={(e) => {
                                    setFormData({ ...formData, ai_instructions: e.target.value });
                                }}
                            />
                        </div>

                        {/* Prompt de génération de devis */}
                        <div className="border-t border-purple-100 dark:border-purple-800/40 pt-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-medium text-purple-800">
                                    Prompt de génération de devis
                                </label>
                                <div className="flex items-center gap-2">
                                    {formData.quote_system_prompt && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, quote_system_prompt: '' }))}
                                            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors"
                                            title="Restaurer le prompt par défaut"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Restaurer défaut
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-[11px] text-purple-600 mb-2">
                                Ce prompt est envoyé à l'IA à chaque génération de devis (vocal, IA, visite chantier).
                                Modifiez-le pour adapter les règles de tarification, les unités, ou le style.
                                {!formData.quote_system_prompt && ' Le prompt par défaut est actuellement utilisé.'}
                            </p>
                            <textarea
                                rows={10}
                                placeholder={DEFAULT_QUOTE_PROMPT}
                                className="w-full px-3 py-2 border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-xs font-mono resize-y"
                                value={formData.quote_system_prompt || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, quote_system_prompt: e.target.value }))}
                            />
                            {!formData.quote_system_prompt && (
                                <p className="text-[10px] text-purple-500 mt-1 italic">
                                    Laissez vide pour utiliser le prompt par défaut (visible en transparence ci-dessus).
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}
        </>
    );
};

export default AdvancedSettingsSection;
