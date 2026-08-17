/**
 * Mention manuscrite obligatoire accompagnant la signature d'un devis
 * (« Bon pour accord »).
 *
 * La saisie du client est comparée de façon tolérante : accents, majuscules,
 * ponctuation (« Bon pour accord. ») et espaces multiples ne doivent pas
 * bloquer une signature par ailleurs valable. Seuls les mots comptent.
 */

export const REQUIRED_MENTION = 'bon pour accord';

export const normalizeMention = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // accents
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')          // ponctuation, chiffres, espaces insécables…
    .trim();

export const isValidMention = (value) => normalizeMention(value) === REQUIRED_MENTION;
