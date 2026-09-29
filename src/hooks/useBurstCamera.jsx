import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import LiveCameraSheet from '../components/LiveCameraSheet';
import { cameraErrorMessage, isInPageCameraSupported, openCameraStream } from '../utils/cameraCapture';

/**
 * Photos en rafale : l'appareil photo du téléphone se referme après chaque
 * cliché, il faut le rouvrir pour la photo suivante. Ici l'aperçu reste
 * ouvert dans la page (LiveCameraSheet) : on enchaîne les photos, puis toute
 * la série part d'un coup à la fermeture (« Terminé » ou croix — une photo
 * prise n'est jamais jetée).
 *
 * `openCamera` doit être appelé dans le geste de l'utilisateur (clic) :
 * plusieurs navigateurs refusent la caméra à un appel différé. Sans caméra
 * dans la page (refus, appareil non compatible), `onFallback` ouvre
 * l'appareil photo du téléphone à la place.
 *
 * @param {object} opts
 * @param {(files: File[]) => void} opts.onFiles  reçoit la série de photos
 * @param {() => void} [opts.onFallback]          repli : appareil photo natif
 * @param {string} [opts.label]                   libellé affiché dans le viseur
 */
export const useBurstCamera = ({ onFiles, onFallback, label }) => {
    const [stream, setStream] = useState(null);
    // Nouvelle clé à chaque ouverture : le viseur repart sans les vignettes
    // ni le compteur de la série précédente.
    const [session, setSession] = useState(0);
    const shotsRef = useRef([]);
    const onFilesRef = useRef(onFiles);
    useEffect(() => { onFilesRef.current = onFiles; });

    // Coupe la caméra dès que le flux est remplacé ou le composant démonté.
    useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [stream]);

    const deliverShots = () => {
        const files = shotsRef.current;
        shotsRef.current = [];
        if (files.length > 0) onFilesRef.current(files);
    };

    // Démontage pendant une série (changement de page) : les photos partent quand même.
    useEffect(() => () => {
        const files = shotsRef.current;
        shotsRef.current = [];
        if (files.length > 0) onFilesRef.current(files);
    }, []);

    const openCamera = async () => {
        if (!isInPageCameraSupported()) {
            onFallback?.();
            return;
        }
        try {
            const opened = await openCameraStream('environment');
            shotsRef.current = [];
            setSession(n => n + 1);
            setStream(opened);
        } catch (err) {
            toast.error(cameraErrorMessage(err));
            onFallback?.();
        }
    };

    const closeCamera = () => {
        setStream(null);
        deliverShots();
    };

    const camera = (
        <LiveCameraSheet
            key={session}
            open={Boolean(stream)}
            stream={stream}
            onClose={closeCamera}
            onCapture={(file) => { shotsRef.current.push(file); }}
            onUseNativeCamera={onFallback}
            zoneLabel={label}
        />
    );

    return { openCamera, camera, cameraOpen: Boolean(stream) };
};
