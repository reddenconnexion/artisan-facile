// Compte rendu de visite prédevis : assemble la trame de relevé, les notes
// vocales transcrites et les photos en un texte complet, prêt à coller dans
// une IA spécialisée devis (ou à archiver dans le rapport de visite).
// Module pur, sans dépendance React ni réseau — utilisable hors connexion.

import {
    buildSurveySections,
    sumZoneCounters,
    contexteValueText,
    hasZoneContent,
    hasTableauContent,
} from './surveyText';

/** Libellés de sections numérotées dans le compte rendu. */
const numberedTitle = (index, title) => `## ${index}. ${title}`;

const formatDate = (value) => {
    const d = value instanceof Date ? value : value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * Un élément essentiel de la trame est-il renseigné ?
 * Clés supportées : 'demande', 'zones', 'tableau', 'contexte.<groupe>.<champ>'.
 */
const isEssentialFilled = (survey, key) => {
    if (!survey) return false;
    if (key === 'demande') return String(survey.demande ?? '').trim() !== '';
    if (key === 'zones') return (survey.zones || []).some(hasZoneContent);
    if (key === 'tableau') return hasTableauContent(survey.tableau);
    if (key.startsWith('contexte.')) {
        const [, groupKey, fieldKey] = key.split('.');
        return contexteValueText(survey.contexte?.[groupKey]?.[fieldKey]) !== '';
    }
    return false;
};

/**
 * Les points essentiels manquants — affichés sur site pour compléter le
 * relevé avant de partir, et listés dans le compte rendu pour que l'IA devis
 * pose la question au lieu d'inventer.
 * @returns {{key: string, label: string}[]}
 */
export const findMissingEssentials = (survey, template) =>
    (template?.essentials || []).filter(({ key }) => !isEssentialFilled(survey, key));

/**
 * Avancement du relevé, pour la jauge affichée pendant la visite.
 * @returns {{done: number, total: number, pct: number}}
 */
export const surveyCompleteness = (survey, template) => {
    const essentials = template?.essentials || [];
    const total = essentials.length;
    const done = total - findMissingEssentials(survey, template).length;
    return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
};

// Consigne finale : cadre le travail de l'IA devis à partir du compte rendu.
export const REPORT_AI_INSTRUCTION = [
    'Établis un devis électrique détaillé à partir de ce compte rendu de visite.',
    '- Les quantités du relevé pièce par pièce font foi : une ligne par poste, regroupée par pièce.',
    '- Chaque point coché « À prévoir » et chaque non-conformité doit apparaître au devis, soit en ligne chiffrée, soit en réserve écrite.',
    '- Tiens compte du mode de pose, de la nature des murs et des contraintes d\'accès pour estimer la main d\'œuvre.',
    '- Ne chiffre pas au hasard ce qui figure en « points à confirmer » : pose-moi la question ou signale l\'hypothèse retenue.',
    '- Rends : les lignes (désignation, quantité, unité), le temps de main d\'œuvre par poste, le matériel, puis la liste des réserves.',
].join('\n');

/**
 * Assemble le compte rendu complet de la visite prédevis.
 *
 * @param {object}   args
 * @param {object}   args.survey    - état de la trame de relevé
 * @param {object}   args.template  - trame métier (voir surveyTemplates.js)
 * @param {object}   [args.meta]    - contexte de la visite :
 *   { clientName, address, date, companyName, artisanName,
 *     summaryText: string — synthèse rédigée par l'IA (optionnelle),
 *     timelineLines: string[] — déroulé chronologique (mode express),
 *     voiceTranscripts: string[], voiceNotesCount: number,
 *     photoCount: number, photoNotes: string[] }
 * @param {boolean}  [args.withAiInstruction=true] - ajoute la consigne finale
 * @returns {string} texte markdown, prêt à copier / partager
 */
export const buildPredevisReport = ({ survey, template, meta = {}, withAiInstruction = true } = {}) => {
    if (!template) return '';
    const blocks = [];

    // ── En-tête ────────────────────────────────────────────────────────────
    const header = ['# COMPTE RENDU DE VISITE PRÉDEVIS', ''];
    const headerLines = [
        ['Date de la visite', formatDate(meta.date)],
        ['Client', meta.clientName],
        ['Adresse du chantier', meta.address],
        ['Type de relevé', template.label],
        ['Entreprise', [meta.companyName, meta.artisanName].filter(Boolean).join(' — ')],
    ].filter(([, value]) => String(value ?? '').trim() !== '');
    header.push(...headerLines.map(([label, value]) => `**${label} :** ${value}`));
    blocks.push(header.join('\n'));

    // ── Synthèse mise au propre par l'IA (optionnelle) ─────────────────────
    // Placée avant le détail : c'est la version lisible. Le brut reste
    // dessous, c'est lui qui fait foi en cas de doute.
    const summary = String(meta.summaryText ?? '').trim();
    if (summary) {
        blocks.push(['## SYNTHÈSE DE LA VISITE (mise au propre automatique — à relire)', summary].join('\n'));
    }

    // ── Sections issues de la trame, récapitulatif à la suite du relevé ────
    let index = 0;
    const totals = sumZoneCounters(survey, template);
    for (const { title, lines } of buildSurveySections(survey, template, { withZoneTotals: false })) {
        index += 1;
        blocks.push([numberedTitle(index, title), ...lines].join('\n'));
        if (title === 'RELEVÉ PAR ZONE' && totals.length) {
            index += 1;
            blocks.push([
                numberedTitle(index, 'RÉCAPITULATIF QUANTITATIF (toutes pièces)'),
                ...totals.map(({ label, total }) => `- ${label} : ${total}`),
            ].join('\n'));
        }
    }

    // ── Déroulé de la visite (mode express) ────────────────────────────────
    // Le fil chronologique porte déjà les notes vocales, pièce par pièce :
    // quand il est là, la section « notes vocales » ferait doublon.
    const timelineLines = (meta.timelineLines || []).filter((l) => String(l ?? '').trim() !== '');
    if (timelineLines.length) {
        index += 1;
        blocks.push([numberedTitle(index, 'DÉROULÉ DE LA VISITE'), ...timelineLines].join('\n'));
    }

    // ── Notes vocales transcrites ──────────────────────────────────────────
    const transcripts = timelineLines.length
        ? []
        : (meta.voiceTranscripts || []).map((t) => String(t ?? '').trim()).filter(Boolean);
    if (transcripts.length) {
        index += 1;
        blocks.push([
            numberedTitle(index, 'NOTES VOCALES (transcription)'),
            ...transcripts.map((t, i) => `${i + 1}. ${t}`),
        ].join('\n'));
    } else if (!timelineLines.length && meta.voiceNotesCount > 0) {
        index += 1;
        blocks.push([
            numberedTitle(index, 'NOTES VOCALES'),
            `${meta.voiceNotesCount} note${meta.voiceNotesCount > 1 ? 's' : ''} vocale${meta.voiceNotesCount > 1 ? 's' : ''} enregistrée${meta.voiceNotesCount > 1 ? 's' : ''}, non transcrite${meta.voiceNotesCount > 1 ? 's' : ''} (à écouter avant chiffrage).`,
        ].join('\n'));
    }

    // ── Photos ─────────────────────────────────────────────────────────────
    const photoNotes = (meta.photoNotes || []).map((t) => String(t ?? '').trim()).filter(Boolean);
    if (meta.photoCount > 0 || photoNotes.length) {
        index += 1;
        const lines = [];
        if (meta.photoCount > 0) {
            lines.push(`${meta.photoCount} photo${meta.photoCount > 1 ? 's' : ''} prise${meta.photoCount > 1 ? 's' : ''} pendant la visite.`);
        }
        lines.push(...photoNotes.map((t, i) => `- Photo ${i + 1} : ${t}`));
        blocks.push([numberedTitle(index, 'PHOTOS'), ...lines].join('\n'));
    }

    // ── Points à confirmer ─────────────────────────────────────────────────
    const missing = findMissingEssentials(survey, template);
    if (missing.length) {
        index += 1;
        blocks.push([
            numberedTitle(index, 'POINTS À CONFIRMER AVANT CHIFFRAGE'),
            'Ces informations n\'ont pas été relevées pendant la visite :',
            ...missing.map(({ label }) => `- ${label}`),
        ].join('\n'));
    }

    if (withAiInstruction) blocks.push(['## CONSIGNE POUR L\'IA DEVIS', REPORT_AI_INSTRUCTION].join('\n'));

    return blocks.join('\n\n');
};

/** Nom de fichier proposé au téléchargement / partage du compte rendu. */
export const predevisReportFilename = (meta = {}) => {
    const d = meta.date instanceof Date ? meta.date : meta.date ? new Date(meta.date) : new Date();
    const day = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    const client = String(meta.clientName ?? '').trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return ['predevis', day, client].filter(Boolean).join('-') + '.txt';
};
