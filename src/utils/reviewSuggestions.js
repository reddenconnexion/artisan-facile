// Demande d'avis manuelle (SMS / e-mail) : l'appli ne fournit AUCUN texte
// d'avis au client. Google interdit les avis rédigés par l'entreprise et les
// supprime quand plusieurs reprennent la même formule. On demande seulement au
// client de citer la commune et les travaux, avec ses mots.

// Tente d'extraire la ville d'une adresse libre française.
// Cas couvert : "... 69001 Lyon" → "Lyon" (le texte qui suit le code postal).
const extractCityFromAddress = (address) => {
    if (!address) return '';
    const oneLine = String(address).replace(/\s+/g, ' ').trim();
    const match = oneLine.match(/\b\d{5}\b\s*[,-]?\s*(.+)$/);
    if (match && match[1]) {
        return match[1].replace(/[,;.]+$/, '').trim();
    }
    return '';
};

// Détermine la ville à mettre en avant dans l'avis Google.
// Priorité au LIEU D'INTERVENTION : quand le chantier a lieu ailleurs que chez
// le client, mentionner la ville du client fausserait le référencement local.
export const resolveReviewCity = ({ intervention = {}, client = {} } = {}) => {
    // 1. Ville d'intervention explicitement renseignée → prioritaire.
    if (intervention.city) return intervention.city;

    const interventionAddr = (intervention.address || '').trim();
    const clientAddr = (client.address || '').trim();
    const interventionElsewhere = Boolean(
        interventionAddr && clientAddr && interventionAddr !== clientAddr
    );

    // 2. Une adresse d'intervention est renseignée : on en déduit la ville.
    if (interventionAddr) {
        const fromAddr = extractCityFromAddress(interventionAddr);
        if (fromAddr) return fromAddr;
        // Adresse présente mais ville non identifiable : si le chantier est
        // ailleurs que chez le client, mieux vaut aucune ville qu'une fausse.
        if (interventionElsewhere) return '';
    }

    // 3. Pas de lieu d'intervention distinct → chantier supposé chez le client.
    return client.city || '';
};

// Ce qu'on demande au client d'écrire : rien de plus que la commune et les
// travaux, dans ses propres mots.
export const REVIEW_OWN_WORDS_HINT =
    'Deux lignes avec vos mots suffisent : dites simplement dans quelle commune et pour quels travaux je suis intervenu.';

/**
 * SMS qui invite le client à laisser un avis : remerciement, lien, et la
 * consigne « avec vos mots ». Jamais de texte d'avis prêt à recopier.
 */
export const buildReviewSMS = ({ userProfile, client, reviewUrl = '' } = {}) => {
    // Les valeurs par défaut des paramètres ne couvrent pas `null`.
    userProfile = userProfile || {};
    client = client || {};

    const firstName = (client.name || '').split(' ')[0] || '';
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const signature = userProfile.full_name || userProfile.company_name || '';
    const link = reviewUrl ? `\n${reviewUrl}` : '';
    return (
        `${greeting} encore merci pour votre confiance. ` +
        `Si le travail vous a plu, un petit avis Google m'aide beaucoup à me faire connaître :${link}` +
        `\n\n${REVIEW_OWN_WORDS_HINT}` +
        `${signature ? `\n\n${signature}` : ''}`
    );
};
