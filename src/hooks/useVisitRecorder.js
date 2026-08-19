import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { audioConstraints, listAudioInputs, levelFromTimeDomain } from '../utils/audioInput';

/**
 * Enregistreur de visite : le micro tourne du début à la fin du tour du
 * propriétaire, pendant que le client parle. L'artisan n'a rien à piloter.
 *
 * L'enregistrement est découpé en segments complets et autonomes plutôt que
 * gardé en un seul bloc :
 *   - un segment WebM/Opus isolé reste transcriptible (un morceau détaché
 *     d'un flux unique ne l'est pas : seul le premier porte l'en-tête) ;
 *   - une visite d'une heure ne part pas en un seul fichier trop lourd ;
 *   - si le téléphone coupe le micro (appel entrant, appareil photo), on ne
 *     perd que le segment en cours, pas la visite.
 *
 * Un segment se ferme à la rotation demandée (changement de pièce) ou au bout
 * de `segmentMs`. Chaque segment fermé remonte via `onSegment`, avec les
 * métadonnées prises à son ouverture (`getSegmentMeta`), pour être rattaché à
 * la bonne pièce.
 *
 * Le micro peut être celui du téléphone ou un micro branché (`deviceId`). Le
 * niveau sonore est mesuré en continu : c'est la seule preuve visible qu'on
 * n'enregistre pas une heure de silence.
 *
 * @param {object}   options
 * @param {number}   [options.segmentMs=480000] - durée maximale d'un segment (8 min)
 * @param {string}   [options.deviceId] - entrée audio à utiliser ; vide = choix du système
 * @param {(segment: {blob: Blob, mimeType: string, duration: number, index: number, startedAt: number, meta: any}) => void} options.onSegment
 * @param {() => any} [options.getSegmentMeta] - lu à l'ouverture de chaque segment
 */
