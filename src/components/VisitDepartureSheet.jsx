import { useState } from 'react';
import { X, Check, Mic, Sparkles, CheckCircle2, MapPin } from 'lucide-react';
import { getQuickValue, isQuickAnswered } from '../utils/visitStops';
import { getContexteValue } from '../utils/surveyText';

/**
 * « Avant de partir » : ce qui manque pour chiffrer, tant qu'on est encore sur
 * place. Chaque point se règle ici — une pastille, deux mots, ou une dictée —
 * plutôt que d'être découvert au bureau.
 *
 * Monté à l'ouverture : la liste est figée à ce moment-là, pour qu'un point
 * qu'on vient de renseigner reste sous le doigt (choix multiple, correction)
 * au lieu de disparaître.
 */
const VisitDepartureSheet = ({
    departure, survey, onClose, onQuickToggle, onText, onGoToStop, onDictate, onFinish, canFinish = false,
}) => {
    const [items] = useState(() => departure.missing);
    const [stops] = useState(() => departure.unseenStops);
    const nothing = items.length === 0 && stops.length === 0;

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Avant de partir">
            <button type="button" className="flex-1" onClick={onClose} aria-label="Fermer" />
            <div className="bg-white rounded-t-3xl max-h-[88vh] flex flex-col">
                <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-base">Avant de partir</p>
                        <p className="text-xs text-gray-500">
                            {nothing ? 'Tout ce qu\'il faut pour chiffrer est là.' : 'Ce qui manque pour chiffrer sans revenir.'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-gray-400" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    {nothing && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm font-semibold text-emerald-800">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                            Rien à signaler : tous les postes sont vus, les points clés sont renseignés.
                        </div>
                    )}

                    {stops.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Pas encore vus</p>
                            <div className="flex flex-wrap gap-1.5">
                                {stops.map((stop) => (
                                    <button
                                        key={stop.key}
                                        type="button"
                                        onClick={() => onGoToStop(stop.label)}
                                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-300 text-gray-800 active:scale-95"
                                    >
                                        <MapPin className="w-4 h-4 text-gray-400" />
                                        {stop.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {items.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Points clés à renseigner</p>
                            {items.map((item) => {
                                if (item.kind === 'quick') {
                                    const value = getQuickValue(survey, item.spec.key);
                                    const isOn = (option) => (item.spec.multi
                                        ? Array.isArray(value) && value.includes(option)
                                        : value === option);
                                    return (
                                        <div key={item.key}>
                                            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1.5">
                                                {item.label}
                                                {item.spec.multi && <span className="text-xs font-normal text-gray-400">plusieurs choix</span>}
                                                {isQuickAnswered(survey, item.spec.key) && <Check className="w-4 h-4 text-emerald-500" aria-label="Renseigné" />}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.spec.options.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        aria-pressed={isOn(option.value)}
                                                        onClick={() => onQuickToggle(item.spec, option.value)}
                                                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                                            isOn(option.value)
                                                                ? 'bg-violet-600 text-white'
                                                                : 'bg-white border border-gray-200 text-gray-700 active:scale-95'
                                                        }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                if (item.kind === 'text') {
                                    const value = String(getContexteValue(survey, item.key.replace(/^contexte\./, '')) ?? '');
                                    return (
                                        <label key={item.key} className="block">
                                            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1.5">
                                                {item.label}
                                                {value.trim() && <Check className="w-4 h-4 text-emerald-500" aria-label="Renseigné" />}
                                            </span>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={(e) => onText(item.key, e.target.value)}
                                                placeholder="Deux mots suffisent — ou dites-le dans une dictée"
                                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </label>
                                    );
                                }
                                if (item.kind === 'dictate') {
                                    return (
                                        <div key={item.key} className="flex items-center gap-2">
                                            <p className="flex-1 text-sm font-semibold text-gray-800">
                                                {item.label}
                                                <span className="block text-xs font-normal text-gray-500">Pas encore dictée.</span>
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => onDictate(item.stop)}
                                                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold active:scale-95"
                                            >
                                                <Mic className="w-4 h-4" />
                                                Dicter
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <p key={item.key} className="text-sm font-semibold text-gray-800">
                                        {item.label}
                                        <span className="block text-xs font-normal text-gray-500">Dictez ou photographiez au moins une pièce.</span>
                                    </p>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex gap-2 p-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3.5 rounded-2xl bg-white border border-gray-300 text-gray-800 font-semibold active:scale-[0.98]"
                    >
                        Continuer la visite
                    </button>
                    {canFinish && (
                        <button
                            type="button"
                            onClick={onFinish}
                            className="flex-1 py-3.5 rounded-2xl bg-violet-600 text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            <Sparkles className="w-5 h-5" />
                            Terminer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisitDepartureSheet;
