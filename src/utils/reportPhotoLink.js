// Rattachement des photos d'une visite prédevis à la fiche du client.
//
// Sur le terrain, la visite précède souvent le client : on passe voir, on
// photographie, et la fiche n'est créée qu'au retour. Les photos partaient
// alors dans le seul rapport de visite — le client créé ensuite se retrouvait
// avec un dossier photo vide, et rien dans l'application ne permettait de les
// y faire entrer après coup. Rattacher le client au rapport reporte donc
// maintenant ses photos dans son dossier, exactement comme lorsque la visite
// démarre depuis une fiche existante (voir `buildClientPhotoRows`).
//
// Module pur : ni horloge ni réseau, tout arrive en paramètre.

import { buildClientPhotoRows } from './visitArchive';

/**
 * Date du rapport (`YYYY-MM-DD`) en objet Date local. Un `new Date('2026-09-22')`
 * est lu en UTC : à l'ouest de Greenwich la photo serait datée de la veille.
 */
export const parseReportDate = (value, fallback = null) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
    if (!match) return fallback;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
};

/**
 * Décrit ce qu'il faut écrire dans `project_photos` pour que les photos du
 * rapport suivent son client.
 *
 * - `rows` : les photos pas encore présentes dans le dossier du client.
 * - `unlinkClientId` / `unlinkUrls` : quand le rapport change de client, les
 *   photos quittent l'ancienne fiche — sinon elles resteraient dans le dossier
 *   d'un client qui n'a jamais eu ce chantier.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string|number|null} args.clientId - client du rapport après enregistrement
 * @param {string|number|null} [args.previousClientId] - client déjà servi par ce rapport
 * @param {{url: string, path?: string, name?: string}[]} [args.photos]
 * @param {string[]} [args.linkedUrls] - photos déjà dans le dossier du client
 * @param {Date} [args.date]
 */
export const planReportPhotoLink = ({
    userId,
    clientId,
    previousClientId = null,
    photos = [],
    linkedUrls = [],
    date,
}) => {
    const withUrl = (photos || []).filter((p) => p?.url);
    const already = new Set(linkedUrls || []);
    const rows = buildClientPhotoRows({
        userId,
        clientId,
        photos: withUrl.filter((p) => !already.has(p.url)),
        date,
    });
    const hadClient = previousClientId !== null && previousClientId !== undefined && previousClientId !== '';
    const moved = hadClient && String(previousClientId) !== String(clientId ?? '');
    return {
        rows,
        unlinkClientId: moved ? previousClientId : null,
        unlinkUrls: moved ? withUrl.map((p) => p.url) : [],
    };
};
