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

// ── Pré-remplissage de la trame par l'IA (aiService.extractSurveyFromVisit) ─
//
// L'IA lit la conversation de la visite (souvent décousue) et les photos, et
// propose un relevé structuré. Avant de le mélanger à ce que l'artisan a déjà
// saisi, chaque valeur est validée contre la trame du métier (types, options
// de chips, identifiants de compteurs/checklist) : une réponse mal formée ou
// hors schéma est silencieusement ignorée plutôt que de corrompre l'état.

// La réponse de l'IA ne reprend pas toujours les libellés au caractère
// près (« maison », « linky », « À prévoir »…) : une valeur juste mais mal
// orthographiée était jetée et le champ restait vide. On compare donc sans
// accents, casse ni ponctuation, et on accepte un libellé abrégé.
export const normalizeLabel = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const matchOption = (raw, options) => {
    if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
    const wanted = normalizeLabel(raw);
    if (!wanted) return undefined;
    const exact = options.find((o) => normalizeLabel(o) === wanted);
    if (exact) return exact;
    // « A prevoir » → « À prévoir (à ma charge) » ; « Linky (compteur) » → « Linky ».
    const partial = options.filter((o) => {
        const opt = normalizeLabel(o);
        return opt.startsWith(`${wanted} `) || wanted.startsWith(`${opt} `);
    });
    return partial.length === 1 ? partial[0] : undefined;
};

const sanitizeChipsValue = (raw, field) => {
    const options = field.options || [];
    const list = Array.isArray(raw) ? raw : [raw];
    const matched = [...new Set(list.map((v) => matchOption(v, options)).filter(Boolean))];
    if (field.multi) return matched.length ? matched : undefined;
    return matched[0];
};

/** « 45 m² », « 45,5 », 45 → nombre ; sinon undefined. */
export const parseLooseNumber = (raw) => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (typeof raw !== 'string') return undefined;
    const m = raw.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0].replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
};

/** Texte court : chaîne, nombre ou liste de chaînes ; undefined si vide. */
const looseText = (raw) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (Array.isArray(raw)) {
        const joined = raw.filter((v) => typeof v === 'string' || typeof v === 'number').map(String)
            .map((v) => v.trim()).filter(Boolean).join(', ');
        return joined || undefined;
    }
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
};

const sanitizeContexte = (rawContexte, template, rawRoot = {}) => {
    const out = {};
    const flat = rawContexte && typeof rawContexte === 'object' ? rawContexte : {};
    for (const group of template.contextGroups || []) {
        // Groupe attendu sous « contexte » ; repli sur la racine de la réponse,
        // là où l'ancien schéma du prompt le plaçait.
        const isGroup = (g) => g && typeof g === 'object' && !Array.isArray(g);
        const rawGroup = isGroup(flat[group.key]) ? flat[group.key]
            : isGroup(rawRoot?.[group.key]) ? rawRoot[group.key]
            : {};
        const groupOut = {};
        for (const field of group.fields || []) {
            // Le modèle oublie parfois le niveau du groupe : on accepte le
            // champ posé directement dans « contexte », voire à la racine.
            let raw = rawGroup[field.key];
            if (raw === undefined && flat[field.key] !== undefined && typeof flat[field.key] !== 'object') raw = flat[field.key];
            if (raw === undefined && Array.isArray(flat[field.key])) raw = flat[field.key];
            if (raw === undefined && rawRoot && rawRoot[field.key] !== undefined) raw = rawRoot[field.key];
            let value;
            if (field.type === 'chips') value = sanitizeChipsValue(raw, field);
            else if (field.type === 'number') value = parseLooseNumber(raw);
            else value = looseText(raw);
            if (value !== undefined) groupOut[field.key] = value;
        }
        if (Object.keys(groupOut).length) out[group.key] = groupOut;
    }
    return out;
};

const sanitizeZones = (rawZones, template) => {
    if (!Array.isArray(rawZones)) return [];
    const counterKeys = new Set((template.zoneCounters || []).map((c) => c.key));
    const fieldKeys = new Set((template.zoneExtraFields || []).map((f) => f.key));
    return rawZones
        .filter((z) => z && typeof z.name === 'string' && z.name.trim())
        .map((z) => {
            const counters = {};
            for (const [k, v] of Object.entries(z.counters && typeof z.counters === 'object' ? z.counters : {})) {
                if (!counterKeys.has(k)) continue;
                const n = parseLooseNumber(v);
                if (n !== undefined && n > 0) counters[k] = Math.round(n);
            }
            const fields = {};
            for (const [k, v] of Object.entries(z.fields && typeof z.fields === 'object' ? z.fields : {})) {
                if (!fieldKeys.has(k)) continue;
                const text = looseText(v);
                if (text) fields[k] = text;
            }
            return { name: z.name.trim(), counters, fields };
        });
};

const sanitizeTableau = (raw, template) => {
    if (!template.hasTableau || !raw || typeof raw !== 'object') return {};
    const out = {};
    const etats = template.tableauEtats || [];
    if (raw.etat !== undefined) {
        // Valeur technique (« a_remplacer ») ou libellé (« À remplacer »).
        const wanted = normalizeLabel(raw.etat);
        const etat = etats.find((e) => normalizeLabel(e.value) === wanted || normalizeLabel(e.label) === wanted);
        if (etat) out.etat = etat.value;
    }
    for (const key of ['rangees', 'placesDispo', 'disjoncteurs', 'observations']) {
        const text = looseText(raw[key]);
        if (text) out[key] = text;
    }
    if (typeof raw.renovationComplete === 'boolean') out.renovationComplete = raw.renovationComplete;
    for (const key of ['diffTypeA', 'diffTypeAC']) {
        const n = parseLooseNumber(raw[key]);
        if (n !== undefined && n > 0) out[key] = Math.round(n);
    }
    return out;
};

