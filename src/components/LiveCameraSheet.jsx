import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, ZapOff, Check, AlertTriangle, MapPin, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { formatDuration } from '../utils/siteVisitConfig';
import { frameToJpegBlob, photoFileName } from '../utils/cameraCapture';

/**
 * Appareil photo intégré à la page.
 *
 * L'application photo du téléphone ferait sortir du navigateur, et le système
 * couperait alors le micro : l'enregistrement de la visite s'arrêterait à
 * chaque photo. Ici l'aperçu et le déclencheur vivent dans la page, sur un
 * flux vidéo séparé (`audio: false`) — l'enregistrement audio continue sans
 * la moindre coupure, et on peut enchaîner les photos en rafale.
 *
 * Le flux est ouvert par l'appelant, dans le gestionnaire de clic, et passé
 * ici en `stream` : plusieurs navigateurs n'accordent la caméra que pendant
 * un geste de l'utilisateur, un appel différé dans un effet se ferait refuser.
 */
const LiveCameraSheet = ({ open, stream, onClose, onCapture, onUseNativeCamera, zoneLabel, isRecording, elapsed }) => {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);
    const [flash, setFlash] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [shots, setShots] = useState([]); // aperçus des photos de cette session
    const [busy, setBusy] = useState(false);

    // Branchement de l'aperçu. `play()` est appelé explicitement : sur
    // plusieurs navigateurs mobiles, un flux attaché après le montage ne
    // démarre pas tout seul malgré `autoPlay`.
    useEffect(() => {
        if (!open || !stream) return;
        setError(null);
        const video = videoRef.current;
        if (video) {
            video.srcObject = stream;
            video.play().catch(() => setError("L'aperçu ne démarre pas sur ce navigateur."));
        }
        setHasTorch(Boolean(stream.getVideoTracks()[0]?.getCapabilities?.().torch));
    }, [open, stream]);

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
        const track = stream?.getVideoTracks()[0];
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
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                        <div className="p-4 bg-amber-50 text-amber-800 rounded-2xl text-sm space-y-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                            {onUseNativeCamera && (
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onUseNativeCamera(); }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-amber-300 rounded-xl font-semibold"
                                >
                                    <Camera className="w-4 h-4" />
                                    Utiliser l'appareil photo du téléphone
                                </button>
                            )}
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
                    disabled={Boolean(error) || busy}
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
