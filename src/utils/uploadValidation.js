// ──────────────────────────────────────────────────────────────────────────────
// Validation stricte des uploads de fichiers
//
// Pourquoi : `file.type` (MIME annoncé par le navigateur) est facilement
// usurpable — un malware peut être renommé `photo.jpg`. La seule façon de
// vérifier le type RÉEL d'un fichier est de lire ses premiers octets ("magic
// bytes" / file signatures).
//
// Cette validation se fait CÔTÉ CLIENT avant l'upload — elle bloque les abus
// involontaires (mauvais format) et complique les attaques. Pour une sécurité
// totale, idéalement à doubler avec une vérification serveur (RLS policies
// Supabase Storage configurées sur le bucket pour limiter taille et type MIME).
//
// Usage typique :
//
//   import { validateFileForUpload, UPLOAD_PRESETS } from '@/utils/uploadValidation';
//   ...
//   const result = await validateFileForUpload(file, UPLOAD_PRESETS.image);
//   if (!result.ok) return toast.error(result.error);
//   // ... continuer avec l'upload Supabase
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Signatures binaires des formats autorisés (offset 0, sauf indication)
 * Référence : https://en.wikipedia.org/wiki/List_of_file_signatures
 */
const SIGNATURES = {
    'image/jpeg':       [[0xFF, 0xD8, 0xFF]],
    'image/jpg':        [[0xFF, 0xD8, 0xFF]],
    'image/png':        [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif':        [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    'image/webp':       [[0x52, 0x49, 0x46, 0x46]],   // RIFF (WEBP au offset 8 — voir vérif spéciale)
    'image/heic':       [[0x66, 0x74, 0x79, 0x70], [0x00, 0x00, 0x00]], // 'ftyp' au offset 4 — vérif spéciale
    'application/pdf':  [[0x25, 0x50, 0x44, 0x46]],   // %PDF
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]], // PK (zip)
    'application/zip':  [[0x50, 0x4B, 0x03, 0x04]],
};

/**
 * Presets prêts à l'emploi pour les cas d'usage courants de l'app
 */
export const UPLOAD_PRESETS = {
    /** Photos (logos, photos d'intervention, jalons, portfolio) — 8 MB max */
    image: {
        accept:       ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
        maxSizeBytes: 8 * 1024 * 1024,
        label:        'image',
    },
    /** Logo entreprise — plus restreint (carré, raisonnablement léger) */
    logo: {
        accept:       ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        maxSizeBytes: 3 * 1024 * 1024,
        label:        'logo',
    },
    /** PDF (devis, factures importés, plans) — 20 MB max */
    pdf: {
        accept:       ['application/pdf'],
        maxSizeBytes: 20 * 1024 * 1024,
        label:        'PDF',
    },
    /** Documents devis/facture import (PDF ou Word) */
    quoteDocument: {
        accept:       ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        maxSizeBytes: 20 * 1024 * 1024,
        label:        'document (PDF ou Word)',
    },
};

/**
 * Lit les N premiers octets du fichier de façon asynchrone
 */
async function readFirstBytes(file, count = 16) {
    const slice = file.slice(0, count);
    const buf   = await slice.arrayBuffer();
    return new Uint8Array(buf);
}

/**
 * Vérifie si un tableau d'octets matche au moins une des signatures attendues
 */
function matchesAnySignature(bytes, signatures) {
    return signatures.some(sig => sig.every((byte, i) => bytes[i] === byte));
}

/**
 * Vérification spéciale WEBP : "RIFF????WEBP" (offset 8 = "WEBP")
 */
