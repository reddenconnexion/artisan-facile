import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, ZapOff, Check, Loader2, AlertTriangle, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatDuration } from '../utils/siteVisitConfig';
import { videoConstraints, frameToJpegBlob, photoFileName } from '../utils/cameraCapture';

/**
 * Appareil photo intégré à la page.
 *
 * L'application photo du téléphone ferait sortir du navigateur, et le système
 * couperait alors le micro : l'enregistrement de la visite s'arrêterait à
 * chaque photo. Ici l'aperçu et le déclencheur vivent dans la page, sur un
 * flux vidéo séparé (`audio: false`) — l'enregistrement audio continue sans
 * la moindre coupure, et on peut enchaîner les photos en rafale.
 */
const LiveCameraSheet = ({ open, onClose, onCapture, zoneLabel, isRecording, elapsed }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState(null);
    const [flash, setFlash] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [shots, setShots] = useState([]); // aperçus des photos de cette session
    const [busy, setBusy] = useState(false);

    // Ouverture / fermeture du flux vidéo.
    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setStarting(true);
        setError(null);

        navigator.mediaDevices.getUserMedia(videoConstraints('environment'))
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
                const track = stream.getVideoTracks()[0];
                setHasTorch(Boolean(track?.getCapabilities?.().torch));
                setStarting(false);
            })
            .catch(() => {
                if (cancelled) return;
                setStarting(false);
                setError("Accès à la caméra refusé. Vous pouvez utiliser l'appareil photo du téléphone, mais l'enregistrement sera mis en pause pendant ce temps.");
            });

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [open]);

    // Les aperçus ne servent que le temps de la session photo. On les libère
    // à la fermeture — et seulement là, sinon on révoquerait des vignettes
    // encore affichées à chaque nouvelle prise.
    const previewUrlsRef = useRef([]);
    useEffect(() => () => {
        previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrlsRef.current = [];
    }, []);

    if (!open) return null;

    const toggleTorch = async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        const next = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next }] });
            setTorchOn(next);
        } catch {
            toast.error('Lampe indisponible sur cet appareil.');
        }
    };

    const shoot = async () => {
        if (busy) return;
        setBusy(true);
        try { navigator.vibrate?.(20); } catch { /* vibration non supportée */ }
        try {
            const blob = await frameToJpegBlob(videoRef.current);
            const at = Date.now();
            const file = new File([blob], photoFileName(at), { type: 'image/jpeg', lastModified: at });
            setFlash(true);
            setTimeout(() => setFlash(false), 120);
            const preview = URL.createObjectURL(blob);
            previewUrlsRef.current.push(preview);
            setShots((prev) => [{ id: `${at}`, preview }, ...prev].slice(0, 12));
            onCapture(file);
        } catch {
            toast.error('Photo ratée — réessayez.');
        } finally {
            setBusy(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
            {/* Bandeau : pièce en cours + enregistrement toujours actif */}
            <div className="shrink-0 px-4 py-3 flex items-center gap-3 text-white safe-area-top">
                {isRecording && (
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500 rounded-full text-xs font-bold">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                        </span>
                        <span className="tabular-nums">{formatDuration(elapsed)}</span>
                    </span>
                )}
                {zoneLabel && (
                    <span className="flex items-center gap-1 text-sm font-semibold truncate">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        {zoneLabel}
                    </span>
                )}
                <div className="flex-1" />
                {hasTorch && (
                    <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2.5 rounded-full ${torchOn ? 'bg-white text-gray-900' : 'bg-white/15 text-white'}`}
                        aria-label={torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
                    >
                        {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-white/15 text-white"
                    aria-label="Fermer l'appareil photo"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Aperçu */}
            <div className="flex-1 relative overflow-hidden">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                />
                {flash && <div className="absolute inset-0 bg-white animate-pulse" />}
                {starting && (
                    <div className="absolute inset-0 flex items-center justify-center text-white gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ouverture de la caméra…
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                        <div className="flex items-start gap-2 p-4 bg-amber-50 text-amber-800 rounded-2xl text-sm">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Pellicule de la session */}
            {shots.length > 0 && (
                <div className="shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto">
                    {shots.map((shot) => (
                        <img
                            key={shot.id}
                            src={shot.preview}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-white/20"
                        />
                    ))}
                </div>
            )}

            {/* Déclencheur */}
            <div className="shrink-0 px-6 py-5 flex items-center justify-between safe-area-bottom">
                <span className="w-24 text-white/70 text-sm tabular-nums">
                    {shots.length > 0 ? `${shots.length} photo${shots.length > 1 ? 's' : ''}` : ''}
                </span>
                <button
                    type="button"
                    onClick={shoot}
                    disabled={Boolean(error) || starting || busy}
                    className="w-20 h-20 rounded-full bg-white border-4 border-white/40 active:scale-90 transition-transform disabled:opacity-40"
                    aria-label="Prendre une photo"
                />
                <button
                    type="button"
                    onClick={onClose}
                    className="w-24 flex items-center justify-end gap-1.5 text-white font-semibold"
                >
                    <Check className="w-5 h-5" />
                    Terminé
                </button>
            </div>
        </div>,
        document.body
    );
};

export default LiveCameraSheet;