const CHECKLIST_STATES = { verifie: 'verifie', prevu: 'prevu', 'a prevoir': 'prevu', prevoir: 'prevu' };

const sanitizeChecklist = (raw, template) => {
    const out = {};
    const ids = new Set((template.checklist || []).map((c) => c.id));
    for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
        const state = CHECKLIST_STATES[normalizeLabel(v)];
        if (ids.has(k) && state) out[k] = state;
    }
    return out;
};

// Noms de pièce comparés sans casse, accents ni article : « la cuisine »
// retrouve « Cuisine » au lieu de créer une seconde pièce.
const zoneKey = (name) => normalizeLabel(name).replace(/^(la|le|les|l|du|de la|dans la|dans le)\s+/, '');

/**
 * Fusionne un relevé extrait par l'IA dans le relevé existant, sans jamais
 * écraser ce que l'artisan a déjà saisi : seuls les champs encore vides sont
 * complétés (zones assorties par nom, sinon ajoutées). L'artisan garde la
 * main sur tout ce qu'il a lui-même rempli, avant de le relire et le
 * chiffrer.
 *
 * @param {object} existing - survey courant (createEmptySurvey() ou saisi)
 * @param {object|null} rawExtracted - retour brut de extractSurveyFromVisit
 * @param {object} template - trame du métier (getSurveyTemplate)
 */
export const mergeSurveyFill = (existing, rawExtracted, template) => {
    const survey = existing || createEmptySurvey();
    if (!rawExtracted || typeof rawExtracted !== 'object' || !template) return survey;

    const demande = survey.demande?.trim()
        ? survey.demande
        : (looseText(rawExtracted.demande) ?? survey.demande);

    const contexte = sanitizeContexte(rawExtracted.contexte, template, rawExtracted);
    for (const [groupKey, group] of Object.entries(survey.contexte || {})) {
        contexte[groupKey] = { ...contexte[groupKey], ...group }; // l'existant écrase l'extrait
    }

    const zones = (survey.zones || []).map((z) => ({ ...z, counters: { ...z.counters }, fields: { ...z.fields } }));
    for (const ez of sanitizeZones(rawExtracted.zones, template)) {
        const match = zones.find((z) => zoneKey(z.name) === zoneKey(ez.name));
        if (match) {
            for (const [k, v] of Object.entries(ez.counters)) if (!match.counters[k]) match.counters[k] = v;
            for (const [k, v] of Object.entries(ez.fields)) if (!match.fields[k]) match.fields[k] = v;
        } else {
            zones.push({ ...createEmptyZone(), name: ez.name, counters: ez.counters, fields: ez.fields });
        }
    }

    const tableau = { ...survey.tableau };
    for (const [k, v] of Object.entries(sanitizeTableau(rawExtracted.tableau, template))) {
        const current = tableau[k];
        const isEmpty = current === '' || current === undefined || current === null || current === false;
        if (isEmpty) tableau[k] = v;
    }

    const checklist = { ...sanitizeChecklist(rawExtracted.checklist, template), ...survey.checklist };

    const nonConformites = survey.nonConformites?.trim()
        ? survey.nonConformites
        : (looseText(rawExtracted.nonConformites) ?? survey.nonConformites);
    const notesLibres = survey.notesLibres?.trim()
        ? survey.notesLibres
        : (looseText(rawExtracted.notesLibres) ?? survey.notesLibres);

    return { demande, contexte, zones, tableau, checklist, nonConformites, notesLibres };
};

/**
 * Nom du client et adresse du chantier entendus pendant la visite (bloc
 * « client » de la réponse d'extraction). Rien n'est deviné : vide si la
 * conversation ne les mentionne pas.
 * @returns {{nom: string, adresse: string}}
 */
export const extractVisitIdentity = (rawExtracted) => {
    const client = rawExtracted && typeof rawExtracted.client === 'object' && rawExtracted.client
        ? rawExtracted.client
        : {};
    return {
        nom: looseText(client.nom) || '',
        adresse: looseText(client.adresse) || '',
    };
};

/**
 * Nombre d'informations renseignées dans le relevé (demande, champs de
 * contexte, compteurs et champs de pièces, tableau, check-list, textes) —
 * pour dire à l'artisan combien le remplissage automatique en a ajouté.
 */
export const countSurveyValues = (survey) => {
    if (!survey) return 0;
    const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== false && String(v ?? '').trim() !== '' && v !== 0);
    let n = 0;
    if (filled(survey.demande)) n += 1;
    for (const group of Object.values(survey.contexte || {})) {
        n += Object.values(group || {}).filter(filled).length;
    }
    for (const zone of survey.zones || []) {
        n += Object.values(zone.counters || {}).filter((c) => Number(c) > 0).length;
        n += Object.values(zone.fields || {}).filter(filled).length;
    }
    n += Object.values(survey.tableau || {}).filter(filled).length;
    n += Object.values(survey.checklist || {}).filter(Boolean).length;
    if (filled(survey.nonConformites)) n += 1;
    if (filled(survey.notesLibres)) n += 1;
    return n;
};
