// Prise de photo dans la page, sans passer par l'appareil photo du téléphone.
//
// Pourquoi : ouvrir l'application photo native fait sortir du navigateur, et
// le système confisque alors le micro — l'enregistrement de la visite
// s'arrête. En restant dans la page, le flux audio n'est jamais interrompu :
// on peut photographier pendant que le client parle.
//
// Les helpers de calcul sont purs ; le dessin sur canvas vit dans
// `frameToJpegBlob`, appelé par LiveCameraSheet.

/** Contraintes vidéo : caméra arrière, définition photo raisonnable. */
export const videoConstraints = (facingMode = 'environment') => ({
    audio: false, // surtout pas : le micro est déjà pris par l'enregistrement
    video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 2560 },
        height: { ideal: 1440 },
    },
});

/** Réduit (w, h) pour tenir dans `maxDim` en gardant le rapport d'image. */
export const scaleToMax = (w, h, maxDim) => {
    if (!w || !h) return { width: 0, height: 0 };
    if (w <= maxDim && h <= maxDim) return { width: w, height: h };
    return w > h
        ? { width: maxDim, height: Math.round((h * maxDim) / w) }
        : { width: Math.round((w * maxDim) / h), height: maxDim };
};

const pad = (n) => String(n).padStart(2, '0');

/** Nom de fichier horodaté, lisible dans une galerie ou une pièce jointe. */
export const photoFileName = (at = Date.now(), prefix = 'visite') => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return `${prefix}.jpg`;
    return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
        + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
};

/**
 * Capture l'image affichée par un <video> et la rend en JPEG.
 * @param {HTMLVideoElement} video
 * @param {object} [options] - { maxDim = 2048, quality = 0.85 }
 * @returns {Promise<Blob>}
 */
export const frameToJpegBlob = (video, { maxDim = 2048, quality = 0.85 } = {}) =>
    new Promise((resolve, reject) => {
        const sourceW = video?.videoWidth;
        const sourceH = video?.videoHeight;
        if (!sourceW || !sourceH) return reject(new Error('Aperçu caméra non prêt'));

        const { width, height } = scaleToMax(sourceW, sourceH, maxDim);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(video, 0, 0, width, height);
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Capture impossible'))),
            'image/jpeg',
            quality
        );
    });

/**
 * Message d'erreur explicite pour un refus de caméra. Savoir *pourquoi* la
 * caméra ne s'ouvre pas change ce qu'il faut faire : réautoriser le site,
 * fermer l'application photo, ou se rabattre sur l'appareil du téléphone.
 */
export const cameraErrorMessage = (error) => {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return "Caméra refusée pour ce site. Autorisez-la dans les réglages du navigateur (cadenas dans la barre d'adresse), puis réessayez.";
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'Aucune caméra détectée sur cet appareil.';
        case 'NotReadableError':
        case 'TrackStartError':
            return 'La caméra est déjà utilisée par une autre application. Fermez-la et réessayez.';
        case 'OverconstrainedError':
            return "Cette caméra n'accepte pas les réglages demandés.";
        default:
            return error?.message
                ? `Caméra indisponible (${error.message}).`
                : 'Caméra indisponible sur cet appareil.';
    }
};

/**
 * Ouvre le flux caméra. À appeler DANS le gestionnaire de clic : plusieurs
 * navigateurs n'accordent la caméra que pendant un geste de l'utilisateur, et
 * un appel différé dans un effet se ferait refuser.
 *
 * Deux tentatives : les réglages souhaités (caméra arrière, haute définition),
 * puis, si l'appareil les rejette, la caméra telle qu'elle vient.
 */
export const openCameraStream = async (facingMode = 'environment') => {
    try {
        return await navigator.mediaDevices.getUserMedia(videoConstraints(facingMode));
    } catch (error) {
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
        return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
};

/** La caméra est-elle utilisable dans la page sur cet appareil ? */
export const isInPageCameraSupported = () =>
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
