import { TRADE_CONFIG } from '../constants/trades';

const TRADE_KEYWORDS = {
    general: ['artisan', 'travaux'],
    multiservice: ['multi-services', 'bricolage'],
    plombier: ['plombier', 'plomberie'],
    chauffagiste: ['chauffagiste', 'chauffage'],
    electricien: ['électricien', 'travaux d\'électricité'],
    peintre: ['peintre', 'travaux de peinture'],
    carreleur: ['carreleur', 'pose de carrelage'],
    macon: ['maçon', 'travaux de maçonnerie'],
    plaquiste: ['plaquiste', 'travaux de placo'],
    menuisier: ['menuisier', 'travaux de menuiserie'],
    charpentier: ['charpentier', 'charpente'],
    paysagiste: ['paysagiste', 'aménagement paysager'],
    autre: ['artisan', 'travaux'],
};

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const tradeKeywords = (trade) => TRADE_KEYWORDS[trade] || TRADE_KEYWORDS.general;

const cleanCity = (city) => {
    if (!city) return '';
    const c = String(city).trim();
    if (!c) return '';
    return c.split(' ').map(w => w.length > 2 ? cap(w.toLowerCase()) : w.toLowerCase()).join(' ');
};

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

const shortWorkSummary = (workDone, title) => {
    const raw = (workDone || title || '').trim();
    if (!raw) return '';
    const oneLine = raw.replace(/\s+/g, ' ');
    if (oneLine.length <= 90) return oneLine;
    const truncated = oneLine.slice(0, 87);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated) + '…';
};

/**
 * Build personalized, locally-SEO-optimized Google review suggestions.
 * The returned strings are written from the CLIENT'S perspective.
 */
export const buildReviewSuggestions = ({ userProfile, client, intervention } = {}) => {
    // Les valeurs par défaut des paramètres ne couvrent pas `null` : on normalise explicitement.
    userProfile = userProfile || {};
    client = client || {};
    intervention = intervention || {};

    const companyName = userProfile.company_name || userProfile.full_name || 'cet artisan';
    const trade = userProfile.trade || 'general';
    const [primaryKw, secondaryKw] = tradeKeywords(trade);
    const tradeLabel = TRADE_CONFIG[trade]?.label?.split(' /')[0] || primaryKw;

    const city = cleanCity(resolveReviewCity({ intervention, client }));
    const workSummary = shortWorkSummary(intervention.workDone, intervention.title);
    const locationPart = city ? ` à ${city}` : '';
    const workPart = workSummary ? ` pour ${workSummary.toLowerCase()}` : '';

    const variants = [];

    variants.push(
        `J'ai fait appel à ${companyName}${locationPart}${workPart} et je recommande sans hésiter. ` +
        `Travail soigné, délais respectés et communication impeccable. ` +
        `Un ${primaryKw}${city ? ` sur ${city}` : ''} sérieux et fiable !`
    );

    variants.push(
        `Excellente prestation de ${companyName}${city ? ` (${tradeLabel}${locationPart})` : ` — ${tradeLabel}`}. ` +
        `${workSummary ? `Intervention : ${workSummary}. ` : ''}` +
        `Devis clair, intervention propre, résultat à la hauteur. ` +
        `Si vous cherchez un bon ${primaryKw}${city ? ` sur ${city}` : ''}, foncez.`
    );

    variants.push(
        `Très satisfait du travail réalisé par ${companyName}${locationPart}. ` +
        `${workSummary ? `${cap(workSummary)} — du sérieux du début à la fin. ` : 'Du sérieux du début à la fin. '}` +
        `Je recommande pour tous travaux de ${secondaryKw}${city ? ` autour de ${city}` : ''}.`
    );

    return variants.map(v => v.replace(/\s+/g, ' ').trim());
};

/**
 * Short SMS body that invites the client to leave a Google review.
 * Includes the suggested review text and the review URL so the client can
 * paste-and-go in one tap.
 */
export const buildReviewSMS = ({ userProfile, client, suggestion = '', reviewUrl = '' } = {}) => {
    // Idem : on protège contre les valeurs `null` non couvertes par les défauts.
    userProfile = userProfile || {};
    client = client || {};

    const firstName = (client.name || '').split(' ')[0] || '';
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const signature = userProfile.full_name || userProfile.company_name || '';
    const link = reviewUrl ? `\n${reviewUrl}` : '';
    const inspiration = suggestion ? `\n\nBesoin d'inspiration :\n"${suggestion}"` : '';
    return (
        `${greeting} merci pour votre confiance. ` +
        `Un avis Google m'aiderait énormément (30 secondes) :${link}${inspiration}` +
        `${signature ? `\n\n${signature}` : ''}`
    );
};
