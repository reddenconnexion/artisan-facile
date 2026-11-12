// Points de passage d'une visite : la grille de l'écran de visite et le
// contrôle « Avant de partir ». Une visite suit le client, pas un formulaire :
// les postes (demande, tableau, comptage, passage des câbles, accès) se font
// dans n'importe quel ordre, et c'est cette grille qui dit ce qui reste à voir.
//
// Module pur : la définition des postes vit dans constants/surveyTemplates.js.

import { contexteValueText, hasZoneContent } from './surveyText';
import { findMissingEssentials } from './predevisReport';

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Le poste dont `zoneName` est le nom, ou null (une pièce n'est pas un poste). */
export const stopForZone = (template, zoneName) =>
    (template?.stops || []).find((stop) => sameName(stop.label, zoneName)) || null;

/** Autres façons d'annoncer un poste à voix haute : { [poste]: string[] }. */
export const stopSpokenAliases = (template) => Object.fromEntries(
    (template?.stops || []).filter((s) => s.spoken?.length).map((s) => [s.label, s.spoken])
);

/**
 * Description d'une réponse en un tap, lue dans la trame du métier.
 * Clés supportées : 'tableau.etat' et 'contexte.<groupe>.<champ>' (champ à pastilles).
 * @returns {{key: string, label: string, multi: boolean, options: {value: string, label: string}[]} | null}
 */
export const quickFieldSpec = (template, key) => {
    if (key === 'tableau.etat') {
        const options = (template?.tableauEtats || []).map(({ value, label }) => ({ value, label }));
        return options.length ? { key, label: 'État du tableau', multi: false, options } : null;
    }
    const [scope, groupKey, fieldKey] = String(key).split('.');
    if (scope !== 'contexte') return null;
    const field = (template?.contextGroups || [])
        .find((g) => g.key === groupKey)?.fields
        .find((f) => f.key === fieldKey);
    if (!field || field.type !== 'chips') return null;
    return {
        key,
        label: field.label,
        multi: Boolean(field.multi),
        options: field.options.map((option) => ({ value: option, label: option })),
    };
};

/** Valeur actuelle d'une réponse en un tap : chaîne, ou tableau si choix multiple. */
export const getQuickValue = (survey, key) => {
    if (key === 'tableau.etat') return survey?.tableau?.etat || '';
    const [, groupKey, fieldKey] = String(key).split('.');
    return survey?.contexte?.[groupKey]?.[fieldKey] ?? '';
};

export const isQuickAnswered = (survey, key) => contexteValueText(getQuickValue(survey, key)) !== '';

/**
 * Un tap sur une pastille : choix simple (re-tap = on efface) ou multiple.
 * Rend un nouveau relevé, l'ancien n'est pas modifié.
 */
export const toggleQuickValue = (survey, spec, optionValue) => {
    const current = getQuickValue(survey, spec.key);
    let next;
    if (spec.multi) {
        const list = Array.isArray(current) ? current : [];
        next = list.includes(optionValue) ? list.filter((v) => v !== optionValue) : [...list, optionValue];
    } else {
        next = current === optionValue ? '' : optionValue;
    }
    if (spec.key === 'tableau.etat') return { ...survey, tableau: { ...survey.tableau, etat: next } };
    const [, groupKey, fieldKey] = spec.key.split('.');
    return {
        ...survey,
        contexte: {
            ...survey.contexte,
            [groupKey]: { ...survey.contexte?.[groupKey], [fieldKey]: next },
        },
    };
};

// Clé d'un point essentiel de la trame → réponse en un tap qui le renseigne.
const quickKeyForEssential = (key) => (key === 'tableau' ? 'tableau.etat' : key);

const entriesIn = (capture, zoneName) => (capture?.entries || [])
    .filter((e) => e.type !== 'zone' && sameName(e.zone, zoneName));

/**
 * Où en est un poste :
 * - 'todo'    : pas encore vu ;
 * - 'partial' : vu, mais une réponse essentielle au chiffrage manque ;
 * - 'done'    : vu.
 * « Vu » = au moins une dictée, une photo, un point à voir ou une réponse.
 * @returns {{state: 'todo'|'partial'|'done', voices: number, photos: number, missing: string[]}}
 */
export const stopStatus = ({ stop, template, survey, capture }) => {
    const entries = entriesIn(capture, stop.label);
    const voices = entries.filter((e) => e.type === 'voice').length;
    const photos = entries.filter((e) => e.type === 'photo').length;
    const quick = stop.quick || [];
    const essentialKeys = new Set((template?.essentials || []).map((e) => quickKeyForEssential(e.key)));
    const missing = quick.filter((key) => essentialKeys.has(key) && !isQuickAnswered(survey, key));
    const seen = entries.length > 0 || quick.some((key) => isQuickAnswered(survey, key));
    return { state: !seen ? 'todo' : missing.length ? 'partial' : 'done', voices, photos, missing };
};

/**
 * Ce qui manque avant de quitter le chantier.
 *
 * Part des points essentiels de la trame, vus du terrain : une demande dictée
 * compte comme renseignée (elle sera reprise à la mise au propre), une pièce
 * simplement dictée ou photographiée compte comme relevée.
 *
 * - `unseenStops` : postes pas encore vus ;
 * - `missing`     : points essentiels manquants, chacun avec la façon d'y
 *   répondre — `spec` (pastilles), `kind: 'text'` (à taper ou à dicter),
 *   `kind: 'dictate'` (à dicter dans le poste `stop`), ou `kind: 'info'`.
 *
 * @returns {{total: number, done: number, missing: object[], unseenStops: object[]}}
 */
export const departureChecklist = ({ template, survey, capture }) => {
    const stops = template?.stops || [];
    const essentials = template?.essentials || [];
    const dictated = (zoneName) => entriesIn(capture, zoneName).some((e) => e.type === 'voice');
    const isStop = (zoneName) => stops.some((s) => sameName(s.label, zoneName))
        || (template?.dictationTopics || []).some((t) => sameName(t, zoneName));
    const roomSeen = (survey?.zones || []).some(hasZoneContent)
        || (capture?.entries || []).some((e) => e.type !== 'zone' && String(e.zone ?? '').trim() && !isStop(e.zone));
    const demandeStop = stops.find((s) => s.key === 'demande');

    const missing = [];
    for (const { key, label } of findMissingEssentials(survey, template)) {
        if (key === 'demande') {
            if ((demandeStop && dictated(demandeStop.label)) || dictated('Général')) continue;
            missing.push({ key, label, kind: 'dictate', stop: demandeStop?.label || 'Général' });
        } else if (key === 'zones') {
            if (!roomSeen) missing.push({ key, label, kind: 'info' });
        } else {
            const spec = quickFieldSpec(template, quickKeyForEssential(key));
            missing.push(spec ? { key, label, kind: 'quick', spec } : { key, label, kind: 'text' });
        }
    }

    const unseenStops = stops.filter((stop) => stopStatus({ stop, template, survey, capture }).state === 'todo');
    return { total: essentials.length, done: essentials.length - missing.length, missing, unseenStops };
};

/** Écrit un champ texte de contexte (« Délai souhaité »…) via sa clé essentielle. */
export const setContexteText = (survey, key, value) => {
    const [scope, groupKey, fieldKey] = String(key).split('.');
    if (scope !== 'contexte' || !groupKey || !fieldKey) return survey;
    return {
        ...survey,
        contexte: {
            ...survey.contexte,
            [groupKey]: { ...survey.contexte?.[groupKey], [fieldKey]: value },
        },
    };
};
