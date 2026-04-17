import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useDataCache';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { generateQuoteFromSiteVisit } from '../utils/aiService';
import { toast } from 'sonner';
import {
    ArrowLeft, Mic, MicOff, Camera, Image as ImageIcon, Trash2,
    Loader2, CheckCircle2, AlertCircle, Sparkles, Clock, ChevronDown,
    X, TrendingUp, MapPin, AlignLeft, FilePlus, FileText,
} from 'lucide-react';

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
    high: 'text-green-700 bg-green-100',
    medium: 'text-amber-700 bg-amber-100',
    low: 'text-red-700 bg-red-100',
};
const CONFIDENCE_LABELS = { high: 'Précis', medium: 'Estimé', low: 'Approximatif' };

// ── Component ──────────────────────────────────────────────────────────────

const VisiteTechniqueMode = ({ onBack }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: profile } = useUserProfile();

    const [step, setStep] = useState('capture'); // 'capture' | 'processing' | 'result'

    // Client
    const [clientId, setClientId] = useState(null);
    const [clientName, setClientName] = useState('');
    const [clients, setClients] = useState([]);
    const [showClientList, setShowClientList] = useState(false);

    // Relevé details
    const [address, setAddress] = useState('');
    const [textNotes, setTextNotes] = useState('');

    // Media
    const [voiceNotes, setVoiceNotes] = useState([]);
    const [photos, setPhotos] = useState([]);

    // Processing & result
    const [activePhase, setActivePhase] = useState(null);
    const [result, setResult] = useState(null);
    const [savedReportId, setSavedReportId] = useState(null);
    const [error, setError] = useState(null);

    const { isRecording, duration, startRecording, stopRecording, cancelRecording, isSupported } = useAudioRecorder();
    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    useEffect(() => {
        if (!user) return;
        supabase.from('clients')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(100)
            .then(({ data }) => setClients(data || []));
    }, [user]);

    useEffect(() => {
        return () => {
            photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
        };
    }, []);

    const filteredClients = clients.filter(c =>
        !clientName || c.name.toLowerCase().includes(clientName.toLowerCase())
    );

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
        setPhotos(prev => [...prev, ...Array.from(files).map(file => ({
            id: Date.now() + Math.random(),
            file,
            preview: URL.createObjectURL(file),
            mediaType: file.type || 'image/jpeg',
        }))]);
    };

    const handleDeletePhoto = (id) => {
        setPhotos(prev => {
            const p = prev.find(x => x.id === id);
            if (p) URL.revokeObjectURL(p.preview);
            return prev.filter(x => x.id !== id);
        });
    };

    // ── Analysis ───────────────────────────────────────────────────────────

    const canAnalyze = voiceNotes.length > 0 || photos.length > 0 || textNotes.trim().length > 0;

    const handleAnalyze = async () => {
        setStep('processing');
        setError(null);
        try {
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

            if (textNotes.trim()) transcripts.push(textNotes.trim());

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

            setActivePhase('quote');
            const context = {
                hourlyRate: profile?.ai_hourly_rate || '',
                instructions: profile?.ai_instructions || '',
                customSystemPrompt: profile?.ai_preferences?.quote_system_prompt || profile?.quote_system_prompt || '',
            };
            const quoteResult = await generateQuoteFromSiteVisit(transcripts, photoAnalyses, context);

            setActivePhase('done');
            setResult(quoteResult);

            // Save to intervention_reports
            if (user) {
                try {
                    const reportNumber = `VT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
                    const { data: saved } = await supabase.from('intervention_reports').insert({
                        user_id: user.id,
                        client_id: clientId || null,
                        client_name: clientName || null,
                        title: quoteResult.title,
                        description: transcripts.join('\n') || null,
                        intervention_address: address || null,
                        notes: JSON.stringify({
                            suggestions: quoteResult.suggestions,
                            price_range: quoteResult.price_range,
                            estimated_duration: quoteResult.estimated_duration,
                            confidence: quoteResult.confidence,
                        }),
                        materials_used: quoteResult.items,
                        status: 'draft',
                        date: new Date().toISOString().split('T')[0],
                        report_number: reportNumber,
                    }).select('id').single();
                    if (saved?.id) setSavedReportId(saved.id);
                } catch (saveErr) {
                    console.error('Error saving site visit:', saveErr);
                }
            }

            setStep('result');
        } catch (err) {
            console.error('Analysis error:', err);
            setError(err.message || "Erreur lors de l'analyse. Veuillez réessayer.");
            setStep('capture');
            setActivePhase(null);
        }
    };

    const handleCreateDevis = (isPredevis = false) => {
        if (!result) return;
        photos.forEach(p => URL.revokeObjectURL(p.preview));
        navigate('/app/devis/new', {
            state: {
                siteVisitItems: result.items,
                siteVisitTitle: isPredevis ? `ESTIMATIF - ${result.title}` : result.title,
                ...(clientId ? { client_id: clientId } : {}),
            }
        });
    };

    const handleBack = () => {
        if (isRecording) cancelRecording();
        photos.forEach(p => URL.revokeObjectURL(p.preview));
        onBack();
    };

    // ── Derived ────────────────────────────────────────────────────────────

    const totalHT = result?.items?.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1), 0
    ) || 0;

    const phaseIdx = activePhase ? (PHASE_ORDER[activePhase] ?? -1) : -1;

    const STEPS = ['capture', 'processing', 'result'];

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col font-sans overflow-hidden">

            {/* Header */}
            <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm px-3 py-3 flex items-center gap-3">
                <button
                    onClick={handleBack}
                    className="p-2 -ml-1 text-gray-500 hover:text-gray-800 rounded-xl active:bg-gray-100"
                    aria-label="Retour"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-base leading-tight">Visite technique</p>
                    <p className="text-xs text-gray-500 truncate">
                        {step === 'capture' ? 'Relevé : client, notes et photos'
                            : step === 'processing' ? 'Analyse IA en cours…'
                            : 'Résultat — créez le prédevis ou le devis'}
                    </p>
                </div>
                {/* Step dots */}
                <div className="flex gap-1.5 items-center flex-shrink-0">
                    {STEPS.map((s) => (
                        <div key={s} className={`rounded-full transition-all ${
                            step === s ? 'w-5 h-2.5 bg-violet-600' :
                            STEPS.indexOf(step) > STEPS.indexOf(s) ? 'w-2.5 h-2.5 bg-violet-300' :
                            'w-2.5 h-2.5 bg-gray-200'
                        }`} />
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

                {/* ══ CAPTURE ══════════════════════════════════════════════ */}
                {step === 'capture' && (
                    <div className="p-4 space-y-5 pb-28">

                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Client */}
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Client</p>
                            <div className="relative flex gap-2">
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => { setClientName(e.target.value); setClientId(null); }}
                                    onFocus={() => setShowClientList(true)}
                                    onBlur={() => setTimeout(() => setShowClientList(false), 200)}
                                    placeholder="Nom du client"
                                    className="flex-1 px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                {clients.length > 0 && (
                                    <button
                                        type="button"
                                        onMouseDown={() => setShowClientList(v => !v)}
                                        className="px-3 bg-white border border-gray-200 rounded-2xl text-gray-400"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {showClientList && filteredClients.length > 0 && (
                                <div className="mt-1 bg-white rounded-2xl border border-gray-200 shadow-xl max-h-52 overflow-y-auto relative z-20">
                                    {filteredClients.map(c => (
                                        <button
                                            key={c.id}
                                            onMouseDown={() => { setClientId(c.id); setClientName(c.name); setShowClientList(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-violet-50 text-sm font-medium text-gray-800 border-b border-gray-50 last:border-0 first:rounded-t-2xl last:rounded-b-2xl"
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Address */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Adresse du chantier</p>
                                <span className="text-xs text-gray-400 font-normal normal-case">(optionnel)</span>
                            </div>
                            <input
                                type="text"
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                                placeholder="Rue, ville…"
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                        </div>

                        {/* Voice notes */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <Mic className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Notes vocales</p>
                                {voiceNotes.length > 0 && (
                                    <span className="ml-auto text-violet-600 bg-violet-50 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        {voiceNotes.length}
                                    </span>
                                )}
                            </div>
                            {isSupported ? (
                                <button
                                    onClick={isRecording ? handleStopRecording : startRecording}
                                    className={`w-full py-5 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.97] select-none ${
                                        isRecording
                                            ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                                <div className="p-3 bg-amber-50 text-amber-700 rounded-xl text-sm text-center">
                                    Microphone non disponible sur cet appareil
                                </div>
                            )}
                            {voiceNotes.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    {voiceNotes.map((note, i) => (
                                        <div key={note.id} className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl">
                                            <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                <Mic className="w-4 h-4 text-violet-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800">Note {i + 1}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDuration(note.duration)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteVoice(note.id)}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                            <div className="flex items-center gap-1.5 mb-2">
                                <Camera className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Photos du chantier</p>
                                {photos.length > 0 && (
                                    <span className="ml-auto text-violet-600 bg-violet-50 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        {photos.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => cameraInputRef.current?.click()}
                                    className="flex-1 py-4 bg-gray-100 rounded-2xl flex flex-col items-center gap-2 text-gray-700 hover:bg-gray-200 transition-colors active:scale-[0.97]"
                                >
                                    <Camera className="w-7 h-7" />
                                    <span className="text-xs font-medium">Prendre une photo</span>
                                </button>
                                <button
                                    onClick={() => galleryInputRef.current?.click()}
                                    className="flex-1 py-4 bg-gray-100 rounded-2xl flex flex-col items-center gap-2 text-gray-700 hover:bg-gray-200 transition-colors active:scale-[0.97]"
                                >
                                    <ImageIcon className="w-7 h-7" />
                                    <span className="text-xs font-medium">Depuis la galerie</span>
                                </button>
                            </div>
                            {photos.length > 0 && (
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                    {photos.map(photo => (
                                        <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
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
                            <input
                                ref={cameraInputRef}
                                type="file" accept="image/*" capture="environment"
                                className="hidden"
                                onChange={e => { handlePhotosSelected(e.target.files); e.target.value = ''; }}
                            />
                            <input
                                ref={galleryInputRef}
                                type="file" accept="image/*" multiple
                                className="hidden"
                                onChange={e => { handlePhotosSelected(e.target.files); e.target.value = ''; }}
                            />
                        </div>

                        {/* Text notes */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <AlignLeft className="w-3.5 h-3.5 text-gray-400" />
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Notes texte</p>
                                <span className="text-xs text-gray-400 font-normal normal-case">(optionnel)</span>
                            </div>
                            <textarea
                                rows={3}
                                value={textNotes}
                                onChange={e => setTextNotes(e.target.value)}
                                placeholder="Observations, mesures, matériaux repérés…"
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                            />
                        </div>
                    </div>
                )}

                {/* ══ PROCESSING ═══════════════════════════════════════════ */}
                {step === 'processing' && (
                    <div className="py-12 px-6 space-y-8">
                        {PROCESSING_STEPS.map((ps) => {
                            if (ps.key === 'voice' && voiceNotes.length === 0 && !textNotes.trim()) return null;
                            if (ps.key === 'photos' && photos.length === 0) return null;
                            const stepIdx = PHASE_ORDER[ps.key];
                            const isActive = activePhase === ps.key;
                            const isDone = phaseIdx > stepIdx;
                            const isPending = !isActive && !isDone;
                            const { Icon } = ps;
                            return (
                                <div key={ps.key} className={`flex items-center gap-4 transition-opacity ${isPending ? 'opacity-40' : ''}`}>
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                                        isDone ? 'bg-green-100' : isActive ? 'bg-violet-100' : 'bg-gray-100'
                                    }`}>
                                        {isDone ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                                            : isActive ? <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
                                            : <Icon className="w-6 h-6 text-gray-400" />}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-semibold ${
                                            isDone ? 'text-green-700' : isActive ? 'text-violet-700' : 'text-gray-500'
                                        }`}>{ps.label}</p>
                                        <p className={`text-xs mt-0.5 ${
                                            isDone ? 'text-green-600' : isActive ? 'text-violet-500' : 'text-gray-400'
                                        }`}>
                                            {isDone ? 'Terminé' : isActive ? 'En cours…' : 'En attente'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ══ RESULT ═══════════════════════════════════════════════ */}
                {step === 'result' && result && (
                    <div className="p-4 space-y-4 pb-40">

                        {/* Title */}
                        <div className="p-4 bg-violet-50 rounded-2xl">
                            <p className="text-xs font-semibold text-violet-600 mb-1 uppercase tracking-wide">Titre du devis</p>
                            <p className="font-bold text-gray-900 text-base">{result.title}</p>
                            {clientName && <p className="text-xs text-gray-500 mt-1">Client : {clientName}</p>}
                            {address && <p className="text-xs text-gray-400 mt-0.5">{address}</p>}
                        </div>

                        {/* Price cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-white border border-gray-100 rounded-2xl">
                                <p className="text-xs text-gray-500 mb-1">Total estimé HT</p>
                                <p className="text-2xl font-bold text-gray-900">{fmtEur(totalHT)}</p>
                            </div>
                            {result.price_range && (
                                <div className="p-4 bg-white border border-gray-100 rounded-2xl">
                                    <p className="text-xs text-gray-500 mb-1">Fourchette</p>
                                    <p className="text-sm font-bold text-gray-900 leading-snug">
                                        {fmtEur(result.price_range.min)}<br />
                                        <span className="text-gray-400 font-normal">–</span> {fmtEur(result.price_range.max)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
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
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_STYLES[result.confidence] || ''}`}>
                                    {CONFIDENCE_LABELS[result.confidence]}
                                </span>
                            )}
                        </div>

                        {/* Items preview */}
                        <div className="rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Aperçu des lignes
                            </div>
                            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                {result.items.map((item, i) => (
                                    <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'material' ? 'bg-orange-400' : 'bg-violet-400'}`} />
                                            <span className="text-sm text-gray-700 truncate">{item.description}</span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-900 flex-shrink-0 tabular-nums">
                                            {fmtEur((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Suggestions */}
                        {result.suggestions?.length > 0 && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <p className="text-xs font-semibold text-amber-700 mb-2">À ne pas oublier :</p>
                                <ul className="space-y-1">
                                    {result.suggestions.map((s, i) => (
                                        <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1" />
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {savedReportId && (
                            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                Visite sauvegardée
                                <button
                                    onClick={() => navigate(`/app/interventions/${savedReportId}`)}
                                    className="text-violet-600 underline ml-1"
                                >
                                    Voir le rapport
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="shrink-0 bg-white border-t border-gray-200 p-4">
                {step === 'capture' && (
                    <button
                        onClick={handleAnalyze}
                        disabled={!canAnalyze || isRecording}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                        <Sparkles className="w-5 h-5" />
                        Analyser avec l'IA
                        {canAnalyze && (
                            <span className="text-violet-200 text-sm font-normal">
                                ({[
                                    voiceNotes.length > 0 && `${voiceNotes.length} note${voiceNotes.length > 1 ? 's' : ''}`,
                                    photos.length > 0 && `${photos.length} photo${photos.length > 1 ? 's' : ''}`,
                                    textNotes.trim() && 'notes texte',
                                ].filter(Boolean).join(', ')})
                            </span>
                        )}
                    </button>
                )}
                {step === 'processing' && (
                    <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyse en cours, merci de patienter…
                    </div>
                )}
                {step === 'result' && (
                    <div className="space-y-3">
                        <button
                            onClick={() => handleCreateDevis(false)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors active:scale-[0.98]"
                        >
                            <FilePlus className="w-5 h-5" />
                            Créer le devis
                        </button>
                        <button
                            onClick={() => handleCreateDevis(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors active:scale-[0.98]"
                        >
                            <FileText className="w-5 h-5" />
                            Créer un prédevis (estimatif)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VisiteTechniqueMode;
