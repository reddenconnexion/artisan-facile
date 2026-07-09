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

const zoneHasContent = (zone) =>
    Boolean(zone.name?.trim()) ||
    Object.values(zone.counters || {}).some((n) => Number(n) > 0) ||
    Object.values(zone.fields || {}).some((v) => String(v ?? '').trim() !== '');

const tableauHasContent = (tableau) => {
    if (!tableau) return false;
    if (tableau.renovationComplete) return true;
    return ['etat', 'rangees', 'placesDispo', 'diffTypeA', 'diffTypeAC', 'disjoncteurs', 'observations']
        .some((k) => String(tableau[k] ?? '').trim() !== '');
};

export const hasSurveyContent = (survey) => {
    if (!survey) return false;
    return (
        (survey.zones || []).some(zoneHasContent) ||
        tableauHasContent(survey.tableau) ||
        Object.values(survey.checklist || {}).some(Boolean) ||
        String(survey.nonConformites ?? '').trim() !== '' ||
        String(survey.notesLibres ?? '').trim() !== ''
    );
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
 * Assemble l'état de la trame en texte structuré français, prêt à rejoindre
 * le message IA et la description du rapport de visite. Les sections et
 * zones vides sont omises ; retourne '' si la trame est entièrement vide.
 */
export const buildSurveyText = (survey, template) => {
    if (!survey || !template || !hasSurveyContent(survey)) return '';
    const sections = [];

    const zones = (survey.zones || []).filter(zoneHasContent);
    if (zones.length) {
        sections.push('RELEVÉ PAR ZONE :\n' + zones.map((z) => zoneLine(z, survey.zones.indexOf(z), template)).join('\n'));
    }

    if (template.hasTableau && tableauHasContent(survey.tableau)) {
        sections.push('TABLEAU ÉLECTRIQUE :\n' + tableauLines(survey.tableau, template).join('\n'));
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
        const title = (template.checklist || []).length ? 'CONFORMITÉ (NF C 15-100) :' : 'CONFORMITÉ :';
        sections.push(title + '\n' + lines.join('\n'));
    }

    const notes = String(survey.notesLibres ?? '').trim();
    if (notes) sections.push('NOTES :\n' + notes);

    return sections.join('\n\n');
};

// Consigne système accompagnant le relevé structuré (remonte au prompt
// serveur via `extras` — voir generateQuoteFromSiteVisit).
export const SURVEY_AI_INSTRUCTION =
    'CONSIGNE RELEVÉ STRUCTURÉ : le RELEVÉ STRUCTURÉ est la source prioritaire pour les quantités '
    + '(prises, interrupteurs, points lumineux, spots, circuits dédiés) : crée les lignes du devis à partir '
    + 'de ces comptages, zone par zone. Chaque non-conformité listée dans la section CONFORMITÉ doit '
    + 'figurer par écrit dans le devis : soit comme ligne de mise en conformité chiffrée, soit comme '
    + 'mention explicite dans suggestions. Les points cochés « À prévoir » deviennent des lignes de devis.';
