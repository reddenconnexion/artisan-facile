// Capture éclair d'une visite : le fil chronologique de ce qui s'est passé
// pendant le tour du propriétaire. Sur chantier, le client parle en marchant —
// on ne remplit pas un formulaire, on tape sur des gros boutons et on dicte.
// Le comptage part directement dans la trame (source des quantités) ; ce fil
// garde l'ordre, l'heure, la pièce, les notes vocales et les points signalés,
// et devient la section « Déroulé de la visite » du compte rendu.
//
// Module pur : l'horloge est toujours passée en paramètre (`at`), donc testable.

import { createEmptyZone } from './surveyText';

export const createCapture = () => ({
    zone: '',      // pièce courante — tout ce qu'on tape lui est rattaché
    entries: [],   // fil chronologique, du plus ancien au plus récent
});

// Insertion chronologique : un segment audio remonte à la fermeture du
// micro mais porte l'heure de son ouverture, donc il doit se replacer avant
// les taps qui l'ont suivi.
const withEntry = (capture, entry) => {
    const entries = capture.entries || [];
    const full = { id: `${entry.type}-${entry.at}-${entries.length}`, ...entry };
    let at = entries.length;
    while (at > 0 && entries[at - 1].at > full.at) at -= 1;
    return { ...capture, entries: [...entries.slice(0, at), full, ...entries.slice(at)] };
};

/** Bascule de pièce : tout ce qui suit est rattaché à `zoneName`. */
export const addZoneChange = (capture, zoneName, at) => ({
    ...withEntry(capture, { type: 'zone', at, zone: zoneName }),
    zone: zoneName,
});

/** Un tap sur un compteur (+1 prise, +1 interrupteur…). */
export const addCount = (capture, { counterKey, delta = 1, at }) =>
    withEntry(capture, { type: 'count', at, zone: capture.zone, counterKey, delta });

/**
 * Un segment audio. `zone` est celle où le micro s'est ouvert : un segment
 * remonte à sa fermeture, souvent après avoir changé de pièce, il ne faut
 * donc pas le rattacher à la pièce courante.
 */
export const addVoice = (capture, { mediaId, duration, at, zone = capture.zone }) =>
    withEntry(capture, { type: 'voice', at, zone, mediaId, duration });

/** Une ou plusieurs photos prises à la volée. */
export const addPhoto = (capture, { mediaId, at }) =>
    withEntry(capture, { type: 'photo', at, zone: capture.zone, mediaId });

/** Un point à ne pas oublier — marqué en un tap, détaillé plus tard. */
export const addFlag = (capture, { at, label = '' }) =>
    withEntry(capture, { type: 'flag', at, zone: capture.zone, label });

/**
 * Annule la dernière action. Retourne le fil sans elle et l'entrée retirée,
 * pour que l'appelant en défasse l'effet (un comptage se décrémente, une
 * photo se supprime…). La pièce courante revient à celle d'avant si on
 * annule un changement de pièce.
 */
export const undoLast = (capture) => {
    const entries = capture.entries || [];
    if (!entries.length) return { capture, undone: null };
    const undone = entries[entries.length - 1];
    const remaining = entries.slice(0, -1);
    const zone = undone.type === 'zone'
        ? [...remaining].reverse().find((e) => e.type === 'zone')?.zone || ''
        : capture.zone;
    return { capture: { ...capture, zone, entries: remaining }, undone };
};

export const hasCaptureContent = (capture) => (capture?.entries || []).length > 0;

// ── Trame : le comptage tapé alimente directement les pièces du relevé ─────

const sameZoneName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/** Ajoute la pièce à la trame si elle n'y est pas encore. */
export const ensureSurveyZone = (survey, zoneName) => {
    const name = (zoneName || '').trim();
    if (!name || (survey.zones || []).some((z) => sameZoneName(z.name, name))) return survey;
    return { ...survey, zones: [...(survey.zones || []), { ...createEmptyZone(), name }] };
};

/**
 * Incrémente (ou décrémente) un compteur de la pièce dans la trame. La pièce
 * est créée au besoin ; un compteur ne descend jamais sous zéro.
 */
