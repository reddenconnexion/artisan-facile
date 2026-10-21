// Matière première de la visite pour l'IA : notes vocales et constats photo
// rattachés à leur pièce, et lien vers le projet Claude où l'artisan fait
// ses devis. Module pur, testable sans React ni réseau.

/**
 * Notes vocales transcrites, dans l'ordre de la visite, avec la pièce où le
 * micro s'est ouvert. Les notes sans texte (pas encore transcrites, ou
 * muettes) sont omises. Une dictée (l'artisan décrit lui-même une pièce)
 * garde `kind: 'dictation'` : elle fait foi face à la conversation.
 * @param {{id: string, zone?: string, kind?: string}[]} voiceNotes
 * @param {Record<string, string>} transcripts - { [idNote]: texte }
 * @returns {{zone: string, text: string, kind?: 'dictation'}[]}
 */
export const zonedTranscripts = (voiceNotes = [], transcripts = {}) => (voiceNotes || [])
    .map((n) => ({
        zone: n?.zone || '',
        text: String(transcripts?.[n?.id] ?? '').trim(),
        ...(n?.kind === 'dictation' ? { kind: 'dictation' } : {}),
    }))
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

/**
 * Notes vocales sans transcription (échec, ou encore en cours), avec leur
 * durée et leur pièce : leur contenu manque à tout ce que l'IA lit ensuite.
 * @param {{id: string, zone?: string, duration?: number}[]} voiceNotes
 * @param {Record<string, string>} transcripts - { [idNote]: texte } ; une clé
 *   présente, même vide, vaut « transcrite »
 * @returns {{zone: string, seconds: number}[]}
 */
export const untranscribedNotes = (voiceNotes = [], transcripts = {}) => (voiceNotes || [])
    .filter((n) => n?.id && !Object.prototype.hasOwnProperty.call(transcripts || {}, n.id))
    .map((n) => ({ zone: n.zone || '', seconds: Math.round(Number(n.duration) || 0) }));

/**
 * Enregistrements dont le contenu manque au résumé : sans cette ligne, l'IA
 * concluait « Aucun point à confirmer » sur une visite amputée de 8 minutes.
 * @param {{zone?: string, seconds?: number}[]} notes
 * @returns {string}
 */
export const untranscribedLine = (notes = []) => {
    const list = (Array.isArray(notes) ? notes : []).filter(Boolean);
    if (!list.length) return '';
    const details = list.map((n) => {
        const seconds = Math.round(Number(n.seconds) || 0);
        const length = seconds >= 60 ? `${Math.round(seconds / 60)} min` : seconds ? `${seconds} s` : '';
        return [length, n.zone].filter(Boolean).join(', ');
    }).filter(Boolean);
    return `ENREGISTREMENTS NON TRANSCRITS (contenu absent de ce résumé, à réécouter) : ${list.length}`
        + (details.length ? ` — ${details.join(' ; ')}` : '');
};

/** « [Cuisine] texte » — forme texte d'une note rattachée à sa pièce (« Dictée : » pour une dictée). */
export const zonedLine = ({ zone, text, kind }) => `${zone ? `[${zone}] ` : ''}${kind === 'dictation' ? 'Dictée : ' : ''}${text}`;

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
