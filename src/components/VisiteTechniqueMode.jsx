import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUserProfile } from '../hooks/useDataCache';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { generateQuoteFromSiteVisit } from '../utils/aiService';
import { blobToBase64, imageFileToBase64, compressImageFile } from '../utils/mediaConverters';
import { assertWithinQuota } from '../utils/storageQuota';
import { buildVisitRecord, buildClientPhotoRows, visitPhotoPath, visitReportNumber } from '../utils/visitArchive';
import { buildPredevisReport } from '../utils/predevisReport';
import { getSurveyTemplate } from '../constants/surveyTemplates';
import { createEmptySurvey, buildSurveyText, hasSurveyContent } from '../utils/surveyText';
import SurveyForm from './SurveyForm';
import VisiteExpressMode, { ExpressActionPad } from './VisiteExpressMode';
import LiveCameraSheet from './LiveCameraSheet';
import { isInPageCameraSupported, openCameraStream, cameraErrorMessage } from '../utils/cameraCapture';
import { readAudioInput, rememberAudioInput } from '../utils/audioInput';
import PredevisReportModal from './PredevisReportModal';
import { useVisitRecorder } from '../hooks/useVisitRecorder';
import {
    createCapture, addZoneChange, addCount, addVoice, addPhoto, addFlag,
    undoLast, hasCaptureContent, ensureSurveyZone, bumpSurveyCounter,
    buildTimelineLines, photoZones,
} from '../utils/visitCapture';
import { surveyCompleteness } from '../utils/predevisReport';
import { loadVisitDraft, saveVisitDraft, clearVisitDraft, draftAgeLabel } from '../utils/visitDraft';
import {
    formatDuration,
    fmtEur,
    PROCESSING_STEPS,
    PHASE_ORDER,
    CONFIDENCE_STYLES,
    CONFIDENCE_LABELS,
} from '../utils/siteVisitConfig';
import { toast } from 'sonner';
import {
    ArrowLeft, Mic, MicOff, Camera, Image as ImageIcon, Trash2,
    Loader2, CheckCircle2, AlertCircle, Sparkles, Clock, ChevronDown,
    X, TrendingUp, MapPin, AlignLeft, FilePlus, FileText, ChevronUp, Lightbulb,
    ClipboardList, ClipboardCheck, History, Zap,
} from 'lucide-react';

// Brouillon de visite exploitable retrouvé sur l'appareil, ou null.
const readPendingDraft = () => {
    const draft = loadVisitDraft();
    const usable = draft && (draft.clientName?.trim() || hasSurveyContent(draft.survey) || hasCaptureContent(draft.capture));
    return usable ? draft : null;
};

// Photos prêtes à l'emploi : identifiant stable pour que le fil de visite
// puisse les référencer (et les retirer en cas d'annulation).
const buildPhotos = (files) => Array.from(files).map((file, i) => ({
    id: `ph-${Date.now()}-${i}-${Math.round(Math.random() * 1e6)}`,
    file,
    preview: URL.createObjectURL(file),
    mediaType: file.type || 'image/jpeg',
}));

// Horloge du fil de visite. Impure : appelée depuis les gestionnaires
// d'événements, jamais pendant le rendu.
const nowMs = () => Date.now();

// Horloge et identifiants : impurs, donc hors du composant.
const nowDate = () => new Date();
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const makeReportNumber = (date) => visitReportNumber(date, Date.now().toString().slice(-4));

// ── Component ──────────────────────────────────────────────────────────────

