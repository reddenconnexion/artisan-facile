import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { Toaster, toast } from 'sonner';
import {
    ArrowLeft, Play, Pause, RotateCcw, Camera, Save,
    PenTool, CheckCircle, Trash2, FileText, X, Loader2,
    ChevronDown, Clock, ExternalLink, Sparkles,
} from 'lucide-react';
import SiteVisitModal from '../components/SiteVisitModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const formatTime = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0, 5);
const defaultTitle = () => `Intervention du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

// ─── Component ────────────────────────────────────────────────────────────────

const TerrainMode = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Navigation entre onglets ──────────────────────────────────────────────
    const [tab, setTab] = useState('rapport'); // 'rapport' | 'photos' | 'signature'

    // ── Champs du rapport ─────────────────────────────────────────────────────
    const [title, setTitle] = useState(defaultTitle);
    const [clientId, setClientId] = useState(null);
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [workDone, setWorkDone] = useState('');
    const [notes, setNotes] = useState('');

    // ── Visite chantier → Devis ───────────────────────────────────────────────
    const [showSiteVisit, setShowSiteVisit] = useState(false);

    // ── Autocomplete clients ──────────────────────────────────────────────────
    const [clients, setClients] = useState([]);
    const [showClientList, setShowClientList] = useState(false);

    useEffect(() => {
        if (!user) return;
        supabase.from('clients')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(15)
            .then(({ data }) => setClients(data || []));
    }, [user]);

    const filteredClients = clients.filter(c =>
        !clientName || c.name.toLowerCase().includes(clientName.toLowerCase())
    );

    // ── Chronomètre ──────────────────────────────────────────────────────────
    const [timerRunning, setTimerRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0); // secondes
    const [startTime, setStartTime] = useState(null); // HH:MM
    const timerRef = useRef(null);

    useEffect(() => {
        if (timerRunning) {
            timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [timerRunning]);

    const toggleTimer = () => {
        if (!timerRunning && elapsed === 0) setStartTime(nowTime());
        setTimerRunning(r => !r);
    };

    const resetTimer = () => {
        setTimerRunning(false);
        setElapsed(0);
        setStartTime(null);
    };

    // ── Photos ────────────────────────────────────────────────────────────────
    const [photos, setPhotos] = useState([]); // { tempId, url, name, preview, uploading }
    const photoInputRef = useRef(null);

    const handlePhotoChange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        for (const file of files) {
            const tempId = `${Date.now()}-${Math.random()}`;
            const preview = URL.createObjectURL(file);
            setPhotos(prev => [...prev, { tempId, url: null, name: file.name, preview, uploading: true }]);

            try {
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `terrain/${user.id}/${Date.now()}.${ext}`;
                const { error } = await supabase.storage
                    .from('intervention-photos')
                    .upload(path, file, { upsert: true });
                if (error) throw error;
                const { data: { publicUrl } } = supabase.storage
                    .from('intervention-photos')
                    .getPublicUrl(path);
                setPhotos(prev => prev.map(p =>
                    p.tempId === tempId ? { ...p, url: publicUrl, uploading: false } : p
                ));
            } catch (err) {
                console.error('Upload error:', err);
                toast.error(`Erreur upload : ${file.name}`);
                setPhotos(prev => prev.filter(p => p.tempId !== tempId));
                URL.revokeObjectURL(preview);
            }
        }
        e.target.value = '';
    };

    const deletePhoto = (tempId) => {
        const p = photos.find(p => p.tempId === tempId);
        if (p?.preview) URL.revokeObjectURL(p.preview);
        setPhotos(prev => prev.filter(p => p.tempId !== tempId));
    };

    // Libérer les object URLs au démontage
    useEffect(() => {
        return () => photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    }, []);

    // ── Canvas signature ──────────────────────────────────────────────────────
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSig, setHasSig] = useState(false);
    const [signerName, setSignerName] = useState('');
    const lastPos = useRef(null);

    // Adapter canvas au conteneur à l'affichage de l'onglet
    useEffect(() => {
        if (tab !== 'signature') return;
        requestAnimationFrame(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const w = canvas.parentElement.clientWidth;
            canvas.width = w;
            canvas.height = 200;
        });
    }, [tab]);

    const getPos = (e, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return {
            x: (src.clientX - rect.left) * (canvas.width / rect.width),
            y: (src.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsDrawing(true);
        lastPos.current = getPos(e, canvas);
    };

    const draw = useCallback((e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1d4ed8';
        ctx.stroke();
        lastPos.current = pos;
        setHasSig(true);
    }, [isDrawing]);

    const endDraw = () => setIsDrawing(false);

    const clearSig = () => {
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        setHasSig(false);
    };

    // ── Sauvegarde ────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [reportId, setReportId] = useState(null);
    const [docStatus, setDocStatus] = useState('draft');

    const buildPayload = (statusOverride) => ({
        user_id: user.id,
        title: title.trim() || 'Intervention terrain',
        date: today(),
        client_name: clientName.trim(),
        description: description.trim(),
        work_done: workDone.trim(),
        notes: notes.trim(),
        status: statusOverride,
        start_time: startTime || null,
        duration_hours: elapsed > 0 ? parseFloat((elapsed / 3600).toFixed(2)) : null,
        photos: photos.filter(p => p.url).map(({ url, name }) => ({ url, name })),
        updated_at: new Date().toISOString(),
    });

    const persist = async (payload) => {
        if (reportId) {
            const { error } = await supabase
                .from('intervention_reports')
                .update(payload)
                .eq('id', reportId);
            if (error) throw error;
            return reportId;
        } else {
            const reportNumber = `INT-${new Date().getFullYear()}-T${Date.now().toString().slice(-4)}`;
            const { data, error } = await supabase
                .from('intervention_reports')
                .insert({ ...payload, report_number: reportNumber })
                .select('id')
                .single();
            if (error) throw error;
            setReportId(data.id);
            return data.id;
        }
    };

    const handleSave = async (newStatus = docStatus) => {
        if (!user) return;
        try {
            setSaving(true);
            await persist(buildPayload(newStatus));
            setDocStatus(newStatus);
            toast.success(newStatus === 'completed' ? 'Rapport terminé !' : 'Brouillon sauvegardé');
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleSign = async () => {
        if (!hasSig) { toast.error('Veuillez apposer une signature'); return; }
        if (!signerName.trim()) { toast.error('Veuillez saisir le nom du signataire'); return; }
        try {
            setSaving(true);
            const sig = canvasRef.current.toDataURL('image/png');
            const payload = {
                ...buildPayload('signed'),
                client_signature: sig,
                signed_at: new Date().toISOString(),
                signer_name: signerName.trim(),
            };
            await persist(payload);
            setDocStatus('signed');
            setTimerRunning(false);
            toast.success('Rapport signé ✓');
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la signature');
        } finally {
            setSaving(false);
        }
    };

    // ─── UI ───────────────────────────────────────────────────────────────────
    const tabConfig = [
        { id: 'rapport', Icon: FileText, label: 'Rapport' },
        { id: 'photos', Icon: Camera, label: photos.length > 0 ? `Photos (${photos.length})` : 'Photos' },
        { id: 'signature', Icon: PenTool, label: 'Signature' },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col font-sans overflow-hidden">
            <Toaster position="top-center" richColors />

            {/* ── Barre de titre + chrono ─────────────────────────────────── */}
            <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm">
                <div className="px-3 py-3 flex items-center gap-2">
                    {/* Retour */}
                    <button
                        onClick={() => navigate('/app')}
                        className="p-2 -ml-1 text-gray-500 hover:text-gray-800 rounded-xl active:bg-gray-100"
                        aria-label="Retour"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    {/* Chronomètre */}
                    <div className="flex items-center gap-2 flex-1">
                        <span className={`font-mono text-2xl font-bold tabular-nums leading-none transition-colors ${timerRunning ? 'text-blue-600' : elapsed > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                            {formatTime(elapsed)}
                        </span>
                        <button
                            onClick={toggleTimer}
                            className={`p-2 rounded-full transition-colors ${timerRunning
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                            aria-label={timerRunning ? 'Pause' : 'Démarrer'}
                        >
                            {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        {elapsed > 0 && !timerRunning && (
                            <button
                                onClick={resetTimer}
                                className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                                aria-label="Réinitialiser"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                        {startTime && (
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Début {startTime}
                            </span>
                        )}
                    </div>

                    {/* Sauvegarder */}
                    <button
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Sauver
                    </button>
                </div>

                {/* Bannière statut */}
                {docStatus !== 'draft' && (
                    <div className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold ${docStatus === 'signed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {docStatus === 'signed' ? 'Rapport signé' : 'Rapport terminé'}
                        {reportId && (
                            <button
                                onClick={() => navigate(`/app/interventions/${reportId}`)}
                                className="underline flex items-center gap-0.5"
                            >
                                Voir complet <ExternalLink className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Contenu scrollable ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

                {/* ══ Onglet Rapport ═══════════════════════════════════════ */}
                {tab === 'rapport' && (
                    <div className="p-4 space-y-4 pb-6">

                        {/* Client */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Client
                            </label>
                            <div className="relative flex gap-2">
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => { setClientName(e.target.value); setClientId(null); }}
                                    onFocus={() => setShowClientList(true)}
                                    onBlur={() => setTimeout(() => setShowClientList(false), 200)}
                                    placeholder="Nom du client"
                                    className="flex-1 px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {clients.length > 0 && (
                                    <button
                                        type="button"
                                        onMouseDown={() => setShowClientList(v => !v)}
                                        className="px-3 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {showClientList && filteredClients.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-2xl border border-gray-200 shadow-xl max-h-52 overflow-y-auto">
                                    {filteredClients.map(c => (
                                        <button
                                            key={c.id}
                                            onMouseDown={() => { setClientId(c.id); setClientName(c.name); setShowClientList(false); }}
                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm font-medium text-gray-800 border-b border-gray-50 last:border-0 first:rounded-t-2xl last:rounded-b-2xl"
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Intitulé */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Intitulé
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* Problème constaté */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Problème constaté
                            </label>
                            <textarea
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Décrivez la situation trouvée sur place..."
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                        </div>

                        {/* Travaux réalisés */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Travaux réalisés
                            </label>
                            <textarea
                                rows={4}
                                value={workDone}
                                onChange={e => setWorkDone(e.target.value)}
                                placeholder="Décrivez les travaux effectués en détail..."
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                        </div>

                        {/* Notes internes */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Notes internes
                            </label>
                            <textarea
                                rows={2}
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Notes non visibles sur le rapport client..."
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                        </div>

                        {/* Raccourcis onglets */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => setTab('photos')}
                                className="flex items-center justify-center gap-2 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                            >
                                <Camera className="w-4 h-4 text-blue-500" />
                                Photos {photos.length > 0 && `(${photos.length})`}
                            </button>
                            <button
                                onClick={() => setTab('signature')}
                                className="flex items-center justify-center gap-2 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                            >
                                <PenTool className="w-4 h-4 text-blue-500" />
                                Signature
                            </button>
                        </div>

                        {/* Visite chantier → Devis IA */}
                        <button
                            onClick={() => setShowSiteVisit(true)}
                            className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white rounded-2xl text-sm font-semibold transition-colors"
                        >
                            <Sparkles className="w-4 h-4" />
                            Visite chantier → Devis IA
                        </button>
                    </div>
                )}

                {/* ══ Onglet Photos ════════════════════════════════════════ */}
                {tab === 'photos' && (
                    <div className="p-4 space-y-4 pb-6">
                        <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            className="hidden"
                            onChange={handlePhotoChange}
                        />

                        {/* Bouton appareil photo */}
                        <button
                            onClick={() => photoInputRef.current?.click()}
                            className="w-full flex flex-col items-center justify-center gap-3 py-10 bg-white border-2 border-dashed border-blue-300 rounded-3xl text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                        >
                            <Camera className="w-12 h-12" />
                            <div className="text-center">
                                <div className="text-base font-bold">Prendre une photo</div>
                                <div className="text-xs text-blue-400 mt-0.5">ou choisir depuis la galerie</div>
                            </div>
                        </button>

                        {photos.length === 0 ? (
                            <p className="text-center text-gray-400 text-sm py-4">Aucune photo pour l'instant</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    {photos.map(p => (
                                        <div key={p.tempId} className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden">
                                            <img
                                                src={p.preview || p.url}
                                                alt={p.name}
                                                className={`w-full h-full object-cover transition-opacity ${p.uploading ? 'opacity-40' : ''}`}
                                            />
                                            {p.uploading && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                                                </div>
                                            )}
                                            {!p.uploading && (
                                                <button
                                                    onClick={() => deletePhoto(p.tempId)}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-center text-xs text-gray-400">
                                    {photos.length} photo{photos.length > 1 ? 's' : ''} attachée{photos.length > 1 ? 's' : ''}
                                </p>
                            </>
                        )}
                    </div>
                )}

                {/* ══ Onglet Signature ══════════════════════════════════════ */}
                {tab === 'signature' && (
                    <div className="p-4 space-y-4 pb-6">

                        {/* Nom du signataire */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Nom du signataire
                            </label>
                            <input
                                type="text"
                                value={signerName}
                                onChange={e => setSignerName(e.target.value)}
                                placeholder="Prénom Nom du client"
                                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* Canvas signature */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                    Signature client
                                </label>
                                {hasSig && (
                                    <button onClick={clearSig} className="text-xs text-red-500 hover:text-red-700 font-medium">
                                        Effacer
                                    </button>
                                )}
                            </div>
                            <div className="relative bg-white border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden" style={{ touchAction: 'none' }}>
                                <canvas
                                    ref={canvasRef}
                                    className="w-full block"
                                    style={{ height: 200, touchAction: 'none' }}
                                    onMouseDown={startDraw}
                                    onMouseMove={draw}
                                    onMouseUp={endDraw}
                                    onMouseLeave={endDraw}
                                    onTouchStart={startDraw}
                                    onTouchMove={draw}
                                    onTouchEnd={endDraw}
                                />
                                {!hasSig && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-gray-300 text-sm font-medium">Signez ici →</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-center text-xs text-gray-400 mt-1.5">
                                Le client signe directement sur l'écran
                            </p>
                        </div>

                        {/* Bouton Signer */}
                        <button
                            onClick={handleSign}
                            disabled={saving || docStatus === 'signed'}
                            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-colors ${docStatus === 'signed'
                                ? 'bg-green-100 text-green-700 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                                } disabled:opacity-60`}
                        >
                            {saving ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : docStatus === 'signed' ? (
                                <><CheckCircle className="w-5 h-5" /> Rapport signé</>
                            ) : (
                                <><PenTool className="w-5 h-5" /> Signer le rapport</>
                            )}
                        </button>

                        {/* Terminer sans signature */}
                        {docStatus !== 'signed' && docStatus !== 'completed' && (
                            <button
                                onClick={() => handleSave('completed')}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60"
                            >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                Terminer sans signature
                            </button>
                        )}

                        {/* Voir le rapport complet */}
                        {reportId && (
                            <button
                                onClick={() => navigate(`/app/interventions/${reportId}`)}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Ouvrir le rapport complet
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Visite chantier modale ──────────────────────────────────── */}
            <SiteVisitModal
                isOpen={showSiteVisit}
                onClose={() => setShowSiteVisit(false)}
                clientId={clientId}
                clientName={clientName || undefined}
            />

            {/* ── Barre d'onglets ─────────────────────────────────────────── */}
            <div className="shrink-0 bg-white border-t border-gray-200 flex safe-area-bottom">
                {tabConfig.map(({ id, Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${tab === id
                            ? 'text-blue-600 border-t-2 border-blue-600 -mt-px'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <Icon className="w-5 h-5" />
                        <span className="text-[10px] font-semibold">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default TerrainMode;
