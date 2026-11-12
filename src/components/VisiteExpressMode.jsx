import React, { useState } from 'react';
import {
    Mic, Square, Camera, Flag, Undo2, Plus, Check, Clock, ChevronDown, ChevronUp, Settings2,
    Sparkles, Radio, AlertTriangle, Loader2, CloudUpload, RefreshCw, Trash2, MessagesSquare,
    Circle, CircleAlert, CircleCheck, ClipboardCheck, ChevronRight,
} from 'lucide-react';
import { formatDuration } from '../utils/siteVisitConfig';
import { zoneCounters } from '../utils/visitCapture';
import { stopForZone, stopStatus, quickFieldSpec, getQuickValue } from '../utils/visitStops';

// Mode express : l'écran de visite sur le terrain. Deux façons d'enregistrer :
// - dictée (par défaut) : l'artisan touche « Dicter », dit le lieu en premier
//   (« Cuisine, … », « Tableau, … ») puis ce qu'il y a à faire, et s'arrête ;
//   la dictée se range toute seule et son texte s'affiche pour vérifier.
//   Courtes et sans bavardage, les dictées se transcrivent bien et font foi ;
// - conversation entière : le micro tourne du début à la fin pendant que le
//   client parle, à trier ensuite.
// La grille des points de passage (demande, tableau, comptage…) se parcourt
// dans l'ordre où le client emmène l'artisan : elle montre ce qui est vu et ce
// qui reste, et chaque poste ouvre son pense-bête et ses réponses en un tap.
// Les pastilles (pièce, compteurs, photo, point à voir) complètent ce qui ne
// se dit pas à voix haute — jamais un passage obligé.
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
        case 'voice': return `${entry.kind === 'dictation' ? 'Dictée' : 'Enregistrement'} — ${formatDuration(Math.round(entry.duration || 0))}`;
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

