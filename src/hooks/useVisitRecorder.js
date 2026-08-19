import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

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
 * Un segment se ferme à la rotation demandée (changement de pièce, photo) ou
 * au bout de `segmentMs`. Chaque segment fermé remonte via `onSegment`, avec
 * les métadonnées prises à son ouverture (`getSegmentMeta`), pour être
 * rattaché à la bonne pièce.
 *
 * @param {object}   options
 * @param {number}   [options.segmentMs=480000] - durée maximale d'un segment (8 min)
 * @param {(segment: {blob: Blob, mimeType: string, duration: number, index: number, startedAt: number, meta: any}) => void} options.onSegment
 * @param {() => any} [options.getSegmentMeta] - lu à l'ouverture de chaque segment
 */
export const useVisitRecorder = ({ segmentMs = 8 * 60 * 1000, onSegment, getSegmentMeta } = {}) => {
    const [isSupported, setIsSupported] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [segmentCount, setSegmentCount] = useState(0);

    const streamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const tickRef = useRef(null);
    const rotateRef = useRef(null);
    const indexRef = useRef(0);
    const startedAtRef = useRef(null);
    const metaRef = useRef(null);
    // Intention de l'utilisateur : reste vraie même si le système coupe le micro.
    const wantsRecordingRef = useRef(false);
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
        startedAtRef.current = startedAt;
        metaRef.current = meta;

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
            // Enchaîner sur un nouveau segment tant que l'utilisateur enregistre.
            if (wantsRecordingRef.current && streamRef.current) beginSegment();
        };

        indexRef.current += 1;
        recorder.start();
        clearRotate();
        rotateRef.current = setTimeout(() => {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        }, segmentMs);
    }, [segmentMs]);

    /** Ferme le segment en cours et en ouvre un nouveau, sans couper la visite. */
    const rotateSegment = useCallback(() => {
        if (!wantsRecordingRef.current) return;
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    const start = useCallback(async () => {
        if (!isSupported) {
            toast.error("L'enregistrement audio n'est pas supporté par cet appareil.");
            return false;
        }
        if (wantsRecordingRef.current) return true;
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            toast.error('Accès au micro refusé.');
            return false;
        }
        wantsRecordingRef.current = true;
        indexRef.current = 0;
        setSegmentCount(0);
        setElapsed(0);
        setIsRecording(true);
        beginSegment();
        tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        return true;
    }, [isSupported, beginSegment]);

    const stop = useCallback(() => {
        wantsRecordingRef.current = false;
        clearRotate();
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        recorderRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
    }, []);

    // L'appareil photo ou un appel entrant peut confisquer le micro : au
    // retour dans l'application, on relance un segment si l'utilisateur
    // n'a jamais demandé l'arrêt.
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    return { isSupported, isRecording, elapsed, segmentCount, start, stop, rotateSegment };
};
