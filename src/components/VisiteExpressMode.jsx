import React, { useState } from 'react';
import {
    Mic, Square, Camera, Flag, Undo2, Plus, MapPin, Check, Clock,
    ClipboardCheck, Radio, AlertTriangle,
} from 'lucide-react';
import { formatDuration } from '../utils/siteVisitConfig';
import { zoneCounters } from '../utils/visitCapture';

// Mode express : l'écran de visite pendant que le client parle.
// Principe : le micro tourne du début à la fin, l'artisan n'a rien à piloter.
// Les pastilles (pièce, compteurs, photo, point à voir) sont un bonus pour ce
// qui ne se dit pas à voix haute — jamais un passage obligé.
// Composants présentationnels : la logique vit dans VisiteTechniqueMode et
// utils/visitCapture.js.

const buzz = (ms = 15) => {
    try { navigator.vibrate?.(ms); } catch { /* vibration non supportée */ }
};

const entryLabel = (entry, template) => {
    switch (entry.type) {
        case 'zone': return `→ ${entry.zone || 'Pièce non précisée'}`;
        case 'count': {
            const counter = (template.zoneCounters || []).find((c) => c.key === entry.counterKey);
            const name = counter?.short || counter?.label || entry.counterKey;
            return `${entry.delta > 0 ? '+' : ''}${entry.delta} ${name.toLowerCase()}`;
        }
        case 'voice': return `Enregistrement — ${formatDuration(Math.round(entry.duration || 0))}`;
        case 'photo': return 'Photo';
        case 'flag': return 'Point à voir';
        default: return '';
    }
};

const ENTRY_STYLES = {
    zone: 'bg-violet-100 text-violet-700',
    count: 'bg-gray-100 text-gray-700',
    voice: 'bg-blue-100 text-blue-700',
    photo: 'bg-emerald-100 text-emerald-700',
    flag: 'bg-orange-100 text-orange-700',
};

