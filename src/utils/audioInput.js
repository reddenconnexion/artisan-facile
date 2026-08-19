// Choix du micro d'enregistrement.
//
// Par défaut le système décide : brancher un micro-cravate en USB-C ou en
// jack le rend en général prioritaire, et tout marche sans rien régler. Mais
// « en général » ne suffit pas pour une visite qu'on ne refera pas — d'où la
// possibilité de désigner explicitement l'entrée et de la retenir.
//
// Module pur : le stockage est injectable, donc testable.

export const AUDIO_INPUT_KEY = 'artisanfacile.visite.micro';

const defaultStorage = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null; // navigation privée, cookies bloqués
    }
};

/**
 * Contraintes audio pour getUserMedia. Sans appareil désigné, on laisse le
 * système choisir : c'est lui qui sait qu'un micro vient d'être branché.
 */
export const audioConstraints = (deviceId) => (
    deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true }
);

/** Nom lisible d'une entrée audio, y compris avant l'accord de permission. */
export const describeInput = (device, index = 0) => {
    const label = String(device?.label ?? '').trim();
    if (label) return label;
    if (device?.deviceId === 'default') return 'Micro par défaut';
    return `Micro ${index + 1}`;
};

/** Ne garde que les entrées audio, décrites et prêtes pour une liste. */
export const listAudioInputs = (devices = []) => devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: describeInput(d, i) }));

export const rememberAudioInput = (deviceId, { storage = defaultStorage() } = {}) => {
    if (!storage) return false;
    try {
        if (deviceId) storage.setItem(AUDIO_INPUT_KEY, deviceId);
        else storage.removeItem(AUDIO_INPUT_KEY);
        return true;
    } catch {
        return false;
    }
};

export const readAudioInput = ({ storage = defaultStorage() } = {}) => {
    if (!storage) return '';
    try {
        return storage.getItem(AUDIO_INPUT_KEY) || '';
    } catch {
        return '';
    }
};

/**
 * Niveau sonore d'une trame temporelle (RMS ramené entre 0 et 1), pour la
 * jauge qui prouve que le micro capte vraiment quelque chose.
 * @param {Uint8Array} timeDomainData - octets centrés sur 128
 */
export const levelFromTimeDomain = (timeDomainData) => {
    if (!timeDomainData?.length) return 0;
    let sum = 0;
    for (let i = 0; i < timeDomainData.length; i += 1) {
        const deviation = (timeDomainData[i] - 128) / 128;
        sum += deviation * deviation;
    }
    // Le RMS d'une parole normale tourne autour de 0,05-0,15 : on étale
    // cette plage sur toute la jauge pour qu'elle réagisse visiblement.
    return Math.min(1, Math.sqrt(sum / timeDomainData.length) * 4);
};
