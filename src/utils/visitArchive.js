// Archivage d'une visite prédevis.
//
// Le compte rendu copié dans une IA de devis ne laissait aucune trace : trois
// semaines plus tard, quand le client rappelle, il ne restait ni les photos ni
// le relevé. Chaque visite est donc enregistrée comme rapport d'intervention
// (`intervention_reports`, type `site_visit`), consultable dans Interventions.
//
// L'audio n'est jamais conservé : il sert à produire la transcription, puis il
// est oublié. Ce sont les mots qui comptent, pas la bande-son d'une
// conversation avec un client.
//
// Module pur : ni horloge ni réseau, tout arrive en paramètre.

const pad = (n) => String(n).padStart(2, '0');

/** Date au format attendu par la colonne `date` (YYYY-MM-DD), en heure locale. */
export const visitDateKey = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Titre du rapport : reconnaissable dans une liste, sans avoir à l'ouvrir. */
export const visitTitle = ({ clientName, address, date }) => {
    const who = String(clientName ?? '').trim() || String(address ?? '').trim();
    const when = date ? date.toLocaleDateString('fr-FR') : '';
    return ['Visite prédevis', who, when].filter(Boolean).join(' — ');
};

/** Numéro de rapport : VT-<année>-<suffixe>. */
export const visitReportNumber = (date, suffix) => `VT-${date.getFullYear()}-${suffix}`;

/** Emplacement d'une photo de visite dans le bucket `project-photos`. */
export const visitPhotoPath = (userId, id) => `visites/${userId}/${id}.jpg`;

/**
 * Compose la ligne `intervention_reports` d'une visite.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} [args.clientId]
 * @param {string} [args.clientName]
 * @param {string} [args.address]
 * @param {string} args.reportText - le compte rendu complet, tel qu'envoyé à l'IA devis
 * @param {object} [args.survey]   - trame de relevé
 * @param {string[]} [args.timelineLines] - déroulé de la visite
 * @param {object} [args.transcripts]     - { [idSegment]: texte }
 * @param {{url: string, path: string, name: string}[]} [args.photos]
 * @param {Date}   args.date
 * @param {string} args.reportNumber
 */
export const buildVisitRecord = ({
    userId,
    clientId,
    clientName,
    address,
    reportText,
    survey,
    timelineLines = [],
    transcripts = {},
    photos = [],
    date,
    reportNumber,
}) => ({
    user_id: userId,
    client_id: clientId || null,
    client_name: String(clientName ?? '').trim() || null,
    title: visitTitle({ clientName, address, date }),
    description: String(reportText ?? '').trim() || null,
    intervention_address: String(address ?? '').trim() || null,
    notes: JSON.stringify({
        source: 'visite_predevis',
        ...(survey ? { survey } : {}),
        ...(timelineLines.length ? { timeline: timelineLines } : {}),
        ...(Object.keys(transcripts).length ? { transcripts } : {}),
    }),
    photos,
    status: 'draft',
    date: visitDateKey(date),
    report_number: reportNumber,
    report_type: 'site_visit',
});
