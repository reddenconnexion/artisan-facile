// Matière première de la visite pour l'IA : notes vocales et constats photo
// rattachés à leur pièce, et lien vers le projet Claude où l'artisan fait
// ses devis. Module pur, testable sans React ni réseau.

/**
 * Notes vocales transcrites, dans l'ordre de la visite, avec la pièce où le
 * micro s'est ouvert. Les notes sans texte (pas encore transcrites, ou
 * muettes) sont omises.
 * @param {{id: string, zone?: string}[]} voiceNotes
 * @param {Record<string, string>} transcripts - { [idNote]: texte }
 * @returns {{zone: string, text: string}[]}
 */
export const zonedTranscripts = (voiceNotes = [], transcripts = {}) => (voiceNotes || [])
    .map((n) => ({ zone: n?.zone || '', text: String(transcripts?.[n?.id] ?? '').trim() }))
    .filter((n) => n.text);

/**
 * Constats lus sur les photos, dans l'ordre des photos, avec leur pièce.
 * @param {{id: string}[]} photos
 * @param {Record<string, string>} notesById - { [idPhoto]: constat }
 * @param {Record<string, string>} [zonesById] - { [idPhoto]: pièce }
 * @returns {{zone: string, text: string}[]}
 */
export const photoFindings = (photos = [], notesById = {}, zonesById = {}) => (photos || [])
    .map((p) => ({ zone: zonesById?.[p?.id] || '', text: String(notesById?.[p?.id] ?? '').trim() }))
    .filter((p) => p.text);

/** « [Cuisine] texte » — forme texte d'une note rattachée à sa pièce. */
export const zonedLine = ({ zone, text }) => `${zone ? `[${zone}] ` : ''}${text}`;

/** Ne garde que les constats des photos encore présentes dans la visite. */
export const keepPhotoNotes = (notesById = {}, photos = []) => {
    const ids = new Set((photos || []).map((p) => p?.id).filter(Boolean));
    return Object.fromEntries(Object.entries(notesById || {}).filter(([id]) => ids.has(id)));
};

/** Lien d'un projet (ou d'une conversation) claude.ai. */
export const isClaudeProjectUrl = (value) => {
    try {
        const url = new URL(String(value ?? '').trim());
        return url.protocol === 'https:' && (url.hostname === 'claude.ai' || url.hostname.endsWith('.claude.ai'));
    } catch {
        return false;
    }
};