const VisiteTechniqueMode = ({ onBack }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const confirm = useConfirm();
    const { data: profile } = useUserProfile();

    const [step, setStep] = useState('capture'); // 'capture' | 'processing' | 'result'
    const [mode, setMode] = useState('express'); // 'express' (visite en cours) | 'detail' (mise au propre)

    // Fil de la visite : ce qui s'est passé, dans l'ordre, pièce par pièce.
    const [capture, setCapture] = useState(createCapture);
    const [cameraStream, setCameraStream] = useState(null);
    const nativePhotoInputRef = useRef(null);

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

    // Tips panel
    const [showTips, setShowTips] = useState(false);

    // Trame de relevé structurée (optionnelle), adaptée au métier du profil
    const surveyTemplate = getSurveyTemplate(profile?.trade);
    const [survey, setSurvey] = useState(createEmptySurvey);
    const [showSurvey, setShowSurvey] = useState(true);

    // Compte rendu de visite (sortie principale : à coller dans l'IA devis)
    const [showReport, setShowReport] = useState(null); // Date d'ouverture du compte rendu
    const [voiceTranscripts, setVoiceTranscripts] = useState({}); // { [idNoteVocale]: texte }

    // Brouillon repéré au démarrage (visite interrompue)
    const [pendingDraft, setPendingDraft] = useState(readPendingDraft);

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

    // ── Brouillon : une visite ne se perd pas ──────────────────────────────
    // Appel entrant, mise en veille, onglet recyclé par le téléphone : le
    // relevé saisi est relu au démarrage (voir readPendingDraft) et proposé
    // à la reprise ; il est réécrit à chaque modification.
    useEffect(() => {
        if (step !== 'capture') return undefined;
        const hasSomething = clientName.trim() || address.trim() || textNotes.trim()
            || hasSurveyContent(survey) || hasCaptureContent(capture);
        if (!hasSomething) return undefined;
        const timer = setTimeout(
            () => saveVisitDraft({ clientId, clientName, address, textNotes, survey, capture }),
            600
        );
        return () => clearTimeout(timer);
    }, [step, clientId, clientName, address, textNotes, survey, capture]);

    const restoreDraft = () => {
        const draft = pendingDraft;
        if (!draft) return;
        setClientId(draft.clientId ?? null);
        setClientName(draft.clientName || '');
        setAddress(draft.address || '');
        setTextNotes(draft.textNotes || '');
        if (draft.survey) setSurvey({ ...createEmptySurvey(), ...draft.survey });
        // Le fil revient sans ses médias : l'audio et les photos ne survivent
        // pas à la fermeture de l'onglet, le texte du déroulé si.
        if (draft.capture) setCapture({ ...createCapture(), ...draft.capture });
        setPendingDraft(null);
        toast.success('Relevé repris');
    };

    const discardDraft = () => {
        clearVisitDraft();
        setPendingDraft(null);
    };

    // ── Mode express : le micro tourne, les taps complètent ────────────────

    // Pièce courante lue par l'enregistreur à l'ouverture de chaque segment,
    // pour rattacher l'audio à la bonne pièce même s'il se ferme plus tard.
    const captureZoneRef = useRef('');
    useEffect(() => { captureZoneRef.current = capture.zone; }, [capture.zone]);

    const handleSegment = useCallback(({ blob, mimeType, duration, index, startedAt, meta }) => {
        const id = `seg-${startedAt}-${index}`;
        const zone = meta?.zone || '';
        setVoiceNotes(prev => [...prev, { id, blob, mimeType, duration, zone }]);
        setCapture(c => addVoice(c, { mediaId: id, duration, at: startedAt, zone }));
    }, []);

    const getSegmentMeta = useCallback(() => ({ zone: captureZoneRef.current }), []);

    // Micro retenu d'une visite à l'autre : un micro-cravate branché reste
    // sélectionné, sans avoir à y penser au démarrage suivant.
    const [micId, setMicId] = useState(readAudioInput);
    const visitRecorder = useVisitRecorder({ onSegment: handleSegment, getSegmentMeta, deviceId: micId });

    const handlePickMic = (id) => {
        setMicId(id);
        rememberAudioInput(id);
        visitRecorder.switchInput(id); // sans effet hors enregistrement
    };

    const startVisit = async () => {
        const started = await visitRecorder.start();
        if (started) toast.success('Visite enregistrée — prévenez le client.');
    };

    const stopVisit = () => {
        visitRecorder.stop();
        toast.success('Enregistrement terminé.');
    };

    // Une pièce doit exister pour porter un comptage : si rien n'a encore été
    // désigné, on en ouvre une, renommable ensuite dans l'onglet « Détaillé ».
    const currentZoneName = () => capture.zone || `Pièce ${(survey.zones?.length || 0) + 1}`;

    const handleZoneChange = (name) => {
        visitRecorder.rotateSegment(); // l'audio suivant appartient à la nouvelle pièce
        setSurvey(s => ensureSurveyZone(s, name));
        setCapture(c => addZoneChange(c, name, nowMs()));
    };

    const handleCount = (counterKey, delta) => {
        const zone = currentZoneName();
        setSurvey(s => bumpSurveyCounter(s, zone, counterKey, delta));
        setCapture(c => {
            const withZone = c.zone ? c : addZoneChange(c, zone, nowMs());
            return addCount(withZone, { counterKey, delta, at: nowMs() });
        });
    };

    const handleFlag = () => setCapture(c => addFlag(c, { at: nowMs() }));

    // Le flux caméra est ouvert ici, dans le geste de l'utilisateur : plusieurs
    // navigateurs refusent la caméra à un appel différé (effet, promesse).
    // En cas d'échec on bascule sur l'appareil photo du téléphone plutôt que
    // de laisser l'artisan sans photo.
    const handleOpenCamera = async () => {
        try {
            setCameraStream(await openCameraStream('environment'));
        } catch (err) {
            toast.error(cameraErrorMessage(err));
            nativePhotoInputRef.current?.click();
        }
    };

    const handleCloseCamera = () => {
        cameraStream?.getTracks().forEach(t => t.stop());
        setCameraStream(null);
    };

    // Photos prises dans la page : l'enregistrement continue, rien à couper.
    const handleCameraCapture = (file) => {
        const [added] = buildPhotos([file]);
        setPhotos(prev => [...prev, added]);
        setCapture(c => addPhoto(c, { mediaId: added.id, at: nowMs() }));
        uploadPhotos([added]);
    };

    // Repli sur l'appareil photo du téléphone (caméra inaccessible dans la
    // page) : il prend le micro, on ferme donc proprement le segment en cours.
    const handleExpressPhotos = (files) => {
        if (!files?.length) return;
        visitRecorder.rotateSegment();
        const added = buildPhotos(files);
        const at = nowMs();
        setPhotos(prev => [...prev, ...added]);
        setCapture(c => added.reduce((acc, ph) => addPhoto(acc, { mediaId: ph.id, at }), c));
        uploadPhotos(added);
    };

    const handleUndo = () => {
        const { capture: next, undone } = undoLast(capture);
        if (!undone) return;
        if (undone.type === 'count') {
            setSurvey(s => bumpSurveyCounter(s, undone.zone, undone.counterKey, -undone.delta));
        } else if (undone.type === 'photo') {
            setPhotos(prev => {
                const gone = prev.find(p => p.id === undone.mediaId);
                if (gone?.preview) URL.revokeObjectURL(gone.preview);
                return prev.filter(p => p.id !== undone.mediaId);
            });
        } else if (undone.type === 'voice') {
            setVoiceNotes(prev => prev.filter(n => n.id !== undone.mediaId));
        }
        setCapture(next);
    };

    // ── Archivage de la visite ─────────────────────────────────────────────
    // Le compte rendu ne vivait que dans le presse-papier : trois semaines
    // plus tard il ne restait rien. Chaque visite est donc enregistrée dans
    // Interventions, photos comprises. L'audio, lui, n'est jamais conservé :
    // il produit la transcription puis il est oublié.

    const [visitReportId, setVisitReportId] = useState(null);
    const [visitSaving, setVisitSaving] = useState(false);
    const uploadedPhotosRef = useRef([]);
    const linkedPhotoPathsRef = useRef(new Set());

    /**
     * Met les photos à l'abri dès la prise de vue, sans attendre le compte
     * rendu : sur chantier on peut fermer l'application, perdre la page ou
     * simplement passer à autre chose, et une photo restée en mémoire est
     * une photo perdue. Chaque photo porte son état (en cours / enregistrée
     * / échouée) pour que ce soit visible à l'écran.
     */
    const uploadPhotos = async (list) => {
        const todo = list.filter(p => p && !p.path);
        if (!todo.length || !user) return uploadedPhotosRef.current;
        const ids = new Set(todo.map(p => p.id));
        setPhotos(prev => prev.map(p => (ids.has(p.id) ? { ...p, uploading: true, failed: false } : p)));
        try {
            const files = await Promise.all(
                todo.map(p => compressImageFile(p.file, { maxDim: 1600, quality: 0.8 }))
            );
            await assertWithinQuota(files.reduce((sum, f) => sum + (f.size || 0), 0));
            for (let i = 0; i < files.length; i += 1) {
                const path = visitPhotoPath(user.id, newId());
                const { error } = await supabase.storage
                    .from('project-photos')
                    .upload(path, files[i], { contentType: 'image/jpeg' });
                if (error) throw error;
                const { data: { publicUrl } } = supabase.storage.from('project-photos').getPublicUrl(path);
                uploadedPhotosRef.current = [
                    ...uploadedPhotosRef.current,
                    { url: publicUrl, path, name: todo[i].file?.name || 'photo.jpg' },
                ];
                const uploadedId = todo[i].id;
                setPhotos(prev => prev.map(ph => (ph.id === uploadedId ? { ...ph, path, uploading: false } : ph)));
            }
        } catch (err) {
            // Réseau coupé, stockage plein : la photo reste en mémoire et
            // sera réessayée au retour du réseau ou à l'ouverture du compte
            // rendu. On le dit plutôt que de laisser croire que c'est fait.
            setPhotos(prev => prev.map(p => (ids.has(p.id) && !p.path ? { ...p, uploading: false, failed: true } : p)));
            toast.error(err.message || 'Photos pas encore enregistrées — nouvelle tentative plus tard.');
        }
        return uploadedPhotosRef.current;
    };

    // Filet de sécurité avant d'écrire le rapport : on repasse sur ce qui n'est
    // pas encore parti.
    const uploadPendingPhotos = () => uploadPhotos(photos.filter(p => !p.path));

    // Retour du réseau : on rattrape les photos restées en carafe.
    const photosRef = useRef(photos);
    useEffect(() => { photosRef.current = photos; }, [photos]);
    useEffect(() => {
        const retry = () => {
            const stuck = photosRef.current.filter(p => !p.path);
            if (stuck.length) uploadPhotos(stuck);
        };
        window.addEventListener('online', retry);
        return () => window.removeEventListener('online', retry);
    });

    const saveVisit = async (date, textOverride) => {
        if (!user) return;
        setVisitSaving(true);
        try {
            const uploaded = await uploadPendingPhotos();
            const meta = { ...reportMeta, date, photoCount: photos.length };
            const record = buildVisitRecord({
                userId: user.id,
                clientId,
                clientName,
                address,
                reportText: textOverride ?? buildPredevisReport({ survey, template: surveyTemplate, meta }),
                survey: hasSurveyContent(survey) ? survey : null,
                timelineLines: meta.timelineLines,
                transcripts: voiceTranscripts,
                photos: uploaded,
                date,
                reportNumber: makeReportNumber(date),
            });

            // Photos aussi dans la fiche client, quand la visite en a une :
            // elles rejoignent son dossier photo en « avant travaux », sans
            // second téléversement — la même image, une entrée de plus.
            if (clientId) {
                const fresh = uploaded.filter(p => !linkedPhotoPathsRef.current.has(p.path));
                if (fresh.length) {
                    const zonesByPhotoId = photoZones(capture);
                    const zoneByPhotoPath = Object.fromEntries(
                        photos.filter(p => p.path).map(p => [p.path, zonesByPhotoId[p.id] || ''])
                    );
                    const rows = buildClientPhotoRows({
                        userId: user.id, clientId, photos: fresh, date, zoneByPhotoPath,
                    });
                    const { error: photoErr } = await supabase.from('project_photos').insert(rows);
                    if (photoErr) console.error('Copie des photos dans la fiche client impossible :', photoErr);
                    else fresh.forEach(p => linkedPhotoPathsRef.current.add(p.path));
                }
            }

            if (visitReportId) {
                await supabase.from('intervention_reports').update(record).eq('id', visitReportId);
            } else {
                const { data } = await supabase.from('intervention_reports')
                    .insert(record).select('id').single();
                if (data?.id) setVisitReportId(data.id);
            }
        } catch (err) {
            console.error('Enregistrement de la visite impossible :', err);
            toast.error("Visite non enregistrée — le compte rendu reste copiable.");
        } finally {
            setVisitSaving(false);
        }
    };

    const openReport = (date = nowDate()) => {
        setShowReport(date);
        saveVisit(date);
    };

    const handleFinishVisit = () => {
        if (visitRecorder.isRecording) visitRecorder.stop();
        openReport();
    };

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
        const added = buildPhotos(files);
        setPhotos(prev => [...prev, ...added]);
        uploadPhotos(added);
    };

    const handleDeletePhoto = (id) => {
        setPhotos(prev => {
            const p = prev.find(x => x.id === id);
            if (p) URL.revokeObjectURL(p.preview);
            return prev.filter(x => x.id !== id);
        });
    };

    // ── Analysis ───────────────────────────────────────────────────────────

    const canAnalyze = voiceNotes.length > 0 || photos.length > 0 || textNotes.trim().length > 0
        || hasSurveyContent(survey) || hasCaptureContent(capture);

    const handleAnalyze = async () => {
        setStep('processing');
        setError(null);
        try {
            const transcripts = [];

            // Notes déjà transcrites depuis le compte rendu : on ne repasse
            // pas une deuxième fois par le serveur.
            const alreadyTranscribed = voiceNotes
                .map((n) => voiceTranscripts[n.id])
                .filter((t) => String(t ?? '').trim() !== '');
            if (alreadyTranscribed.length === voiceNotes.length && voiceNotes.length > 0) {
                transcripts.push(...alreadyTranscribed);
            } else if (voiceNotes.length > 0) {
                setActivePhase('voice');
                for (const note of voiceNotes) {
                    try {
                        const audioBase64 = await blobToBase64(note.blob);
                        const { data, error: fnErr } = await supabase.functions.invoke('voice-transcribe', {
                            body: { audioBase64, mimeType: note.mimeType }
                        });
                        if (fnErr) { console.warn('Transcription skipped:', fnErr.message); continue; }
                        if (data?.transcript) transcripts.push(data.transcript);
                    } catch (noteErr) {
                        console.warn('Transcription error, skipping note:', noteErr);
                    }
                }
            }

            if (textNotes.trim()) transcripts.push(textNotes.trim());

            const photoAnalyses = [];
            if (photos.length > 0) {
                setActivePhase('photos');
                for (const photo of photos) {
                    try {
                        const imageBase64 = await imageFileToBase64(photo.file);
                        const { data, error: fnErr } = await supabase.functions.invoke('plan-vision', {
                            body: {
                                imageBase64,
                                mediaType: photo.mediaType,
                                systemPrompt: 'Tu es un expert en travaux de bâtiment. Décris précisément ce que tu vois sur cette photo de chantier : matériaux visibles, type de travaux, état des surfaces, dimensions approximatives si possible, anomalies ou points d\'attention.',
                                userPrompt: 'Analyse cette photo pour aider à estimer les travaux à réaliser.',
                            }
                        });
                        if (fnErr) { console.warn('Photo analysis skipped:', fnErr.message); continue; }
                        if (data?.text) photoAnalyses.push(data.text);
                    } catch (photoErr) {
                        console.warn('Photo analysis error, skipping:', photoErr);
                    }
                }
            }

            setActivePhase('quote');
            const surveyText = buildSurveyText(survey, surveyTemplate);
            const context = {
                hourlyRate: profile?.ai_hourly_rate || '',
                instructions: profile?.ai_instructions || '',
                customSystemPrompt: profile?.ai_preferences?.quote_system_prompt || profile?.quote_system_prompt || '',
                surveyText,
            };
            const quoteResult = await generateQuoteFromSiteVisit(transcripts, photoAnalyses, context);

            setActivePhase('done');
            setResult(quoteResult);

            // Le chiffrage complète la visite déjà archivée (sinon il la crée).
            if (user) {
                try {
                    const reportNumber = makeReportNumber(nowDate());
                    const quotePayload = {
                        user_id: user.id,
                        client_id: clientId || null,
                        client_name: clientName || null,
                        title: quoteResult.title,
                        description: [surveyText, transcripts.join('\n')].filter(Boolean).join('\n\n') || null,
                        intervention_address: address || null,
                        notes: JSON.stringify({
                            suggestions: quoteResult.suggestions,
                            price_range: quoteResult.price_range,
                            estimated_duration: quoteResult.estimated_duration,
                            confidence: quoteResult.confidence,
                            ...(hasSurveyContent(survey) ? { survey } : {}),
                        }),
                        materials_used: quoteResult.items,
                        status: 'draft',
                        date: new Date().toISOString().split('T')[0],
                        report_number: reportNumber,
                        report_type: 'site_visit',
                    };
                    if (visitReportId) {
                        await supabase.from('intervention_reports')
                            .update({
                                title: quotePayload.title,
                                notes: quotePayload.notes,
                                materials_used: quotePayload.materials_used,
                            })
                            .eq('id', visitReportId);
                        setSavedReportId(visitReportId);
                    } else {
                        const { data: saved } = await supabase.from('intervention_reports')
                            .insert(quotePayload).select('id').single();
                        if (saved?.id) { setSavedReportId(saved.id); setVisitReportId(saved.id); }
                    }
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
        clearVisitDraft(); // la visite a produit un devis : le brouillon a fait son temps
        photos.forEach(p => URL.revokeObjectURL(p.preview));
        navigate('/app/devis/new', {
            state: {
                siteVisitItems: result.items,
                siteVisitTitle: isPredevis ? `ESTIMATIF - ${result.title}` : result.title,
                ...(clientId ? { client_id: clientId } : {}),
            }
        });
    };

    const handleBack = async () => {
        const unsaved = photos.filter(p => !p.path).length;
        if (unsaved > 0) {
            const ok = await confirm({
                title: `${unsaved} photo${unsaved > 1 ? 's' : ''} pas encore enregistrée${unsaved > 1 ? 's' : ''}`,
                message: "Elles seront perdues si vous quittez maintenant. Ouvrez le compte rendu pour les enregistrer.",
                confirmLabel: 'Quitter quand même',
                danger: true,
            });
            if (!ok) return;
        }
        if (isRecording) cancelRecording();
        if (visitRecorder.isRecording) visitRecorder.stop();
        handleCloseCamera();
        photos.forEach(p => URL.revokeObjectURL(p.preview));
        onBack();
    };

    // ── Derived ────────────────────────────────────────────────────────────

    const completeness = surveyCompleteness(survey, surveyTemplate);

    // Assemblé à chaque rendu : quelques concaténations sur des données de
    // taille modeste, et une identité stable ne servirait qu'à mémoïser un
    // texte de compte rendu déjà instantané à produire.
    const reportMeta = {
        clientName,
        address,
        // Les notes tapées sur place partent aussi dans le compte rendu :
        // elles n'alimentaient que le chiffrage direct, jamais l'archive.
        textNotes,
        date: showReport,
        companyName: profile?.company_name,
        artisanName: profile?.full_name,
        photoCount: photos.length,
        voiceNotesCount: voiceNotes.length,
        // Déroulé chronologique du mode express : il porte déjà les
        // transcriptions, pièce par pièce, à l'heure où elles ont été dites.
        timelineLines: hasCaptureContent(capture)
            ? buildTimelineLines(capture, { template: surveyTemplate, transcripts: voiceTranscripts })
            : [],
        // Repli hors mode express : les transcriptions à plat, préfixées de leur pièce.
        voiceTranscripts: voiceNotes
            .map((n) => {
                const text = String(voiceTranscripts[n.id] ?? '').trim();
                return text ? `${n.zone ? `${n.zone} — ` : ''}${text}` : '';
            })
            .filter(Boolean),
    };

    const totalHT = result?.items?.reduce(
        (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1), 0
    ) || 0;

    const phaseIdx = activePhase ? (PHASE_ORDER[activePhase] ?? -1) : -1;

    const STEPS = ['capture', 'processing', 'result'];

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col font-sans overflow-hidden">

            {/* Header */}
            <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm px-3 py-3 flex items-center gap-3 safe-area-top">
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
                        {step === 'capture' ? 'Relevé prédevis — compte rendu prêt à envoyer'
                            : step === 'processing' ? 'Analyse IA en cours…'
                            : 'Résultat — créez le prédevis ou le devis'}
                    </p>
                </div>
                {/* Avancement du relevé */}
                {step === 'capture' && completeness.total > 0 && (
                    <span
                        className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full tabular-nums ${
                            completeness.pct === 100
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                        }`}
                        title="Points clés renseignés pour un chiffrage fiable"
                    >
                        {completeness.done}/{completeness.total}
                    </span>
                )}
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
                    <div className="p-4 pb-0 space-y-4">

                        {pendingDraft && (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                                    <History className="w-4 h-4 flex-shrink-0" />
                                    Visite en cours retrouvée
                                </p>
                                <p className="text-xs text-blue-700 mt-0.5">
                                    {[pendingDraft.clientName, draftAgeLabel(pendingDraft.savedAt)].filter(Boolean).join(' — ')}
                                    {' '}· photos et notes vocales non conservées.
                                </p>
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={restoreDraft}
                                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                                    >
                                        Reprendre
                                    </button>
                                    <button
                                        onClick={discardDraft}
                                        className="px-3 py-2 border border-blue-200 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-100 transition-colors"
                                    >
                                        Repartir de zéro
                                    </button>
                                </div>
                            </div>
                        )}

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

                        {/* Onglets : la visite d'abord, la mise au propre ensuite */}
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-2xl">
                            {[
                                { key: 'express', Icon: Zap, label: 'Visite en cours' },
                                { key: 'detail', Icon: ClipboardList, label: 'Mise au propre' },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setMode(tab.key)}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                        mode === tab.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    <tab.Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'capture' && mode === 'express' && (
                    <VisiteExpressMode
                        template={surveyTemplate}
                        survey={survey}
                        capture={capture}
                        onZoneChange={handleZoneChange}
                        isRecording={visitRecorder.isRecording}
                        elapsed={visitRecorder.elapsed}
                        segmentCount={visitRecorder.segmentCount}
                        level={visitRecorder.level}
                        isSilent={visitRecorder.isSilent}
                        micId={micId}
                        micLabel={visitRecorder.inputLabel}
                        micInputs={visitRecorder.inputs}
                        onPickMic={handlePickMic}
                        photos={photos}
                        onRetryPhotos={() => uploadPhotos(photos.filter(p => !p.path))}
                    />
                )}

                {step === 'capture' && mode === 'detail' && (
                    <div className="p-4 space-y-5 pb-28">
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

                        {/* Trame de relevé structurée */}
                        <div>
                            <button
                                onClick={() => setShowSurvey(v => !v)}
                                className="w-full flex items-center gap-2 px-3 py-3 bg-violet-50 border border-violet-200 rounded-2xl text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                            >
                                <ClipboardList className="w-4 h-4 flex-shrink-0" />
                                <span className="flex-1 text-left">
                                    Trame de relevé — {surveyTemplate.label}
                                    <span className="block text-xs text-violet-400 font-normal">
                                        Contexte, pièce par pièce, tableau : la base du compte rendu
                                    </span>
                                </span>
                                {hasSurveyContent(survey) && (
                                    <span className="text-violet-700 bg-violet-200 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                                        {survey.zones.length > 0
                                            ? `${survey.zones.length} pièce${survey.zones.length > 1 ? 's' : ''}`
                                            : 'remplie'}
                                    </span>
                                )}
                                {showSurvey ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                            </button>
                            {showSurvey && (
                                <div className="mt-2 p-3 bg-violet-50/50 border border-violet-100 rounded-2xl">
                                    <SurveyForm template={surveyTemplate} survey={survey} onChange={setSurvey} />
                                </div>
                            )}
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

                            {/* Tips panel */}
                            <button
                                onClick={() => setShowTips(v => !v)}
                                className="w-full flex items-center gap-2 px-3 py-2 mb-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                                <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="flex-1 text-left">Comment bien dicter pour l'IA ?</span>
                                {showTips ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                            </button>

                            {showTips && (
                                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                                    {/* Example */}
                                    <div className="px-4 pt-3 pb-2">
                                        <p className="text-xs font-bold text-amber-800 mb-2 uppercase tracking-wide">Exemple de bonne note vocale</p>
                                        <div className="bg-white border border-amber-200 rounded-xl p-3 text-sm text-gray-700 leading-relaxed font-mono">
                                            <span className="text-violet-600 font-semibold not-italic">[Lieu]</span>{' '}
                                            "Salle de bain, 1er étage.{' '}
                                            <span className="text-blue-600 font-semibold">[Constat]</span>{' '}
                                            Carrelage mural décollé côté douche, environ 1m².{' '}
                                            <span className="text-orange-600 font-semibold">[Matériaux]</span>{' '}
                                            Carreaux 20×20 beige à remplacer, même teinte.{' '}
                                            <span className="text-green-600 font-semibold">[Action]</span>{' '}
                                            Dépose des carreaux, traitement anti-humidité, repose et rejointoiement. 2m² au total."
                                        </div>
                                    </div>

                                    {/* Rules */}
                                    <div className="px-4 pb-3 pt-1 space-y-2">
                                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Les 4 règles</p>
                                        {[
                                            { color: 'bg-violet-500', label: '1. Commencez par le lieu', tip: 'Pièce, étage, façade… l\'IA structure le devis par zone.' },
                                            { color: 'bg-blue-500', label: '2. Décrivez ce que vous constatez', tip: 'État actuel, défaut, anomalie. Soyez précis.' },
                                            { color: 'bg-orange-500', label: '3. Citez les matériaux & dimensions', tip: '"parquet chêne 120cm", "peinture lessivable", "3m de linéaire".' },
                                            { color: 'bg-green-500', label: '4. Terminez par l\'action à faire', tip: '"à déposer", "à reprendre", "à remplacer entièrement".' },
                                        ].map(({ color, label, tip }) => (
                                            <div key={label} className="flex gap-2.5">
                                                <div className={`w-2 h-2 rounded-full ${color} flex-shrink-0 mt-1.5`} />
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-800">{label}</p>
                                                    <p className="text-xs text-gray-500">{tip}</p>
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-2 mt-1">
                                            💡 <strong>Astuce :</strong> faites une note par pièce ou par poste de travail. L'IA génère une ligne de devis par sujet distinct.
                                        </p>
                                    </div>
                                </div>
                            )}

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
                                type="file" accept="image/*" multiple
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
                {step === 'capture' && mode === 'express' && (
                    <ExpressActionPad
                        template={surveyTemplate}
                        survey={survey}
                        capture={capture}
                        isRecording={visitRecorder.isRecording}
                        isSupported={visitRecorder.isSupported}
                        hasCaptured={hasCaptureContent(capture)}
                        onStart={startVisit}
                        onStop={stopVisit}
                        onCount={handleCount}
                        onFlag={handleFlag}
                        onUndo={handleUndo}
                        onPhotos={handleExpressPhotos}
                        onOpenCamera={handleOpenCamera}
                        cameraSupported={isInPageCameraSupported()}
                        onFinish={handleFinishVisit}
                    />
                )}
                {step === 'capture' && mode === 'detail' && (
                    <div className="space-y-2">
                        <button
                            onClick={() => openReport()}
                            disabled={!canAnalyze || isRecording}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <ClipboardCheck className="w-5 h-5" />
                            Compte rendu pour mon IA devis
                            {canAnalyze && (
                                <span className="text-violet-200 text-sm font-normal">
                                    ({[
                                        hasSurveyContent(survey) && 'trame',
                                        voiceNotes.length > 0 && `${voiceNotes.length} note${voiceNotes.length > 1 ? 's' : ''}`,
                                        photos.length > 0 && `${photos.length} photo${photos.length > 1 ? 's' : ''}`,
                                        textNotes.trim() && 'notes texte',
                                    ].filter(Boolean).join(', ')})
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleAnalyze}
                            disabled={!canAnalyze || isRecording}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <Sparkles className="w-5 h-5" />
                            Chiffrer directement dans l'app
                        </button>
                    </div>
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
                        <button
                            onClick={() => openReport()}
                            className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-700 py-1"
                        >
                            <ClipboardCheck className="w-4 h-4" />
                            Compte rendu pour mon IA devis
                        </button>
                    </div>
                )}
            </div>

            <LiveCameraSheet
                open={Boolean(cameraStream)}
                stream={cameraStream}
                onClose={handleCloseCamera}
                onCapture={handleCameraCapture}
                onUseNativeCamera={() => nativePhotoInputRef.current?.click()}
                zoneLabel={capture.zone}
                isRecording={visitRecorder.isRecording}
                elapsed={visitRecorder.elapsed}
            />

            {/* Repli : appareil photo du téléphone (il prend le micro, donc le
                segment audio en cours est fermé proprement par handleExpressPhotos). */}
            <input
                ref={nativePhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={e => { handleExpressPhotos(e.target.files); e.target.value = ''; }}
            />

            <PredevisReportModal
                open={Boolean(showReport)}
                onClose={() => setShowReport(null)}
                survey={survey}
                template={surveyTemplate}
                meta={reportMeta}
                voiceNotes={voiceNotes}
                transcripts={voiceTranscripts}
                onTranscripts={(map) => setVoiceTranscripts(prev => ({ ...prev, ...map }))}
                clientName={clientName}
                address={address}
                onPersist={(text) => saveVisit(showReport || nowDate(), text)}
                savedReportId={visitReportId}
                saving={visitSaving}
                onOpenSaved={(id) => navigate(`/app/interventions/${id}`)}
            />
        </div>
    );
};

export default VisiteTechniqueMode;
