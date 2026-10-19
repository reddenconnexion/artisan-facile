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
 * Sens dans lequel le téléphone est tenu, d'après la gravité mesurée par
 * l'accéléromètre (`devicemotion`, axes x/y de l'appareil) : 0 = debout,
 * 90 = couché sur le côté gauche (haut vers la gauche), 180 = tête en bas,
 * 270 = couché sur le côté droit — même convention que
 * `screen.orientation.angle`. Téléphone presque à plat, ou penché pile entre
 * deux positions : on garde la valeur précédente plutôt que de basculer au
 * hasard.
 */
export const deviceAngleFromGravity = (x, y, previous = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return previous;
    if (Math.hypot(x, y) < 4) return previous; // à plat : le sens n'est pas fiable
    const deg = (Math.atan2(x, y) * 180) / Math.PI;
    const angle = (deg + 360) % 360;
    const nearest = (Math.round(angle / 90) * 90) % 360;
    const gap = Math.abs(((angle - nearest + 540) % 360) - 180);
    return gap <= 30 ? nearest : previous;
};

/**
 * Rotation à appliquer à l'image capturée. L'aperçu vidéo suit l'écran ; si
 * l'écran ne pivote pas avec le téléphone (appli installée verrouillée en
 * portrait, rotation auto désactivée), une photo prise téléphone couché
 * sortirait de travers. On rattrape l'écart entre le sens du téléphone et
 * celui de l'écran — nul quand l'écran a bien suivi.
 */
export const captureRotation = (deviceAngle = 0, screenAngle = 0) =>
    ((((deviceAngle - screenAngle) % 360) + 360) % 360);

/** Angle actuel de l'écran (0 si le navigateur ne le donne pas). */
export const currentScreenAngle = () => {
    if (typeof window === 'undefined') return 0;
    const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    return ((Number(angle) % 360) + 360) % 360 || 0;
};

/**
 * Suit le sens dans lequel le téléphone est tenu. Sans accéléromètre (ou sur
 * iPhone, où il faut une autorisation — l'écran y pivote de toute façon),
 * `angle()` renvoie null : aucune correction n'est appliquée.
 * @returns {{ angle: () => (number|null), stop: () => void }}
 */
export const watchDeviceAngle = () => {
    let angle = null;
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
        return { angle: () => null, stop: () => {} };
    }
    const onMotion = (event) => {
        const g = event.accelerationIncludingGravity;
        if (!g || g.x == null || g.y == null) return;
        angle = deviceAngleFromGravity(g.x, g.y, angle ?? 0);
    };
    window.addEventListener('devicemotion', onMotion);
    return {
        angle: () => angle,
        stop: () => window.removeEventListener('devicemotion', onMotion),
    };
};

/**
 * Capture l'image affichée par un <video> et la rend en JPEG.
 * @param {HTMLVideoElement} video
 * @param {object} [options] - { maxDim = 2048, quality = 0.85, rotation = 0 }
 *   `rotation` (0/90/180/270) : quart(s) de tour dans le sens inverse des
 *   aiguilles d'une montre, pour redresser une photo prise téléphone couché.
 * @returns {Promise<Blob>}
 */
export const frameToJpegBlob = (video, { maxDim = 2048, quality = 0.85, rotation = 0 } = {}) =>
    new Promise((resolve, reject) => {
        const sourceW = video?.videoWidth;
        const sourceH = video?.videoHeight;
        if (!sourceW || !sourceH) return reject(new Error('Aperçu caméra non prêt'));

        const { width, height } = scaleToMax(sourceW, sourceH, maxDim);
        const quarter = rotation === 90 || rotation === 270;
        const canvas = document.createElement('canvas');
        canvas.width = quarter ? height : width;
        canvas.height = quarter ? width : height;
        const ctx = canvas.getContext('2d');
        if (rotation === 90) {
            ctx.translate(0, canvas.height);
            ctx.rotate(-Math.PI / 2);
        } else if (rotation === 180) {
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
        } else if (rotation === 270) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
        }
        ctx.drawImage(video, 0, 0, width, height);
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