/** Choix de la façon d'enregistrer, tant que le micro est coupé. */
const CaptureStyleSwitch = ({ value, onChange }) => (
    <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl" role="radiogroup" aria-label="Façon d'enregistrer">
        {[
            { key: 'dictation', label: 'Dictée par pièce', Icon: Mic },
            { key: 'continuous', label: 'Conversation entière', Icon: MessagesSquare },
        ].map(({ key, label, Icon }) => (
            <button
                key={key}
                type="button"
                role="radio"
                aria-checked={value === key}
                onClick={() => onChange?.(key)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    value === key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
                }`}
            >
                <Icon className="w-3.5 h-3.5" />
                {label}
            </button>
        ))}
    </div>
);

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Corps de l'écran express : état d'enregistrement, lieux, fil de la visite. */
const VisiteExpressMode = ({
    template, survey, capture, onZoneChange,
    isRecording, elapsed, segmentCount,
    level = 0, isSilent = false, micId = '', micLabel = '', micInputs = [], onPickMic,
    photos = [], onRetryPhotos, onOpenPhoto,
    voiceNotes = [], transcripts = {}, voiceStatus = {}, onRetryTranscriptions,
    captureStyle = 'continuous', onCaptureStyleChange, dictationTopics = [], onDeleteVoice, onMoveVoice,
    onQuickToggle, departure = null, onOpenDeparture,
}) => {
    // Points de passage du métier : toujours à l'écran, dans n'importe quel ordre.
    const stops = template.stops || [];
    const isStop = (name) => stops.some((s) => sameName(s.label, name));
    const currentStop = stopForZone(template, capture.zone);
    const quickSpecs = (currentStop?.quick || []).map((key) => quickFieldSpec(template, key)).filter(Boolean);

    // null : sans grille, la liste des pièces s'ouvre d'elle-même tant
    // qu'aucune n'a servi.
    const [moreOpen, setMoreOpen] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [customName, setCustomName] = useState('');
    const dictating = captureStyle === 'dictation';

    // Lieux déjà passés, dans l'ordre de la visite : ce sont eux qu'on
    // retouche le plus. Le reste se déplie — ou se dit à voix haute.
    const topics = dictating ? dictationTopics : [];
    const isTopic = (name) => dictationTopics.some((t) => sameName(t, name));
    const visited = [];
    const remember = (name) => {
        const clean = String(name ?? '').trim();
        // Les postes ont leur tuile dans la grille : pas de pastille en double.
        if (clean && !isStop(clean) && !visited.some((v) => sameName(v, clean))) visited.push(clean);
    };
    (capture.entries || []).forEach((e) => remember(e.zone));
    (survey.zones || []).forEach((z) => remember(z.name));
    remember(capture.zone);
    const unvisited = (list) => (list || []).filter((p) => !visited.some((v) => sameName(v, p)));
    const otherRooms = unvisited(template.zonePresets);
    const otherTopics = unvisited(topics).filter((t) => !isStop(t));
    const showMore = moreOpen ?? (stops.length === 0 && visited.length === 0);
    // Postes à voir et points clés se comptent à part : un poste pas encore
    // vu porte souvent lui-même un point clé.
    const toSeeParts = departure ? [
        departure.missing.length ? `${departure.missing.length} point${departure.missing.length > 1 ? 's' : ''} clé${departure.missing.length > 1 ? 's' : ''}` : '',
        departure.unseenStops.length ? `${departure.unseenStops.length} poste${departure.unseenStops.length > 1 ? 's' : ''} à voir` : '',
    ].filter(Boolean) : [];
    const toSee = toSeeParts.length;

    const pick = (name) => { buzz(); onZoneChange(name); setMoreOpen(false); };

    const addCustom = () => {
        const name = customName.trim();
        if (!name) return;
        pick(name);
        setCustomName('');
    };

    const chipClass = (name) => `px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        sameName(capture.zone, name)
            ? 'bg-violet-600 text-white'
            : isTopic(name)
                ? 'bg-amber-50 border border-amber-200 text-amber-800 active:scale-95'
                : 'bg-white border border-gray-200 text-gray-700 active:scale-95'
    }`;

    // Où ranger une dictée à la main : lieux de la visite, puis le reste.
    const movePlaces = [...stops.map((s) => s.label), ...visited, ...otherRooms, ...unvisited(dictationTopics).filter((t) => !isStop(t))];
    const spokenExamples = [template.zonePresets?.[0] || 'Cuisine', template.hasTableau ? 'Tableau' : '']
        .filter(Boolean).map((n) => `« ${n}, … »`).join(' ou ');

    const entries = [...(capture.entries || [])].reverse();
    const pendingPhotos = photos.filter((p) => !p.path).length;
    const failedPhotos = photos.filter((p) => p.failed && !p.path).length;

    // Transcription : ce qui est fait, ce qui tourne, ce qui a échoué.
    const transcribedNotes = voiceNotes.filter((n) => transcripts[n.id] !== undefined).length;
    const transcribingNotes = voiceNotes.filter((n) => ['pending', 'transcribing'].includes(voiceStatus[n.id]?.state)).length;
    const failedNotes = voiceNotes.filter((n) => voiceStatus[n.id]?.state === 'failed');
    const firstFailure = failedNotes.map((n) => voiceStatus[n.id]?.error).find(Boolean);

    const micSelect = (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-2xl">
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
    );

    return (
        <div className="p-3 space-y-3">
            {/* État de l'enregistrement */}
            {dictating ? (
                isRecording ? (
                    <div className="px-4 py-3 bg-red-500 text-white rounded-2xl space-y-1.5">
                        <div className="flex items-center gap-3">
                            <span className="relative flex h-3 w-3 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                            </span>
                            <p className="flex-1 min-w-0 font-bold leading-tight truncate">
                                Dictée — {capture.zone || 'dites le lieu en premier'}
                            </p>
                            <span className="font-mono font-bold tabular-nums text-lg flex-shrink-0">
                                {formatDuration(elapsed)}
                            </span>
                        </div>
                        <p className="text-xs text-red-100">
                            {currentStop
                                ? `À dire : ${currentStop.memo.join(' · ')}.`
                                : `${capture.zone ? 'Autre lieu ? Dites son nom en premier. Puis' : 'Le lieu, puis'} : l'existant · à faire · combien · qui fournit · les contraintes.`}
                        </p>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-2xl">
                        <Mic className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        <p className="flex-1 text-sm font-semibold">
                            {capture.zone
                                ? `Prêt à dicter : ${capture.zone}`
                                : `Touchez « Dicter » et dites le lieu en premier : ${spokenExamples}`}
                        </p>
                    </div>
                )
            ) : isRecording ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-500 text-white rounded-2xl">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold leading-tight">
                            Visite enregistrée{capture.zone ? ` — ${capture.zone}` : ''}
                        </p>
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

            {/* Preuve que ça capte — et le micro sous la main si ce n'est pas le cas */}
            {isRecording && (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-[width] duration-100 ${isSilent ? 'bg-red-400' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }}
                    />
                </div>
            )}
            {isRecording && isSilent && (
                <>
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        Aucun son capté depuis 15 s — vérifiez le micro avant de continuer.
                    </p>
                    {!settingsOpen && micSelect}
                </>
            )}

            {/* Points de passage : ce qui est vu, ce qui reste — sans ordre imposé */}
            {stops.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                    {stops.map((stop) => {
                        const { state } = stopStatus({ stop, template, survey, capture });
                        const current = sameName(capture.zone, stop.label);
                        const StateIcon = state === 'done' ? CircleCheck : state === 'partial' ? CircleAlert : Circle;
                        const stateLabel = state === 'done' ? 'vu' : state === 'partial' ? 'une réponse manque' : 'pas encore vu';
                        return (
                            <button
                                key={stop.key}
                                type="button"
                                onClick={() => pick(stop.label)}
                                aria-pressed={current}
                                aria-label={`${stop.label} — ${stateLabel}`}
                                className={`flex flex-col items-start gap-1 px-2 py-2 rounded-xl text-left text-[13px] leading-tight font-semibold transition-colors active:scale-95 ${
                                    current
                                        ? 'bg-violet-600 text-white'
                                        : state === 'done'
                                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                                            : state === 'partial'
                                                ? 'bg-amber-50 border border-amber-300 text-amber-900'
                                                : 'bg-white border border-gray-200 text-gray-700'
                                }`}
                            >
                                <StateIcon className={`w-4 h-4 ${
                                    current ? 'text-violet-200'
                                        : state === 'done' ? 'text-emerald-600'
                                            : state === 'partial' ? 'text-amber-600' : 'text-gray-300'
                                }`} />
                                {stop.short || stop.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Le poste en cours : son pense-bête et ses réponses en un tap */}
            {currentStop && (
                <div className="p-3 bg-white border border-violet-200 rounded-2xl space-y-2.5">
                    <div>
                        <p className="text-sm font-bold text-gray-900">{currentStop.label}</p>
                        <p className="text-xs text-gray-500 leading-snug">À dire : {currentStop.memo.join(' · ')}.</p>
                    </div>
                    {quickSpecs.map((spec) => {
                        const value = getQuickValue(survey, spec.key);
                        const isOn = (option) => (spec.multi ? Array.isArray(value) && value.includes(option) : value === option);
                        return (
                            <div key={spec.key}>
                                <p className="text-xs font-semibold text-gray-500 mb-1">
                                    {spec.label}{spec.multi ? ' — plusieurs choix' : ''}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {spec.options.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={isOn(option.value)}
                                            onClick={() => { buzz(); onQuickToggle?.(spec, option.value); }}
                                            className={`px-2.5 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
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
                    })}
                </div>
            )}

            {/* Pièces de la visite : un tap pour y revenir */}
            <div className="space-y-2">
                {(visited.length > 0 || stops.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                        {visited.map((name) => (
                            <button key={name} type="button" onClick={() => pick(name)} className={chipClass(name)}>
                                {name}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setMoreOpen(!showMore)}
                            aria-expanded={showMore}
                            className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-white border-2 border-dashed border-violet-200 text-violet-600 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            {stops.length > 0 ? 'Pièce' : 'Autre lieu'}
                        </button>
                    </div>
                )}

                {showMore && (
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl space-y-2.5">
                        {dictating && (
                            <p className="text-xs text-gray-500">
                                Facultatif : le lieu dit en premier dans la dictée suffit.
                            </p>
                        )}
                        {otherRooms.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {otherRooms.map((name) => (
                                    <button key={name} type="button" onClick={() => pick(name)} className={chipClass(name)}>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        )}
                        {otherTopics.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Hors pièce</span>
                                {otherTopics.map((name) => (
                                    <button key={name} type="button" onClick={() => pick(name)} className={chipClass(name)}>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
                                placeholder="Autre nom de pièce…"
                                className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <button
                                type="button"
                                onClick={addCustom}
                                disabled={!customName.trim()}
                                className="px-4 bg-violet-600 text-white rounded-xl font-semibold disabled:opacity-40"
                                aria-label="Valider la pièce"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Avant de partir : ce qui manque, tant qu'on est sur place */}
            {departure && departure.total > 0 && entries.length > 0 && (
                <button
                    type="button"
                    onClick={onOpenDeparture}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold text-left active:scale-[0.99] ${
                        toSee > 0
                            ? 'bg-amber-50 border border-amber-300 text-amber-900'
                            : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    }`}
                >
                    <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">Avant de partir</span>
                    <span className="text-xs font-bold">
                        {toSee > 0 ? toSeeParts.join(' · ') : 'tout y est'}
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                </button>
            )}

            {/* Photos de la visite, avec leur état d'enregistrement */}
            {photos.length > 0 && (
                <div className="px-3 py-2.5 bg-white border border-gray-200 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <p className="flex-1 text-xs font-bold text-gray-500 uppercase tracking-wide">
                            {photos.length} photo{photos.length > 1 ? 's' : ''}
                        </p>
                        {pendingPhotos > 0 ? (
                            <span className="text-xs font-semibold text-amber-600">
                                {pendingPhotos} en attente
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CloudUpload className="w-3.5 h-3.5" />
                                enregistrées
                            </span>
                        )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto">
                        {photos.map((photo, index) => (
                            <button
                                key={photo.id}
                                type="button"
                                onClick={() => onOpenPhoto?.(index)}
                                className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 active:scale-95"
                                aria-label={`Agrandir la photo ${index + 1}`}
                            >
                                <img src={photo.preview || photo.url} alt="" className="w-full h-full object-cover" />
                                {photo.uploading && (
                                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    </span>
                                )}
                                {photo.failed && !photo.path && (
                                    <span className="absolute inset-0 bg-orange-500/70 flex items-center justify-center">
                                        <AlertTriangle className="w-4 h-4 text-white" />
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {failedPhotos > 0 && (
                        <button
                            type="button"
                            onClick={onRetryPhotos}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Réessayer l'enregistrement de {failedPhotos} photo{failedPhotos > 1 ? 's' : ''}
                        </button>
                    )}
                </div>
            )}

            {/* Transcription : en dictée chaque texte s'affiche dans le fil, donc
                ce bloc ne sort que s'il y a un échec à rattraper. */}
            {voiceNotes.length > 0 && (!dictating || failedNotes.length > 0) && (
                <div className="px-3 py-2.5 bg-white border border-gray-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center gap-2">
                        <Mic className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <p className="flex-1 text-xs font-bold text-gray-500 uppercase tracking-wide">
                            Transcription
                        </p>
                        {transcribingNotes > 0 ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-violet-600">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {transcribedNotes}/{voiceNotes.length}
                            </span>
                        ) : failedNotes.length > 0 ? (
                            <span className="text-xs font-semibold text-orange-600">
                                {transcribedNotes}/{voiceNotes.length}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <Check className="w-3.5 h-3.5" />
                                {transcribedNotes}/{voiceNotes.length} transcrit{transcribedNotes > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    {failedNotes.length > 0 && (
                        <>
                            {firstFailure && (
                                <p className="text-xs text-orange-700 flex items-start gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    {firstFailure}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={onRetryTranscriptions}
                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Réessayer la transcription de {failedNotes.length} enregistrement{failedNotes.length > 1 ? 's' : ''}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Le fil de la visite */}
            {entries.length === 0 && dictating ? (
                <div className="p-4 bg-white border border-gray-100 rounded-2xl text-sm text-gray-500 space-y-1.5">
                    <p className="font-semibold text-gray-700">Comment ça marche</p>
                    <p>1. Suivez le client, dans l'ordre où il vous emmène : le micro ne tourne que pendant vos dictées.</p>
                    <p>2. Touchez « Dicter » et commencez par le lieu — {spokenExamples} — puis l'existant, ce qu'il faut faire, les quantités, qui fournit. La dictée se range toute seule.</p>
                    {stops.length > 0 && <p>3. Les tuiles du haut sont les postes à ne pas oublier ({stops.map((s) => s.short || s.label).join(', ')}) : touchez-en une pour son pense-bête et ses réponses en un tap, ou dites son nom. Elles passent au vert une fois vues.</p>}
                    <p>{stops.length > 0 ? 4 : 3}. Le texte s'affiche sous chaque dictée : relisez, changez le lieu s'il est faux, supprimez et redictez au besoin.</p>
                </div>
            ) : entries.length === 0 ? (
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
                    {entries.map((entry) => {
                        const isDictation = entry.type === 'voice' && entry.kind === 'dictation';
                        return (
                        <div key={entry.id} className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                            <span className="text-xs text-gray-400 tabular-nums flex items-center gap-1 flex-shrink-0">
                                <Clock className="w-3 h-3" />
                                {clock(entry.at)}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ENTRY_STYLES[entry.type] || 'bg-gray-100 text-gray-600'}`}>
                                {entryLabel(entry, template)}
                            </span>
                            {entry.type === 'voice' && (
                                transcripts[entry.mediaId] !== undefined
                                    ? <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Transcrit" />
                                    : voiceStatus[entry.mediaId]?.state === 'failed'
                                        ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" aria-label="Transcription en échec" />
                                        : ['pending', 'transcribing'].includes(voiceStatus[entry.mediaId]?.state)
                                            ? <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin flex-shrink-0" aria-label="Transcription en cours" />
                                            : null
                            )}
                            {isDictation && onMoveVoice ? (
                                // Le lieu d'une dictée se corrige ici, sans la refaire.
                                <select
                                    value={entry.zone || ''}
                                    onChange={(e) => { if (e.target.value) onMoveVoice(entry.mediaId, e.target.value); }}
                                    className={`ml-auto min-w-0 max-w-[45%] text-xs font-semibold bg-transparent text-right focus:outline-none ${
                                        entry.zone ? 'text-violet-700' : 'text-orange-600'
                                    }`}
                                    aria-label="Lieu de cette dictée"
                                >
                                    {!entry.zone && <option value="">À ranger…</option>}
                                    {[entry.zone, ...movePlaces.filter((p) => !sameName(p, entry.zone))].filter(Boolean).map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            ) : entry.type !== 'zone' && (
                                <span className="text-xs text-gray-400 truncate ml-auto">{entry.zone || '—'}</span>
                            )}
                            {isDictation && onDeleteVoice && (
                                <button
                                    type="button"
                                    onClick={() => onDeleteVoice(entry.mediaId)}
                                    className="p-1 -m-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                                    aria-label="Supprimer cette dictée"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        {/* Le texte d'une dictée, pour la vérifier sur place. */}
                        {isDictation && (
                            String(transcripts[entry.mediaId] ?? '').trim() ? (
                                <p className="mt-1 text-sm text-gray-700 leading-snug">{transcripts[entry.mediaId]}</p>
                            ) : transcripts[entry.mediaId] !== undefined ? (
                                <p className="mt-1 text-xs text-orange-600">Rien d'audible — redictez.</p>
                            ) : null
                        )}
                        </div>
                        );
                    })}
                </div>
            )}

            {/* Réglages : rarement touchés, donc repliés */}
            <div className="space-y-2">
                <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    aria-expanded={settingsOpen}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-500"
                >
                    <Settings2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-left truncate">
                        {dictating ? 'Dictée par pièce' : 'Conversation entière'} · {micId ? (micLabel || 'micro choisi') : 'micro automatique'}
                    </span>
                    {settingsOpen ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
                {settingsOpen && (
                    <>
                        {isRecording
                            ? <p className="px-3 text-xs text-gray-400">La façon d'enregistrer se change micro coupé.</p>
                            : <CaptureStyleSwitch value={captureStyle} onChange={onCaptureStyleChange} />}
                        {micSelect}
                    </>
                )}
            </div>
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
    captureStyle = 'continuous',
    isTopic = false,
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
    // Un poste dicté (général, tableau) n'a pas de compteurs de pièce.
    const counters = isTopic ? [] : (template.zoneCounters || []);
    const dictating = captureStyle === 'dictation';

    if (!dictating && !isRecording && !hasCaptured) {
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

            {dictating ? (
                isRecording ? (
                    <button
                        type="button"
                        onClick={() => { buzz(30); onStop(); }}
                        className="w-full py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold flex items-center justify-center gap-3 transition-colors active:scale-[0.98]"
                    >
                        <Square className="w-5 h-5" />
                        Fin de la dictée
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { buzz(30); onStart(); }}
                            disabled={!isSupported}
                            className="flex-1 min-w-0 py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-50"
                        >
                            <Mic className="w-5 h-5 flex-shrink-0" />
                            <span className="truncate">Dicter{capture.zone ? ` — ${capture.zone}` : ''}</span>
                        </button>
                        {hasCaptured && (
                            <button
                                type="button"
                                onClick={onFinish}
                                className="px-4 py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                            >
                                <Sparkles className="w-5 h-5" />
                                Terminer
                            </button>
                        )}
                    </div>
                )
            ) : isRecording ? (
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
                        <Sparkles className="w-5 h-5" />
                        Générer le devis
                    </button>
                </div>
            )}

            <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { onPhotos(e.target.files); e.target.value = ''; }}
            />
        </div>
    );
};

export default VisiteExpressMode;
