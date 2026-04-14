import React from 'react';
import { Sparkles, Clock, X, ChevronRight } from 'lucide-react';

/**
 * Modal d'offre d'essai IA — affiché lorsque l'utilisateur crée son 2ème devis
 * et n'a pas encore utilisé l'essai IA gratuit.
 *
 * Props:
 *  - isOpen         : boolean
 *  - onTryAI        : () => void  — l'utilisateur accepte l'essai IA
 *  - onSkip         : () => void  — l'utilisateur préfère continuer manuellement
 *  - firstQuoteTime : number | null  — durée en secondes du 1er devis traditionnel
 */
const AITrialOfferModal = ({ isOpen, onTryAI, onSkip, firstQuoteTime }) => {
    if (!isOpen) return null;

    const formatTime = (seconds) => {
        if (!seconds) return null;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m === 0) return `${s} sec`;
        if (s === 0) return `${m} min`;
        return `${m} min ${s} sec`;
    };

    const formattedFirstTime = formatTime(firstQuoteTime);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
                {/* Bande colorée en haut */}
                <div className="h-2 bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500" />

                {/* Bouton fermer */}
                <button
                    onClick={onSkip}
                    className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Continuer manuellement"
                >
                    <X size={18} />
                </button>

                <div className="p-6">
                    {/* Icône */}
                    <div className="flex items-center justify-center w-14 h-14 bg-purple-100 dark:bg-purple-900/40 rounded-2xl mx-auto mb-4">
                        <Sparkles size={28} className="text-purple-600 dark:text-purple-400" />
                    </div>

                    {/* Titre */}
                    <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                        Créez ce devis avec l'IA
                    </h2>

                    {/* Sous-titre contextuel */}
                    {formattedFirstTime ? (
                        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-5">
                            Votre premier devis a pris{' '}
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                                {formattedFirstTime}
                            </span>{' '}
                            en mode traditionnel.{' '}
                            <span className="text-purple-600 dark:text-purple-400 font-medium">
                                L'IA peut vous faire gagner jusqu'à 80 % de ce temps.
                            </span>
                        </p>
                    ) : (
                        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-5">
                            Décrivez votre chantier en quelques mots et l'IA génère toutes les
                            lignes de votre devis en quelques secondes.
                        </p>
                    )}

                    {/* Points clés */}
                    <ul className="space-y-2 mb-6">
                        {[
                            'Décrivez votre chantier librement',
                            "L'IA génère les lignes avec quantités et prix",
                            'Vous ajustez et enregistrez en un clic',
                        ].map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mt-0.5">
                                    <span className="text-purple-600 dark:text-purple-400 text-xs font-bold">{i + 1}</span>
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>

                    {/* Badge essai gratuit */}
                    <div className="flex items-center justify-center gap-1.5 mb-5">
                        <Clock size={13} className="text-green-600 dark:text-green-400" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                            Essai unique et gratuit — sans engagement
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onTryAI}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                            <Sparkles size={16} />
                            Essayer l'IA maintenant
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={onSkip}
                            className="w-full px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Continuer manuellement
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AITrialOfferModal;
