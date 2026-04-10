import React, { useState, useRef } from 'react';
import {
    X, Mic, MicOff, Camera, Image, Trash2, ChevronRight,
    Loader2, CheckCircle2, AlertCircle, Sparkles, Clock, TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useUserProfile } from '../hooks/useDataCache';
import { generateQuoteFromSiteVisit } from '../utils/aiService';

// ── Helpers ────────────────────────────────────────────────────────────────

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function imageFileToBase64(file, maxDim = 1024) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = url;
    });
}

const formatDuration = (s) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m${sec.toString().padStart(2, '0')}s` : `${sec}s`;
};

const fmtEur = (val) => {
    if (!val && val !== 0) return '—';
    if (val >= 10000) return `${Math.round(val / 1000)} k€`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)} k€`;
    return `${Math.round(val)} €`;
};

const PROCESSING_STEPS = [
    { key: 'voice', label: 'Transcription des notes vocales', Icon: Mic },
    { key: 'photos', label: 'Analyse des photos', Icon: Camera },
    { key: 'quote', label: 'Génération du devis', Icon: Sparkles },
];

const PHASE_ORDER = { voice: 0, photos: 1, quote: 2, done: 3 };

const CONFIDENCE_STYLES = {
    high: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    medium: 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',
    low: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
};
const CONFIDENCE_LABELS = { high: 'Précis', medium: 'Estimé', low: 'Approximatif' };

// ── Component ──────────────────────────────────────────────────────────────

const SiteVisitModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const { data: profile } = useUserProfile();

    const [step, setStep] = useState(1); // 1=capture, 2=processing, 3=preview
    const [voiceNotes, setVoiceNotes] = useState([]); // [{id, blob, mimeType, duration}]
    const [photos, setPhotos] = useState([]);          // [{id, file, preview, mediaType}]
    const [activePhase, setActivePhase] = useState(null); // null|'voice'|'photos'|'quote'|'done'
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const { isRecording, duration, startRecording, stopRecording, cancelRecording, isSupported } = useAudioRecorder();

    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    // ── Voice ──────────────────────────────────────────────────────────────

    const handleStopRecording = async () => {
        const res = await stopRecording();
        if (res?.blob) {
            setVoiceNotes(prev => [...prev, {
                id: Date.now(),
                blob: res.blob,
                mimeType: res.mimeType,
                duration: res.duration,
            }]);
            toast.success(`Note vocale ajoutée (${formatDuration(res.duration)})`);
        }
    };

    const handleDeleteVoice = (id) => setVoiceNotes(prev => prev.filter(n => n.id !== id));

    // ── Photos ─────────────────────────────────────────────────────────────

    const handlePhotosSelected = (files) => {
        if (!files?.length) return;
        const newPhotos = Array.from(files).map(file => ({
            id: Date.now() + Math.random(),
            file,
            preview: URL.createObjectURL(file),
            mediaType: file.type || 'image/jpeg',
        }));
        setPhotos(prev => [...prev, ...newPhotos]);
    };

    const handleDeletePhoto = (id) => {
        setPhotos(prev => {
            const p = prev.find(x => x.id === id);
            if (p) URL.revokeObjectURL(p.preview);
            return prev.filter(x => x.id !== id);
        });
    };

    // ── Analysis ───────────────────────────────────────────────────────────

    const canAnalyze = voiceNotes.length > 0 || photos.length > 0;

    const handleAnalyze = async () => {
        setStep(2);
        setError(null);

        try {
            // 1. Transcribe voice notes
            const transcripts = [];
            if (voiceNotes.length > 0) {
                setActivePhase('voice');
                for (const note of voiceNotes) {
                    const audioBase64 = await blobToBase64(note.blob);
                    const { data, error: fnErr } = await supabase.functions.invoke('voice-transcribe', {
                        body: { audioBase64, mimeType: note.mimeType }
                    });
                    if (fnErr) throw new Error(fnErr.message || 'Erreur transcription');
                    if (data?.transcript) transcripts.push(data.transcript);
                }
            }

            // 2. Analyze photos
            const photoAnalyses = [];
            if (photos.length > 0) {
                setActivePhase('photos');
                for (const photo of photos) {
                    const imageBase64 = await imageFileToBase64(photo.file);
                    const { data, error: fnErr } = await supabase.functions.invoke('plan-vision', {
                        body: {
                            imageBase64,
                            mediaType: photo.mediaType,
                            systemPrompt: 'Tu es un expert en travaux de bâtiment. Décris précisément ce que tu vois sur cette photo de chantier : matériaux visibles, type de travaux, état des surfaces, dimensions approximatives si possible, anomalies ou points d\'attention.',
                            userPrompt: 'Analyse cette photo pour aider à estimer les travaux à réaliser.',
                        }
                    });
                    if (fnErr) throw new Error(fnErr.message || 'Erreur analyse photo');
                    if (data?.text) photoAnalyses.push(data.text);
                }
            }

            // 3. Generate quote
            setActivePhase('quote');
            const context = {
                hourlyRate: profile?.ai_hourly_rate || '',
                instructions: profile?.ai_instructions || '',
            };
            const quoteResult = await generateQuoteFromSiteVisit(transcripts, photoAnalyses, context);

            setActivePhase('done');
            setResult(quoteResult);
            setStep(3);

        } catch (err) {
            console.error('Site visit error:', err);
            setError(err.message || "Erreur lors de l'analyse. Veuillez réessayer.");
            setStep(1);
            setActivePhase(null);
        }
    };

    // ── Navigation ─────────────────────────────────────────────────────────

    const handleCreateDevis = () => {
        if (!result) return;
        handleClose(false); // close without resetting yet (navigate handles unmount)
        navigate('/app/devis/new', {
            state: {
                siteVisitItems: result.items,
                siteVisitTitle: result.title,
            }
        });
    };

    const handleClose = (doReset = true) => {
        if (isRecording) cancelRecording();
        photos.forEach(p => URL.revokeObjectURL(p.preview));
        if (doReset) {
            setStep(1);
            setVoiceNotes([]);
            setPhotos([]);
            setResult(null);
            setError(null);
            setActivePhase(null);
        }
        onClose();
    };

    const handleRetry = () => {
        setStep(1);
        setResult(null);
        setActivePhase(null);
    };

    if (!isOpen) return null;

    // ── Derived values ─────────────────────────────────────────────────────

    const totalHT = result?.items?.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1), 0
    ) || 0;

    const phaseIdx = activePhase ? (PHASE_ORDER[activePhase] ?? -1) : -1;

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">Visite chantier → Devis IA</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {step === 1 ? 'Capturez notes vocales et photos' : step === 2 ? 'Analyse IA en cours…' : 'Devis généré — vérifiez et confirmez'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleClose(true)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    {['Capture', 'Analyse', 'Résultat'].map((label, i) => (
                        <React.Fragment key={i}>
                            <div className={`flex items-center gap-1.5 ${step === i + 1 ? 'text-blue-600' : step > i + 1 ? 'text-green-600' : 'text-gray-400'}`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                    step === i + 1 ? 'bg-blue-600 text-white' :
                                    step > i + 1 ? 'bg-green-500 text-white' :
                                    'bg-gray-200 dark:bg-gray-700 text-gray-400'
                                }`}>
                                    {step > i + 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:block">{label}</span>
                            </div>
                            {i < 2 && (
                                <div className={`flex-1 h-0.5 rounded-full ${step > i + 1 ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-4">

                    {/* ── STEP 1 : Capture ── */}
                    {step === 1 && (
                        <div className="space-y-6">
                            {error && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Voice notes */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                    <Mic className="w-4 h-4" />
                                    Notes vocales
                                    {voiceNotes.length > 0 && (
                                        <span className="ml-auto text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                                            {voiceNotes.length}
                                        </span>
                                    )}
                                </h3>

                                {isSupported ? (
                                    <button
                                        onClick={isRecording ? handleStopRecording : startRecording}
                                        className={`w-full py-5 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.97] select-none ${
                                            isRecording
                                                ? 'bg-red-500 text-white shadow-lg shadow-red-200 dark:shadow-red-900/30'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {isRecording ? (
                                            <>
                                                <span className="relative flex h-10 w-10 items-center justify-center">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-50" />
                                                    <MicOff className="relative w-6 h-6" />
                                                </span>
                                                <span className="text-sm font-bold tabular-nums">{formatDuration(duration)} — Appuyer pour arrêter</span>
                                            </>
                                        ) : (
                                            <>
                                                <Mic className="w-8 h-8" />
                                                <span className="text-sm font-medium">Appuyer pour enregistrer</span>
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-sm text-center">
                                        Microphone non disponible sur cet appareil
                                    </div>
                                )}

                                {voiceNotes.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {voiceNotes.map((note, i) => (
                                            <div key={note.id} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Note {i + 1}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDuration(note.duration)}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteVoice(note.id)}
                                                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Photos */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                    <Camera className="w-4 h-4" />
                                    Photos du chantier
                                    {photos.length > 0 && (
                                        <span className="ml-auto text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                                            {photos.length}
                                        </span>
                                    )}
                                </h3>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="flex-1 py-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex flex-col items-center gap-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.97]"
                                    >
                                        <Camera className="w-7 h-7" />
                                        <span className="text-xs font-medium">Prendre une photo</span>
                                    </button>
                                    <button
                                        onClick={() => galleryInputRef.current?.click()}
                                        className="flex-1 py-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex flex-col items-center gap-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.97]"
                                    >
                                        <Image className="w-7 h-7" />
                                        <span className="text-xs font-medium">Depuis la galerie</span>
                                    </button>
                                </div>

                                {photos.length > 0 && (
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {photos.map(photo => (
                                            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => handleDeletePhoto(photo.id)}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Hidden file inputs */}
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={e => { handlePhotosSelected(e.target.files); e.target.value = ''; }}
                                />
                                <input
                                    ref={galleryInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={e => { handlePhotosSelected(e.target.files); e.target.value = ''; }}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2 : Processing ── */}
                    {step === 2 && (
                        <div className="py-8 space-y-6">
                            {PROCESSING_STEPS.map((ps) => {
                                if (ps.key === 'voice' && voiceNotes.length === 0) return null;
                                if (ps.key === 'photos' && photos.length === 0) return null;

                                const stepIdx = PHASE_ORDER[ps.key];
                                const isActive = activePhase === ps.key;
                                const isDone = phaseIdx > stepIdx;
                                const isPending = !isActive && !isDone;
                                const { Icon } = ps;

                                return (
                                    <div key={ps.key} className={`flex items-center gap-4 transition-opacity ${isPending ? 'opacity-40' : ''}`}>
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                                            isDone ? 'bg-green-100 dark:bg-green-900/30' :
                                            isActive ? 'bg-blue-100 dark:bg-blue-900/30' :
                                            'bg-gray-100 dark:bg-gray-800'
                                        }`}>
                                            {isDone ? (
                                                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                                            ) : isActive ? (
                                                <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
                                            ) : (
                                                <Icon className="w-6 h-6 text-gray-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className={`text-sm font-semibold ${
                                                isDone ? 'text-green-700 dark:text-green-400' :
                                                isActive ? 'text-blue-700 dark:text-blue-400' :
                                                'text-gray-500 dark:text-gray-400'
                                            }`}>
                                                {ps.label}
                                            </p>
                                            <p className={`text-xs mt-0.5 ${
                                                isDone ? 'text-green-600 dark:text-green-500' :
                                                isActive ? 'text-blue-500' :
                                                'text-gray-400'
                                            }`}>
                                                {isDone ? 'Terminé' : isActive ? 'En cours…' : 'En attente'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── STEP 3 : Preview ── */}
                    {step === 3 && result && (
                        <div className="space-y-4">
                            {/* Title */}
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">Titre du devis</p>
                                <p className="font-bold text-gray-900 dark:text-white text-base">{result.title}</p>
                            </div>

                            {/* Price cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total estimé HT</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtEur(totalHT)}</p>
                                </div>
                                {result.price_range && (
                                    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fourchette</p>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                                            {fmtEur(result.price_range.min)}<br />
                                            <span className="text-gray-400 font-normal">–</span> {fmtEur(result.price_range.max)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Meta */}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                                <span className="flex items-center gap-1.5">
                                    <TrendingUp className="w-4 h-4" />
                                    {result.items.length} ligne{result.items.length > 1 ? 's' : ''}
                                </span>
                                {result.estimated_duration && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-4 h-4" />
                                        {result.estimated_duration}
                                    </span>
                                )}
                                {result.confidence && (
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_STYLES[result.confidence]}`}>
                                        {CONFIDENCE_LABELS[result.confidence]}
                                    </span>
                                )}
                            </div>

                            {/* Items preview */}
                            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                    Aperçu des lignes
                                </div>
                                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-44 overflow-y-auto">
                                    {result.items.map((item, i) => (
                                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'material' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.description}</span>
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0 tabular-nums">
                                                {fmtEur((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Suggestions */}
                            {result.suggestions?.length > 0 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/40">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">À ne pas oublier :</p>
                                    <ul className="space-y-1">
                                        {result.suggestions.map((s, i) => (
                                            <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer CTA */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                    {step === 1 && (
                        <button
                            onClick={handleAnalyze}
                            disabled={!canAnalyze || isRecording}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <Sparkles className="w-5 h-5" />
                            <span>Analyser avec l'IA</span>
                            {canAnalyze && (
                                <span className="text-blue-200 text-sm font-normal">
                                    ({[
                                        voiceNotes.length > 0 && `${voiceNotes.length} note${voiceNotes.length > 1 ? 's' : ''}`,
                                        photos.length > 0 && `${photos.length} photo${photos.length > 1 ? 's' : ''}`,
                                    ].filter(Boolean).join(', ')})
                                </span>
                            )}
                        </button>
                    )}
                    {step === 2 && (
                        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-1">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyse en cours, merci de patienter…
                        </div>
                    )}
                    {step === 3 && (
                        <div className="flex gap-3">
                            <button
                                onClick={handleRetry}
                                className="flex-shrink-0 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                Modifier
                            </button>
                            <button
                                onClick={handleCreateDevis}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors active:scale-[0.98]"
                            >
                                Créer ce devis
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SiteVisitModal;
