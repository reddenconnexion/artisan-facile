import { useCallback, useEffect, useRef, useState } from 'react';

const currentFullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

/**
 * Le navigateur sait-il passer cet élément en plein écran ? Non sur iPhone
 * (Safari n'accepte le plein écran que pour une <video>), oui sur ordinateur,
 * Android et iPad (préfixe webkit).
 */
export const supportsNativeFullscreen = (el, doc = document) => {
    if (!el) return false;
    const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
    return Boolean(enabled && (el.requestFullscreen || el.webkitRequestFullscreen));
};

/**
 * Plein écran d'un élément, avec repli en overlay quand l'API Fullscreen
 * n'est pas disponible (iPhone).
 *
 *   - mode 'native'  : l'élément est passé en plein écran par le navigateur ;
 *     Échap et le bouton du navigateur en sortent, l'état suit via
 *     l'événement fullscreenchange.
 *   - mode 'overlay' : à l'appelant d'afficher l'élément en position fixe
 *     par-dessus la page ; Échap le ferme et le défilement de la page
 *     derrière est bloqué.
 *
 * Retourne une ref à poser sur l'élément à agrandir.
 */
export const useFullscreen = () => {
    const ref = useRef(null);
    const [mode, setMode] = useState(null);
    const modeRef = useRef(null);
    useEffect(() => { modeRef.current = mode; }, [mode]);

    useEffect(() => {
        const handleChange = () => {
            const el = currentFullscreenElement();
            setMode(prev => {
                if (el && el === ref.current) return 'native';
                return prev === 'native' ? null : prev;
            });
        };
        document.addEventListener('fullscreenchange', handleChange);
        document.addEventListener('webkitfullscreenchange', handleChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleChange);
            document.removeEventListener('webkitfullscreenchange', handleChange);
        };
    }, []);

    // Quitter la page en plein écran ne doit pas y laisser le navigateur
    // (la ref est déjà détachée au démontage : on se fie au dernier mode).
    useEffect(() => () => {
        if (modeRef.current === 'native' && currentFullscreenElement()) {
            (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        }
    }, []);

    const enter = useCallback(() => {
        const el = ref.current;
        if (!supportsNativeFullscreen(el)) {
            setMode('overlay');
            return;
        }
        try {
            const request = el.requestFullscreen || el.webkitRequestFullscreen;
            // Le passage effectif est signalé par fullscreenchange ; un refus
            // (permission, iframe sans allowfullscreen…) bascule sur l'overlay.
            const result = request.call(el);
            result?.catch?.(() => setMode('overlay'));
        } catch {
            setMode('overlay');
        }
    }, []);

    const exit = useCallback(() => {
        if (currentFullscreenElement()) {
            (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        }
        setMode(null);
    }, []);

    // Overlay : Échap ferme, la page derrière ne défile plus.
    useEffect(() => {
        if (mode !== 'overlay') return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setMode(null);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [mode]);

    return { ref, mode, isFullscreen: mode !== null, enter, exit };
};
