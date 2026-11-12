// Attestation d'assurance décennale : déposée par l'artisan dans ses réglages,
// consultable et téléchargeable par le client dans son espace (/p/:token).

export const ATTESTATION_BUCKET = 'quote_files';

// En dessous de ce nombre de jours avant l'échéance, on rappelle à l'artisan
// de déposer l'attestation de l'année suivante.
const RENEWAL_WARNING_DAYS = 30;

const toIsoDay = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/**
 * Chemin de stockage d'une nouvelle attestation. Le suffixe aléatoire rend
 * l'URL publique impossible à deviner et évite le cache navigateur de
 * l'ancienne version quand l'artisan la remplace.
 */
export function buildAttestationPath(userId) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `attestations/${userId}/attestation-decennale-${hex}.pdf`;
}

/**
 * Chemin dans le bucket à partir de l'URL publique enregistrée sur le profil
 * (pour supprimer le fichier). null si l'URL ne vient pas de ce bucket.
 */
export function attestationStoragePath(url) {
    if (!url) return null;
    const marker = `/${ATTESTATION_BUCKET}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    const path = url.slice(index + marker.length).split('?')[0];
    return path ? decodeURIComponent(path) : null;
}

/** Nom du fichier proposé au client : « Attestation-decennale-Red-Den-Connexion.pdf ». */
export function attestationFileName(companyName) {
    const slug = String(companyName || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `Attestation-decennale-${slug}.pdf` : 'Attestation-decennale.pdf';
}

/**
 * URL qui force le téléchargement : le stockage Supabase renvoie le fichier en
 * pièce jointe sous le nom donné quand l'URL publique porte `?download=`.
 * (L'attribut HTML `download` est ignoré pour un fichier d'un autre domaine.)
 */
export function attestationDownloadUrl(url, companyName) {
    if (!url) return null;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}download=${encodeURIComponent(attestationFileName(companyName))}`;
}

/**
 * État de validité d'une attestation à partir de sa date de fin (AAAA-MM-JJ).
 * Le dernier jour de validité compte comme valide.
 * @returns {{ status: 'unknown' | 'valid' | 'expiring' | 'expired', daysLeft: number | null }}
 */
export function attestationValidity(validUntil, today = new Date()) {
    const day = typeof validUntil === 'string' ? validUntil.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { status: 'unknown', daysLeft: null };

    const end = Date.parse(`${day}T00:00:00Z`);
    const now = Date.parse(`${toIsoDay(today)}T00:00:00Z`);
    if (Number.isNaN(end)) return { status: 'unknown', daysLeft: null };

    const daysLeft = Math.round((end - now) / 86_400_000);
    if (daysLeft < 0) return { status: 'expired', daysLeft };
    if (daysLeft <= RENEWAL_WARNING_DAYS) return { status: 'expiring', daysLeft };
    return { status: 'valid', daysLeft };
}