export const useVisitRecorder = ({ segmentMs = 8 * 60 * 1000, deviceId = '', onSegment, getSegmentMeta } = {}) => {
    const [isSupported, setIsSupported] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [segmentCount, setSegmentCount] = useState(0);
    const [level, setLevel] = useState(0);
    const [inputLabel, setInputLabel] = useState('');
    const [inputs, setInputs] = useState([]);
    // Vrai quand le micro ne capte plus rien depuis un moment : c'est le seul
    // moyen de repérer un enregistrement muet avant la fin de la visite.
    const [isSilent, setIsSilent] = useState(false);

    const streamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const tickRef = useRef(null);
    const rotateRef = useRef(null);
    const indexRef = useRef(0);
    // Intention de l'utilisateur : reste vraie même si le système coupe le micro.
    const wantsRecordingRef = useRef(false);
    // Résolveur d'un arrêt explicite (changement de micro) : dans ce cas le
    // segment suivant n'est pas enchaîné automatiquement.
    const stopResolveRef = useRef(null);
    const audioCtxRef = useRef(null);
    const levelTimerRef = useRef(null);
    const silentTicksRef = useRef(0);
    const onSegmentRef = useRef(onSegment);
    const getMetaRef = useRef(getSegmentMeta);

    useEffect(() => { onSegmentRef.current = onSegment; }, [onSegment]);
    useEffect(() => { getMetaRef.current = getSegmentMeta; }, [getSegmentMeta]);

    useEffect(() => {
        if (!navigator.mediaDevices || !window.MediaRecorder) setIsSupported(false);
    }, []);

    const pickMimeType = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    };

    const clearRotate = () => {
        if (rotateRef.current) { clearTimeout(rotateRef.current); rotateRef.current = null; }
    };

    /** Liste des entrées audio — les noms n'arrivent qu'après la permission. */
    const refreshInputs = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setInputs(listAudioInputs(devices));
        } catch {
            setInputs([]);
        }
    }, []);

    // Au montage : si la permission micro a déjà été accordée à ce site, les
    // noms des entrées sont connus et la liste est utilisable avant même le
    // premier enregistrement.
    useEffect(() => { refreshInputs(); }, [refreshInputs]);

    useEffect(() => {
        if (!navigator.mediaDevices?.addEventListener) return undefined;
        const onChange = () => refreshInputs();
        navigator.mediaDevices.addEventListener('devicechange', onChange);
        return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
    }, [refreshInputs]);

    // ── Niveau sonore ──────────────────────────────────────────────────────

    const stopLevelMeter = useCallback(() => {
        if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        silentTicksRef.current = 0;
        setLevel(0);
        setIsSilent(false);
    }, []);

    const startLevelMeter = useCallback((stream) => {
        stopLevelMeter();
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            ctx.createMediaStreamSource(stream).connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            audioCtxRef.current = ctx;
            const SILENCE_LEVEL = 0.02;
            const SILENCE_TICKS = Math.round(15000 / 120); // ~15 s de silence
            silentTicksRef.current = 0;
            levelTimerRef.current = setInterval(() => {
                analyser.getByteTimeDomainData(data);
                const next = levelFromTimeDomain(data);
                setLevel(next);
                silentTicksRef.current = next < SILENCE_LEVEL ? silentTicksRef.current + 1 : 0;
                setIsSilent(silentTicksRef.current >= SILENCE_TICKS);
            }, 120);
        } catch {
            /* jauge indisponible : l'enregistrement continue sans elle */
        }
    }, [stopLevelMeter]);

    // ── Flux audio ─────────────────────────────────────────────────────────

    const releaseStream = () => {
        streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
        streamRef.current = null;
    };

    /**
     * Ouvre le flux sur l'entrée demandée. Un micro mémorisé puis débranché
     * ferait échouer la contrainte stricte : on retombe alors sur le choix du
     * système plutôt que de laisser l'artisan sans enregistrement.
     */
    const acquireStream = useCallback(async (wantedId) => {
        try {
            return await navigator.mediaDevices.getUserMedia(audioConstraints(wantedId));
        } catch (err) {
            if (!wantedId) throw err;
            const stream = await navigator.mediaDevices.getUserMedia(audioConstraints(''));
            toast.warning('Micro choisi indisponible — enregistrement sur le micro par défaut.');
            return stream;
        }
    }, []);

    const beginSegment = useCallback(() => {
        const stream = streamRef.current;
        if (!stream) return;
        const mimeType = pickMimeType();
        // 32 kbit/s : largement suffisant pour de la parole, et surtout
        // 8 minutes d'enregistrement ≈ 2 Mo, ce qui passe sans problème dans
        // une requête vers la fonction de transcription (Whisper plafonne à
        // 25 Mo par fichier) au lieu des ~8 Mo du réglage par défaut.
        const recorder = new MediaRecorder(stream, {
            ...(mimeType ? { mimeType } : {}),
            audioBitsPerSecond: 32000,
        });
        const startedAt = Date.now();
        const meta = getMetaRef.current?.() ?? null;
        const index = indexRef.current;

        chunksRef.current = [];
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
        recorder.onerror = () => toast.error('Le micro a été interrompu — enregistrement relancé.');
        recorder.onstop = () => {
            const chunks = chunksRef.current;
            chunksRef.current = [];
            if (chunks.length) {
                const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
                onSegmentRef.current?.({
                    blob,
                    mimeType: recorder.mimeType || mimeType || 'audio/webm',
                    duration: Math.round((Date.now() - startedAt) / 1000),
                    index,
                    startedAt,
                    meta,
                });
                setSegmentCount((n) => n + 1);
            }
            // Arrêt explicite (changement de micro, débranchement) : c'est
            // l'appelant qui décidera de la suite.
            const resolve = stopResolveRef.current;
            if (resolve) { stopResolveRef.current = null; resolve(); return; }
            // Sinon on enchaîne tant que l'utilisateur enregistre.
            if (wantsRecordingRef.current && streamRef.current) beginSegment();
        };

        indexRef.current += 1;
        recorder.start();
        clearRotate();
        rotateRef.current = setTimeout(() => {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        }, segmentMs);
    }, [segmentMs]);

    /** Ferme le segment en cours sans en ouvrir un nouveau. */
    const stopCurrentSegment = useCallback(() => new Promise((resolve) => {
        clearRotate();
        const recorder = recorderRef.current;
        if (!recorder || recorder.state !== 'recording') return resolve();
        stopResolveRef.current = resolve;
        recorder.stop();
    }), []);

    /** Ferme le segment en cours et en ouvre un nouveau, sans couper la visite. */
    const rotateSegment = useCallback(() => {
        if (!wantsRecordingRef.current) return;
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    /** Bascule sur une autre entrée audio, enregistrement en cours compris. */
    const switchInput = useCallback(async (wantedId) => {
        if (!wantsRecordingRef.current) return;
        await stopCurrentSegment();
        releaseStream();
        stopLevelMeter();
        try {
            const stream = await acquireStream(wantedId);
            streamRef.current = stream;
            setInputLabel(stream.getAudioTracks()[0]?.label || '');
            startLevelMeter(stream);
            beginSegment();
        } catch {
            wantsRecordingRef.current = false;
            setIsRecording(false);
            toast.error('Micro inaccessible — enregistrement arrêté.');
        }
    }, [acquireStream, beginSegment, stopCurrentSegment, startLevelMeter, stopLevelMeter]);

    // Micro débranché en pleine visite : on bascule sur celui du téléphone
    // plutôt que de continuer à enregistrer du vide.
    const watchTrack = useCallback((stream) => {
        const track = stream.getAudioTracks()[0];
        if (!track) return;
        track.onended = () => {
            if (!wantsRecordingRef.current) return;
            toast.warning('Micro débranché — bascule sur le micro du téléphone.');
            switchInput('');
        };
    }, [switchInput]);

    const start = useCallback(async () => {
        if (!isSupported) {
            toast.error("L'enregistrement audio n'est pas supporté par cet appareil.");
            return false;
        }
        if (wantsRecordingRef.current) return true;
        let stream;
        try {
            stream = await acquireStream(deviceId);
        } catch {
            toast.error('Accès au micro refusé.');
            return false;
        }
        streamRef.current = stream;
        setInputLabel(stream.getAudioTracks()[0]?.label || '');
        watchTrack(stream);
        startLevelMeter(stream);
        refreshInputs();

        wantsRecordingRef.current = true;
        indexRef.current = 0;
        setSegmentCount(0);
        setElapsed(0);
        setIsRecording(true);
        beginSegment();
        tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        return true;
    }, [isSupported, deviceId, acquireStream, beginSegment, refreshInputs, watchTrack, startLevelMeter]);

    const stop = useCallback(() => {
        wantsRecordingRef.current = false;
        stopResolveRef.current = null;
        clearRotate();
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        recorderRef.current = null;
        stopLevelMeter();
        releaseStream();
        setIsRecording(false);
    }, [stopLevelMeter]);

    // L'appareil photo natif ou un appel entrant peut confisquer le micro : au
    // retour dans l'application, on relance un segment si l'utilisateur n'a
    // jamais demandé l'arrêt.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (!wantsRecordingRef.current) return;
            if (recorderRef.current?.state === 'recording') return;
            if (streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live')) beginSegment();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [beginSegment]);

    useEffect(() => () => {
        wantsRecordingRef.current = false;
        clearRotate();
        if (tickRef.current) clearInterval(tickRef.current);
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        if (levelTimerRef.current) clearInterval(levelTimerRef.current);
        audioCtxRef.current?.close().catch(() => {});
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    return {
        isSupported,
        isRecording,
        elapsed,
        segmentCount,
        level,
        isSilent,
        inputLabel,
        inputs,
        start,
        stop,
        rotateSegment,
        switchInput,
        refreshInputs,
    };
};