const clock = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Corps de l'écran express : état d'enregistrement, pièces, fil de la visite. */
const VisiteExpressMode = ({
    template, survey, capture, onZoneChange,
    isRecording, elapsed, segmentCount,
    level = 0, isSilent = false, micId = '', micLabel = '', micInputs = [], onPickMic,
}) => {
    const [customOpen, setCustomOpen] = useState(false);
    const [customName, setCustomName] = useState('');

    // Pastilles : les pièces déjà relevées d'abord, puis les propositions du métier.
    const known = (survey.zones || []).map((z) => (z.name || '').trim()).filter(Boolean);
    const presets = (template.zonePresets || []).filter(
        (p) => !known.some((k) => k.toLowerCase() === p.toLowerCase())
    );
    const chips = [...known, ...presets];

    const pick = (name) => { buzz(); onZoneChange(name); };

    const addCustom = () => {
        const name = customName.trim();
        if (!name) return;
        pick(name);
        setCustomName('');
        setCustomOpen(false);
    };

    const entries = [...(capture.entries || [])].reverse();

    return (
        <div className="p-3 space-y-3">
            {/* État de l'enregistrement */}
            {isRecording ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-500 text-white rounded-2xl">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold leading-tight">Visite enregistrée</p>
                        <p className="text-xs text-red-100">
                            Laissez le client parler — tout est capté.
                        </p>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-lg flex-shrink-0">
                        {formatDuration(elapsed)}
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-2xl">
                    <Radio className="w-4 h-4 flex-shrink-0 text-gray-400" />
                    <p className="flex-1 text-sm font-semibold">
                        {segmentCount > 0 ? 'Enregistrement en pause' : 'Micro à l\'arrêt'}
                    </p>
                    {segmentCount > 0 && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                            {segmentCount} passage{segmentCount > 1 ? 's' : ''} capté{segmentCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}

            {/* Micro utilisé + preuve que ça capte */}
            <div className="px-3 py-2 bg-white border border-gray-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <select
                        value={micId}
                        onChange={(e) => onPickMic?.(e.target.value)}
                        className="flex-1 min-w-0 text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
                        aria-label="Micro utilisé"
                    >
                        <option value="">
                            {micLabel ? `Automatique — ${micLabel}` : 'Micro automatique (choix du téléphone)'}
                        </option>
                        {micInputs
                            .filter((input) => input.deviceId)
                            .map((input) => (
                                <option key={input.deviceId} value={input.deviceId}>{input.label}</option>
                            ))}
                    </select>
                </div>
                {isRecording && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-[width] duration-100 ${isSilent ? 'bg-red-400' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }}
                        />
                    </div>
                )}
                {isRecording && isSilent && (
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        Aucun son capté depuis 15 s — vérifiez le micro avant de continuer.
                    </p>
                )}
            </div>

            {/* Pièce en cours */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-600 text-white rounded-2xl">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-violet-200">Je suis dans</span>
                <span className="flex-1 text-right font-bold truncate">
                    {capture.zone || 'aucune pièce'}
                </span>
            </div>

            {/* Changement de pièce en un tap */}
            <div className="flex flex-wrap gap-1.5">
                {chips.map((name) => (
                    <button
                        key={name}
                        type="button"
                        onClick={() => pick(name)}
                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                            (capture.zone || '').toLowerCase() === name.toLowerCase()
                                ? 'bg-violet-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-700 active:scale-95'
                        }`}
                    >
                        {name}
                    </button>
                ))}
                {!customOpen && (
                    <button
                        type="button"
                        onClick={() => setCustomOpen(true)}
                        className="px-3 py-2.5 rounded-xl text-sm font-semibold bg-white border-2 border-dashed border-violet-200 text-violet-600 active:scale-95"
                        aria-label="Autre pièce"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {customOpen && (
                <div className="flex gap-2">
                    <input
                        autoFocus
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
                        placeholder="Nom de la pièce…"
                        className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <button
                        type="button"
                        onClick={addCustom}
                        className="px-4 bg-violet-600 text-white rounded-xl font-semibold"
                        aria-label="Valider la pièce"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Le fil de la visite */}
            {entries.length === 0 ? (
                <div className="p-4 bg-white border border-gray-100 rounded-2xl text-sm text-gray-500 space-y-1.5">
                    <p className="font-semibold text-gray-700">Comment ça marche</p>
                    <p>1. Démarrez la visite : le micro tourne jusqu'au bout.</p>
                    <p>2. Faites le tour en parlant normalement avec le client.</p>
                    <p>3. Tapez la pièce quand vous changez, une photo quand ça vaut le coup — l'enregistrement continue pendant que vous photographiez.</p>
                    <p>4. À la fin, tout est transcrit et rangé par pièce.</p>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                        Prévenez le client que vous enregistrez pour préparer son devis.
                    </p>
                </div>
            ) : (
                <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden">
                    {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-2.5 px-3 py-2">
                            <span className="text-xs text-gray-400 tabular-nums flex items-center gap-1 flex-shrink-0">
                                <Clock className="w-3 h-3" />
                                {clock(entry.at)}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ENTRY_STYLES[entry.type] || 'bg-gray-100 text-gray-600'}`}>
                                {entryLabel(entry, template)}
                            </span>
                            {entry.type !== 'zone' && (
                                <span className="text-xs text-gray-400 truncate ml-auto">{entry.zone || '—'}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Pavé d'actions du mode express — pied d'écran, toujours sous le pouce.
 * Trois états : avant la visite, pendant l'enregistrement, après.
 */
export const ExpressActionPad = ({
    template,
    survey,
    capture,
    isRecording,
    isSupported,
    hasCaptured,
    onStart,
    onStop,
    onCount,
    onFlag,
    onUndo,
    onPhotos,
    onOpenCamera,
    cameraSupported,
    onFinish,
}) => {
    const photoInputRef = React.useRef(null);
    const counts = zoneCounters(survey, capture.zone);
    const counters = template.zoneCounters || [];

    if (!isRecording && !hasCaptured) {
        return (
            <div className="space-y-2">
                <button
                    type="button"
                    onClick={() => { buzz(30); onStart(); }}
                    disabled={!isSupported}
                    className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-lg flex items-center justify-center gap-3 transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                    <Mic className="w-6 h-6" />
                    Démarrer la visite
                </button>
                {!isSupported && (
                    <p className="text-xs text-center text-amber-700">
                        Micro indisponible sur cet appareil — utilisez l'onglet « Détaillé ».
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Compteurs de la pièce en cours — facultatifs */}
            {counters.length > 0 && (
                <div className={`grid gap-1.5 ${counters.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {counters.map(({ key, label, short }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => { buzz(); onCount(key, 1); }}
                            className="py-2.5 rounded-2xl bg-violet-50 border border-violet-200 text-violet-700 active:scale-95 active:bg-violet-100 transition-all"
                            aria-label={`Ajouter : ${label}`}
                        >
                            <span className="block text-2xl font-bold tabular-nums leading-none">
                                {Number(counts[key]) || 0}
                            </span>
                            <span className="block text-[11px] font-semibold mt-0.5 truncate px-1">
                                {short || label}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Photo · point à voir · annuler */}
            <div className="grid grid-cols-3 gap-1.5">
                <button
                    type="button"
                    onClick={() => {
                        buzz();
                        // Appareil intégré : la page garde la main, donc le
                        // micro aussi. Sans caméra accessible, on retombe sur
                        // l'appareil photo du téléphone.
                        if (cameraSupported) onOpenCamera();
                        else photoInputRef.current?.click();
                    }}
                    className="py-2.5 rounded-2xl bg-white border border-gray-200 text-gray-700 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                >
                    <Camera className="w-5 h-5" />
                    <span className="text-[11px] font-semibold">Photo</span>
                </button>
                <button
                    type="button"
                    onClick={() => { buzz(25); onFlag(); }}
                    className="py-2.5 rounded-2xl bg-white border border-orange-200 text-orange-600 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
                >
                    <Flag className="w-5 h-5" />
                    <span className="text-[11px] font-semibold">Point à voir</span>
                </button>
                <button
                    type="button"
                    onClick={() => { buzz(); onUndo(); }}
                    disabled={!capture.entries?.length}
                    className="py-2.5 rounded-2xl bg-white border border-gray-200 text-gray-500 flex flex-col items-center gap-0.5 active:scale-95 transition-transform disabled:opacity-40"
                >
                    <Undo2 className="w-5 h-5" />
                    <span className="text-[11px] font-semibold">Annuler</span>
                </button>
            </div>

            {isRecording ? (
                <button
                    type="button"
                    onClick={() => { buzz(30); onStop(); }}
                    className="w-full py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold flex items-center justify-center gap-3 transition-colors active:scale-[0.98]"
                >
                    <Square className="w-5 h-5" />
                    Terminer la visite
                </button>
            ) : (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => { buzz(); onStart(); }}
                        disabled={!isSupported}
                        className="px-4 py-3.5 rounded-2xl bg-white border border-red-200 text-red-600 font-semibold flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                    >
                        <Mic className="w-5 h-5" />
                        Reprendre
                    </button>
                    <button
                        type="button"
                        onClick={onFinish}
                        className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                    >
                        <ClipboardCheck className="w-5 h-5" />
                        Compte rendu
                    </button>
                </div>
            )}

            <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => { onPhotos(e.target.files); e.target.value = ''; }}
            />
        </div>
    );
};

export default VisiteExpressMode;
