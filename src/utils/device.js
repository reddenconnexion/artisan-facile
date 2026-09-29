/** Appareil iOS/iPadOS — l'iframe n'y affiche que la première page du PDF. */
export const isIosLikeDevice = () =>
    typeof navigator !== 'undefined' && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