export const bumpSurveyCounter = (survey, zoneName, counterKey, delta) => {
    const withZone = ensureSurveyZone(survey, zoneName);
    return {
        ...withZone,
        zones: withZone.zones.map((z) => (sameZoneName(z.name, zoneName)
            ? { ...z, counters: { ...z.counters, [counterKey]: Math.max(0, (Number(z.counters?.[counterKey]) || 0) + delta) } }
            : z)),
    };
};

/** Compteurs de la pièce en cours, pour l'affichage temps réel. */
export const zoneCounters = (survey, zoneName) =>
    (survey?.zones || []).find((z) => sameZoneName(z.name, zoneName))?.counters || {};

// ── Déroulé de la visite ──────────────────────────────────────────────────

const formatClock = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const counterLabel = (template, counterKey) =>
    (template?.zoneCounters || []).find((c) => c.key === counterKey)?.label || counterKey;

/**
 * Regroupe le fil par passage dans une pièce : un segment par bascule de
 * pièce, les entrées dans l'ordre.
 * @returns {{zone: string, at: number, entries: object[]}[]}
 */
export const captureSegments = (capture) => {
    const segments = [];
    for (const entry of capture?.entries || []) {
        const last = segments[segments.length - 1];
        if (!last || last.zone !== entry.zone) {
            segments.push({ zone: entry.zone, at: entry.at, entries: entry.type === 'zone' ? [] : [entry] });
        } else if (entry.type !== 'zone') {
            last.entries.push(entry);
        }
    }
    return segments.filter((s) => s.entries.length > 0);
};

/**
 * Rend le fil en lignes de texte pour le compte rendu : heure, pièce, notes
 * vocales (transcrites si disponibles), points signalés, photos, et le
 * comptage cumulé du passage.
 *
 * @param {object} capture
 * @param {object} options
 * @param {object} options.template     - trame métier (libellés des compteurs)
 * @param {object} [options.transcripts] - { [mediaId]: texte transcrit } ; une
 *   clé présente avec un texte vide signifie « transcrite, rien d'audible »
 */
export const buildTimelineLines = (capture, { template, transcripts = {} } = {}) => {
    const lines = [];
    for (const segment of captureSegments(capture)) {
        lines.push(`${formatClock(segment.at)} · ${segment.zone?.trim() || 'Pièce non précisée'}`);

        const counts = {};
        let photos = 0;
        for (const entry of segment.entries) {
            if (entry.type === 'count') {
                counts[entry.counterKey] = (counts[entry.counterKey] || 0) + entry.delta;
            } else if (entry.type === 'photo') {
                photos += 1;
            } else if (entry.type === 'voice') {
                const text = String(transcripts[entry.mediaId] ?? '').trim();
                const seconds = Math.round(entry.duration || 0);
                if (text) lines.push(`- Note vocale : « ${text} »`);
                // Transcrite mais muette (personne ne parlait) : ce n'est pas
                // la même chose qu'une note qui reste à transcrire.
                else if (Object.prototype.hasOwnProperty.call(transcripts, entry.mediaId)) lines.push(`- Note vocale (${seconds} s, rien d'audible)`);
                else lines.push(`- Note vocale (${seconds} s, non transcrite)`);
            } else if (entry.type === 'flag') {
                lines.push(`- POINT SIGNALÉ${entry.label ? ` : ${entry.label}` : ' — à traiter au chiffrage'}`);
            }
        }

        const counted = Object.entries(counts)
            .filter(([, n]) => n !== 0)
            .map(([key, n]) => `${counterLabel(template, key)} ${n > 0 ? '+' : ''}${n}`);
        if (counted.length) lines.push(`- Comptage : ${counted.join(' · ')}`);
        if (photos) lines.push(`- ${photos} photo${photos > 1 ? 's' : ''}`);
    }
    return lines;
};

/** Pièce dans laquelle chaque photo a été prise : { [mediaId]: pièce }. */
export const photoZones = (capture) => Object.fromEntries(
    (capture?.entries || [])
        .filter((e) => e.type === 'photo' && e.mediaId)
        .map((e) => [e.mediaId, e.zone || ''])
);

/** Les points signalés en un tap pendant la visite. */
export const captureFlags = (capture) => (capture?.entries || []).filter((e) => e.type === 'flag');