function isWebp(bytes) {
    if (!matchesAnySignature(bytes, SIGNATURES['image/webp'])) return false;
    return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

/**
 * Vérification spéciale HEIC : "ftyp" au offset 4 + brand HEIC à offset 8
 */
function isHeic(bytes) {
    if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false;
    // Les brands HEIC commencent par "heic", "heix", "mif1", "msf1", "hevc"...
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return /^(heic|heix|mif1|msf1|hevc|heim|heis|hevm|hevs|avif)$/i.test(brand);
}

/**
 * Détecte le type RÉEL d'un fichier à partir de ses magic bytes
 * @returns {string|null} Type MIME détecté ou null si inconnu
 */
function detectActualType(bytes) {
    if (matchesAnySignature(bytes, SIGNATURES['image/png']))  return 'image/png';
    if (matchesAnySignature(bytes, SIGNATURES['image/jpeg'])) return 'image/jpeg';
    if (matchesAnySignature(bytes, SIGNATURES['image/gif']))  return 'image/gif';
    if (isWebp(bytes))                                        return 'image/webp';
    if (isHeic(bytes))                                        return 'image/heic';
    if (matchesAnySignature(bytes, SIGNATURES['application/pdf'])) return 'application/pdf';
    if (matchesAnySignature(bytes, SIGNATURES['application/zip'])) return 'application/zip';
    return null;
}

/**
 * Valide un fichier avant upload :
 *   1. Type MIME annoncé dans la liste autorisée
 *   2. Taille dans la limite
 *   3. Magic bytes correspondent au type annoncé (anti-spoofing)
 *
 * @param {File} file Fichier à valider
 * @param {object} options { accept: string[], maxSizeBytes: number, label?: string }
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function validateFileForUpload(file, options) {
    if (!file || typeof file.size !== 'number') {
        return { ok: false, error: 'Fichier invalide' };
    }

    const { accept = [], maxSizeBytes = 10 * 1024 * 1024, label = 'fichier' } = options || {};
    const declaredType = (file.type || '').toLowerCase();

    // 1. Type annoncé
    if (accept.length && !accept.includes(declaredType)) {
        return {
            ok: false,
            error: `Type de ${label} non autorisé. Acceptés : ${accept.map(t => t.split('/')[1]).join(', ')}.`,
        };
    }

    // 2. Taille
    if (file.size === 0) {
        return { ok: false, error: 'Fichier vide.' };
    }
    if (file.size > maxSizeBytes) {
        const mb = (maxSizeBytes / 1024 / 1024).toFixed(maxSizeBytes < 1024 * 1024 * 5 ? 1 : 0);
        const fileMb = (file.size / 1024 / 1024).toFixed(1);
        return { ok: false, error: `Fichier trop volumineux (${fileMb} MB) — maximum ${mb} MB.` };
    }

    // 3. Magic bytes
    let bytes;
    try {
        bytes = await readFirstBytes(file, 16);
    } catch {
        return { ok: false, error: 'Lecture du fichier impossible.' };
    }

    const actualType = detectActualType(bytes);

    // Si on n'a pas pu détecter (type peu courant), on accepte si le MIME annoncé est dans accept
    if (!actualType) {
        // Cas particulier : .docx = ZIP (PK header) — détecté comme 'application/zip'
        // mais accepté si le caller autorise le type docx
        if (declaredType.includes('officedocument.wordprocessingml')) {
            return { ok: true };
        }
        return {
            ok: false,
            error: `Le contenu du ${label} ne correspond à aucun format reconnu.`,
        };
    }

    // 4. Cohérence type annoncé vs type détecté
    // On normalise jpg/jpeg, et on tolère le fait que .docx soit du zip
    const normalizedDeclared = declaredType === 'image/jpg' ? 'image/jpeg' : declaredType;
    const normalizedActual   = actualType   === 'image/jpg' ? 'image/jpeg' : actualType;

    const isDocxZip = (
        normalizedDeclared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        && normalizedActual === 'application/zip'
    );

    if (normalizedActual !== normalizedDeclared && !isDocxZip) {
        return {
            ok: false,
            error: `Le contenu du fichier (${normalizedActual}) ne correspond pas au type annoncé (${normalizedDeclared}). Possible tentative d'usurpation.`,
        };
    }

    return { ok: true };
}

/**
 * Variante simplifiée : valide un FileList complet, retourne { valid: File[], errors: string[] }.
 * Utile pour les inputs multi-fichiers.
 */
export async function validateFiles(files, options) {
    const valid  = [];
    const errors = [];
    for (const file of files) {
        const result = await validateFileForUpload(file, options);
        if (result.ok) valid.push(file);
        else           errors.push(`${file.name} : ${result.error}`);
    }
    return { valid, errors };
}
