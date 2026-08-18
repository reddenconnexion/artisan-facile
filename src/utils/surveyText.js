// Trame de relevé de visite : état vide, détection de contenu et assemblage
// du texte structuré envoyé à l'IA (et persisté dans le rapport de visite).
// Module pur, sans dépendance React — la définition des trames par métier
// vit dans src/constants/surveyTemplates.js.

export const createEmptyZone = () => ({
    id: `z-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    counters: {}, // { [counterKey]: number }
    fields: {},   // { [fieldKey]: string }
});

export const createEmptySurvey = () => ({
    demande: '',   // ce que le client demande, dans ses mots
    contexte: {},  // { [groupKey]: { [fieldKey]: string | string[] } }
    zones: [],
    tableau: {
        etat: '',
        rangees: '',
        placesDispo: '',
        renovationComplete: false,
        diffTypeA: '',
        diffTypeAC: '',
        disjoncteurs: '',
        observations: '',
    },
    checklist: {}, // { [itemId]: 'verifie' | 'prevu' } — absent = non renseigné
    nonConformites: '',
    notesLibres: '',
});

/** Une pièce du relevé porte-t-elle une information saisie ? */
export const hasZoneContent = (zone) =>
    Boolean(zone.name?.trim()) ||
    Object.values(zone.counters || {}).some((n) => Number(n) > 0) ||
    Object.values(zone.fields || {}).some((v) => String(v ?? '').trim() !== '');

/** Le bloc « tableau électrique » porte-t-il une information saisie ? */
export const hasTableauContent = (tableau) => {
    if (!tableau) return false;
    if (tableau.renovationComplete) return true;
    return ['etat', 'rangees', 'placesDispo', 'diffTypeA', 'diffTypeAC', 'disjoncteurs', 'observations']
        .some((k) => String(tableau[k] ?? '').trim() !== '');
};

/** Rend la valeur d'un champ de contexte : '' si vide, liste jointe si multi. */
export const contexteValueText = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).join(' + ');
    return String(value ?? '').trim();
};

/** Lit un champ de contexte via sa clé plate `groupe.champ`. */
export const getContexteValue = (survey, path) => {
    const [groupKey, fieldKey] = String(path).split('.');
    return survey?.contexte?.[groupKey]?.[fieldKey];
};

const contexteHasContent = (contexte) =>
    Object.values(contexte || {}).some((group) =>
        Object.values(group || {}).some((v) => contexteValueText(v) !== '')
    );

export const hasSurveyContent = (survey) => {
    if (!survey) return false;
    return (
        String(survey.demande ?? '').trim() !== '' ||
        contexteHasContent(survey.contexte) ||
        (survey.zones || []).some(hasZoneContent) ||
        hasTableauContent(survey.tableau) ||
        Object.values(survey.checklist || {}).some(Boolean) ||
        String(survey.nonConformites ?? '').trim() !== '' ||
        String(survey.notesLibres ?? '').trim() !== ''
    );
};

/**
 * Totaux des compteurs, toutes zones confondues — la ligne que l'IA devis
 * (et le fournisseur) lit en premier. Les compteurs à zéro sont omis.
 * @returns {{key: string, label: string, total: number}[]}
 */
export const sumZoneCounters = (survey, template) => {
    const zones = (survey?.zones || []).filter(hasZoneContent);
    return (template?.zoneCounters || [])
        .map(({ key, label }) => ({
            key,
            label,
            total: zones.reduce((sum, z) => sum + (Number(z.counters?.[key]) || 0), 0),
        }))
        .filter(({ total }) => total > 0);
};

const zoneLine = (zone, index, template) => {
    const name = zone.name?.trim() || `Zone ${index + 1}`;
    const parts = [];

    const counted = (template.zoneCounters || [])
        .map(({ key, label }) => ({ label, n: Number(zone.counters?.[key]) || 0 }))
        .filter(({ n }) => n > 0)
        .map(({ label, n }) => `${label} : ${n}`);
    if (counted.length) parts.push(counted.join(' · '));

    for (const { key, label } of template.zoneExtraFields || []) {
        const value = String(zone.fields?.[key] ?? '').trim();
        if (value) parts.push(`${label} : ${value}`);
    }

    return `- ${name} : ${parts.join('. ')}`;
};

const contexteLines = (contexte, template) => {
    const lines = [];
    for (const group of template.contextGroups || []) {
        const values = (group.fields || [])
            .map((field) => ({ field, text: contexteValueText(contexte?.[group.key]?.[field.key]) }))
            .filter(({ text }) => text !== '')
            .map(({ field, text }) => `${field.label} : ${text}${field.unit ? ` ${field.unit}` : ''}`);
        if (values.length) lines.push(`- ${group.label} — ${values.join(' ; ')}`);
    }
    return lines;
};

const tableauLines = (tableau, template) => {
    const lines = [];
    const etatLabel = (template.tableauEtats || []).find((e) => e.value === tableau.etat)?.label;

    const line1 = [];
    if (etatLabel) line1.push(`État : ${etatLabel.toLowerCase()}`);
    if (String(tableau.rangees).trim()) line1.push(`Rangées existantes : ${tableau.rangees}`);
    if (String(tableau.placesDispo).trim()) line1.push(`Places disponibles : ${tableau.placesDispo}`);
    if (line1.length) lines.push(line1.join('. ') + '.');

    if (tableau.renovationComplete) {
        lines.push('Rénovation complète du tableau : OUI (prévoir parafoudre type 2 par défaut).');
    }

    const diffs = [];
    if (Number(tableau.diffTypeA) > 0) diffs.push(`${tableau.diffTypeA} type A 30 mA`);
    if (Number(tableau.diffTypeAC) > 0) diffs.push(`${tableau.diffTypeAC} type AC 30 mA`);
    const line3 = [];
    if (diffs.length) line3.push(`Différentiels à créer : ${diffs.join(', ')}`);
    if (String(tableau.disjoncteurs ?? '').trim()) line3.push(`Disjoncteurs : ${tableau.disjoncteurs.trim()}`);
    if (line3.length) lines.push(line3.join('. ') + '.');

    if (String(tableau.observations ?? '').trim()) lines.push(`Observations : ${tableau.observations.trim()}`);
    return lines;
};

/**
 * Découpe l'état de la trame en sections structurées `{ title, lines }`,
 * dans l'ordre de lecture d'un devis. Les sections et zones vides sont
 * omises. Base commune du texte envoyé à l'IA (`buildSurveyText`) et du
 * compte rendu de visite (`buildPredevisReport`).
 *
 * `withZoneTotals: false` retire la ligne « TOTAL toutes zones » : le compte
 * rendu lui consacre déjà une section dédiée.
 */
export const buildSurveySections = (survey, template, { withZoneTotals = true } = {}) => {
    if (!survey || !template || !hasSurveyContent(survey)) return [];
    const sections = [];

    const demande = String(survey.demande ?? '').trim();
    if (demande) sections.push({ title: 'DEMANDE DU CLIENT', lines: [demande] });

    const ctx = contexteLines(survey.contexte, template);
    if (ctx.length) sections.push({ title: 'CONTEXTE DU CHANTIER', lines: ctx });

    const zones = (survey.zones || []).filter(hasZoneContent);
    if (zones.length) {
        const lines = zones.map((z) => zoneLine(z, survey.zones.indexOf(z), template));
        const totals = sumZoneCounters(survey, template);
        if (withZoneTotals && zones.length > 1 && totals.length) {
            lines.push(`TOTAL toutes zones : ${totals.map(({ label, total }) => `${label} : ${total}`).join(' · ')}`);
        }
        sections.push({ title: 'RELEVÉ PAR ZONE', lines });
    }

    if (template.hasTableau && hasTableauContent(survey.tableau)) {
        sections.push({ title: 'TABLEAU ÉLECTRIQUE', lines: tableauLines(survey.tableau, template) });
    }

    const verified = [];
    const planned = [];
    for (const item of template.checklist || []) {
        const state = survey.checklist?.[item.id];
        if (state === 'verifie') verified.push(item.label);
        else if (state === 'prevu') planned.push(item.label);
    }
    const nonConformites = String(survey.nonConformites ?? '').trim();
    if (verified.length || planned.length || nonConformites) {
        const lines = [];
        if (verified.length) lines.push(`Vérifié : ${verified.join(' ; ')}.`);
        if (planned.length) lines.push(`À prévoir : ${planned.join(' ; ')}.`);
        if (nonConformites) lines.push(`Non-conformités relevées : ${nonConformites}`);
        const title = (template.checklist || []).length ? 'CONFORMITÉ (NF C 15-100)' : 'CONFORMITÉ';
        sections.push({ title, lines });
    }

    const notes = String(survey.notesLibres ?? '').trim();
    if (notes) sections.push({ title: 'NOTES', lines: [notes] });

    return sections;
};

/**
 * Assemble l'état de la trame en texte structuré français, prêt à rejoindre
 * le message IA et la description du rapport de visite. Les sections et
 * zones vides sont omises ; retourne '' si la trame est entièrement vide.
 */
export const buildSurveyText = (survey, template) =>
    buildSurveySections(survey, template)
        .map(({ title, lines }) => `${title} :\n${lines.join('\n')}`)
        .join('\n\n');

// Consigne système accompagnant le relevé structuré (remonte au prompt
// serveur via `extras` — voir generateQuoteFromSiteVisit).
export const SURVEY_AI_INSTRUCTION =
    'CONSIGNE RELEVÉ STRUCTURÉ : le RELEVÉ STRUCTURÉ est la source prioritaire pour les quantités '
    + '(prises, interrupteurs, points lumineux, spots, circuits dédiés) : crée les lignes du devis à partir '
    + 'de ces comptages, zone par zone. Chaque non-conformité listée dans la section CONFORMITÉ doit '
    + 'figurer par écrit dans le devis : soit comme ligne de mise en conformité chiffrée, soit comme '
    + 'mention explicite dans suggestions. Les points cochés « À prévoir » deviennent des lignes de devis.';
