import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Hook for recording audio using the MediaRecorder API.
 * Supports WebM (Chrome) and OGG (Firefox) formats.
 */
export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [isSupported, setIsSupported] = useState(true);

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);

    useEffect(() => {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            setIsSupported(false);
        }
        return () => {
            stopTimer();
            releaseStream();
        };
    }, []);

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const releaseStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const getSupportedMimeType = () => {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    };

    const startRecording = useCallback(async () => {
        if (!isSupported) {
            toast.error("L'enregistrement audio n'est pas supporté par votre navigateur");
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mimeType = getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            setAudioBlob(null);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const mType = mediaRecorderRef.current?.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: mType });
                setAudioBlob(blob);
                releaseStream();
            };

            mediaRecorder.onerror = (e) => {
                console.error('MediaRecorder error:', e);
                toast.error("Erreur lors de l'enregistrement");
                setIsRecording(false);
                stopTimer();
                releaseStream();
            };

            mediaRecorder.start(250); // collect data every 250ms
            setIsRecording(true);
            setDuration(0);
            startTimeRef.current = Date.now();

            timerRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);

            return true;
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                toast.error('Accès au microphone refusé. Vérifiez les permissions de votre navigateur.');
            } else {
                toast.error("Impossible d'accéder au microphone");
            }
            return false;
        }
    }, [isSupported]);

    const stopRecording = useCallback(() => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || !isRecording) {
                resolve(null);
                return;
            }

            stopTimer();
            setIsRecording(false);

            const recorder = mediaRecorderRef.current;
            const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

            recorder.onstop = () => {
                const mType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: mType });
                setAudioBlob(blob);
                releaseStream();
                resolve({ blob, mimeType: mType, duration: finalDuration });
            };

            recorder.stop();
        });
    }, [isRecording]);

    const cancelRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            stopTimer();
            setIsRecording(false);
            chunksRef.current = [];
            try {
                mediaRecorderRef.current.stop();
            } catch {}
            releaseStream();
            setAudioBlob(null);
        }
    }, [isRecording]);

    return {
        isRecording,
        duration,
        audioBlob,
        isSupported,
        startRecording,
        stopRecording,
        cancelRecording,
    };
};
