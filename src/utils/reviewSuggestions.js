import { TRADE_CONFIG } from '../constants/trades';

// [nom du métier, domaine d'activité]. Le domaine est un nom nu qui doit
// s'insérer après « tout ce qui est … » sans article.
const TRADE_KEYWORDS = {
    general: ['artisan', 'travaux'],
    multiservice: ['multi-services', 'bricolage'],
    plombier: ['plombier', 'plomberie'],
    chauffagiste: ['chauffagiste', 'chauffage'],
    electricien: ['électricien', 'électricité'],
    peintre: ['peintre', 'peinture'],
    carreleur: ['carreleur', 'carrelage'],
    macon: ['maçon', 'maçonnerie'],
    plaquiste: ['plaquiste', 'placo'],
    menuisier: ['menuisier', 'menuiserie'],
    charpentier: ['charpentier', 'charpente'],
    paysagiste: ['paysagiste', 'aménagement extérieur'],
    autre: ['artisan', 'travaux'],
};

const FALLBACK_ARTISAN = 'cet artisan';

// Particules qui restent en minuscules dans un nom de commune
// (Saint-Médard-de-Guizières, L'Isle-sur-la-Sorgue…).
const CITY_PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'lès', 'au', 'aux', 'et', 'd', 'l']);

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const lowerFirst = (s) => s ? s.charAt(0).toLowerCase() + s.slice(1) : '';

const tradeKeywords = (trade) => TRADE_KEYWORDS[trade] || TRADE_KEYWORDS.general;

const cleanCity = (city) => {
    if (!city) return '';
    const c = String(city).trim();
    if (!c) return '';
    // On découpe en conservant les séparateurs : un nom composé mal saisi
    // ("SAINT-MEDARD-DE-GUIZIERES") doit ressortir correctement accentué en
    // casse, pas en "Saint-medard-de-guizieres".
    return c
        .split(/([\s'-])/)
        .map((token, i) => {
            if (/^[\s'-]$/.test(token)) return token;
            const lower = token.toLowerCase();
            if (i > 0 && CITY_PARTICLES.has(lower)) return lower;
            return cap(lower);
        })
        .join('');
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

// Un intitulé de chantier est écrit pour un devis, pas pour un avis client :
// "Remplacement tableau + mise aux normes ; pose 4 PC" sonne comme une ligne de
// facture. On le ramène à un bout de phrase qu'un particulier pourrait écrire.
const humanizeWork = (workDone, title) => {
    const raw = (workDone || title || '').trim();
    if (!raw) return '';

    let s = raw
        .replace(/\s+/g, ' ')
        .replace(/\s*\+\s*/g, ' et ')
        .replace(/\s*&\s*/g, ' et ')
        .replace(/\s*[;•·|]+\s*/g, ', ')
        .replace(/^[-–—*\d.)\s]+/, '')
        .replace(/[.,;:!?\s]+$/, '')
        .trim();
    if (!s) return '';

    // Trop long → on garde la première idée (avant la première virgule) si elle
    // se suffit à elle-même, sinon on coupe proprement sur un mot.
    if (s.length > 70) {
        const firstClause = s.split(',')[0].trim();
        if (firstClause.length >= 20 && firstClause.length <= 70) {
            s = firstClause;
        } else {
            const truncated = s.slice(0, 68);
            const lastSpace = truncated.lastIndexOf(' ');
            s = (lastSpace > 25 ? truncated.slice(0, lastSpace) : truncated).replace(/[.,;:]$/, '');
        }
    }

    return s;
};

const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Tire les fragments sans remise : deux avis du même lot ne réutilisent pas la
// même phrase, ce qui est justement ce qui donne l'impression de « généré ».
const makeDrawer = (items) => {
    let pool = shuffle(items);
    return () => {
        if (!pool.length) pool = shuffle(items);
        return pool.pop();
    };
};

// Ouvertures utilisables même quand on ne connaît pas le nom de l'artisan
// (le libellé de repli « cet artisan » ne peut pas démarrer une phrase).
// Aucune tournure ne présume du genre du client qui écrit l'avis, ni de celui
// de l'artisan : pas de « je suis tombé », pas de « il a fait ».
const OPENINGS = [
    (v) => `J'ai fait appel à ${v.who}${v.workFor}${v.place}.`,
    (v) => `On a fait appel à ${v.who}${v.place}${v.workFor}, sur les conseils d'un voisin.`,
    (v) => `Je cherchais quelqu'un de sérieux pour ${v.work || 'des travaux'}${v.place}, et je ne regrette pas d'avoir appelé ${v.who}.`,
    (v) => `${v.work ? `${cap(v.work)}` : 'Intervention'}${v.place} : c'est ${v.who} qui a fait le travail.`,
    (v) => `Première fois que je faisais appel à ${v.who}${v.place}, et sûrement pas la dernière.`,
    (v) => `Appel à ${v.who} un peu en urgence${v.workFor} : rendez-vous dans la semaine.`,
    (v) => `Excellente expérience avec ${v.who}${v.place}${v.workFor}.`,
];

// Ouvertures qui démarrent sur le nom : réservées aux profils renseignés.
const OPENINGS_NAMED = [
    (v) => `${cap(v.who)} a fait le déplacement très vite${v.place}${v.workFor}.`,
    (v) => `${cap(v.who)} a pris le temps de passer voir sur place avant de me chiffrer les travaux.`,
    (v) => `${cap(v.who)} a géré le chantier du début à la fin${v.place}, et honnêtement rien à redire.`,
];

// Un seul argument par phrase : les énumérations d'adjectifs
// (« sérieux, ponctuel et soigné ») sont la marque des faux avis.
const DETAILS = [
    () => `Le devis était clair et il a été respecté au centime près.`,
    () => `Rendez-vous tenu, avec un message la veille pour confirmer.`,
    () => `Tout était nettoyé en repartant, je n'ai eu qu'à repousser les meubles.`,
    (v) => `${cap(v.short)} m'a expliqué ce qui allait être fait avant de commencer, sans jargon.`,
    (v) => `${cap(v.short)} a proposé la solution la plus simple plutôt que la plus chère.`,
    () => `Un petit détail que je n'avais même pas signalé a été réglé au passage.`,
    () => `Joignable au téléphone quand j'avais une question, ça n'a l'air de rien mais ça change tout.`,
    () => `Aucune mauvaise surprise sur la facture à la fin.`,
    () => `Le résultat est propre, on ne voit même pas qu'il y a eu des travaux.`,
    () => `Du travail fait correctement, sans donner l'impression de courir au chantier suivant.`,
    () => `Ça a été fait dans la journée alors que je m'attendais à attendre des semaines.`,
    () => `Prix annoncé à l'avance, pas de rallonge en cours de route.`,
];

// Avis d'une ligne : beaucoup de vrais avis Google tiennent en deux phrases et
// ne détaillent pas le chantier. Ceux-ci portent déjà le métier et la ville,
// donc aucune chute SEO ne vient les rallonger.
const ONELINERS = [
    (v) => `Très bon ${v.kw}${v.place}, je recommande ${v.who} sans hésiter.`,
    (v) => `Rien à redire : ${v.who} est un vrai pro${v.place}. Un ${v.kw} comme on en cherche.`,
    (v) => `J'ai fait appel à ${v.who}${v.place} et c'était nickel. Un bon ${v.kw}, tout simplement.`,
    (v) => `Un ${v.kw} sérieux${v.place} : ${v.who} fait le travail correctement, sans discuter.`,
];

const PUNCHY = [
    'Rien à dire.',
    'Impeccable.',
    'Que du positif.',
    'Parfait.',
    'Franchement au top.',
];

const CLOSINGS = [
    () => `Merci encore !`,
    () => `Je recommande.`,
    () => `Je garde le numéro, c'est sûr.`,
    (v) => `Je referai appel à ${v.short} sans hésiter.`,
    () => `Ça fait plaisir de tomber sur quelqu'un de sérieux.`,
    () => `À recommander sans hésiter.`,
];

// Chute qui replace le métier (+ la ville) quand l'avis composé ne les contient
// pas encore : c'est ce qui porte le référencement local, une seule fois et
// dans une tournure que quelqu'un écrirait vraiment.
const SEO_CLOSINGS = [
    (v) => `Si vous cherchez un ${v.kw}${v.place}, n'hésitez pas.`,
    (v) => `Un ${v.kw}${v.place} comme on aimerait en trouver plus souvent.`,
    (v) => `Je le recommande à ceux qui cherchent un ${v.kw} sérieux${v.place}.`,
    (v) => `Bref, un bon ${v.kw}${v.place}.`,
    (v) => `Je recommande pour tout ce qui est ${v.domain}${v.place}.`,
];

// Assemblages décrits en slots : la longueur et l'ordre varient d'un avis à
// l'autre, là où l'ancienne version produisait toujours trois phrases calibrées.
// Une chute SEO remplace la chute neutre finale au lieu de s'y ajouter, sinon
// l'avis se termine par deux formules de recommandation à la suite.
const SHAPES = [
    // Court, comme la majorité des vrais avis Google.
    ['opening', 'detail'],
    // Verdict d'abord.
    ['punchy', 'opening', 'detail'],
    // Format long, un peu raconté.
    ['opening', 'detail', 'detail', 'closing'],
    // Contexte, argument, remerciement.
    ['opening', 'detail', 'closing'],
    // Le détail avant le contexte.
    ['detail', 'opening', 'closing'],
    // Très court : chaque lot en contient un, sinon les six propositions se
    // ressemblent toutes par leur longueur.
    ['oneliner'],
];

/**
 * Build personalized Google review suggestions.
 * The returned strings are written from the CLIENT'S perspective, in a
 * spoken register: the goal is a text the client can send as-is without
 * anyone suspecting it was pre-written. Le référencement local reste assuré
 * (métier + ville cités une fois), mais sans bourrage de mots-clés.
 */
export const buildReviewSuggestions = ({ userProfile, client, intervention } = {}) => {
    // Les valeurs par défaut des paramètres ne couvrent pas `null` : on normalise explicitement.
    userProfile = userProfile || {};
    client = client || {};
    intervention = intervention || {};

    const companyName = userProfile.company_name || userProfile.full_name || '';
    const firstName = (userProfile.full_name || '').trim().split(' ')[0] || '';
    const trade = userProfile.trade || 'general';
    const [primaryKw, domain] = tradeKeywords(trade);

    const city = cleanCity(resolveReviewCity({ intervention, client }));
    // `work` n'est inséré qu'en tête de phrase ou après « pour » : on ne connaît
    // pas le genre du nom qui l'ouvre, donc jamais après un verbe qui
    // réclamerait un article ("a géré remplacement du tableau").
    const work = lowerFirst(humanizeWork(intervention.workDone, intervention.title));

    const drawPlace = makeDrawer(city ? [` à ${city}`, ` à ${city}`, ` sur ${city}`, ` du côté de ${city}`] : ['']);
    const drawers = {
        opening: makeDrawer(companyName ? [...OPENINGS, ...OPENINGS_NAMED] : OPENINGS),
        detail: makeDrawer(DETAILS),
        oneliner: makeDrawer(ONELINERS),
        punchy: makeDrawer(PUNCHY),
        closing: makeDrawer(CLOSINGS),
        seo: makeDrawer(SEO_CLOSINGS),
    };
    const render = {
        opening: (v) => drawers.opening()(v),
        detail: (v) => drawers.detail()(v),
        oneliner: (v) => drawers.oneliner()(v),
        punchy: () => drawers.punchy(),
        closing: (v) => drawers.closing()(v),
        seo: (v) => drawers.seo()(v),
    };

    const shapes = shuffle(SHAPES);
    const count = Math.min(6, shapes.length);

    const suggestions = [];
    for (let i = 0; i < count; i += 1) {
        // Une partie des avis nomme l'artisan par son prénom : c'est ce que font
        // les vrais clients, et ça casse la répétition du nom commercial.
        const usesFirstName = firstName && companyName && i % 3 === 2;
        const who = (usesFirstName ? firstName : companyName) || FALLBACK_ARTISAN;
        const place = drawPlace();

        const v = {
            who,
            // Rappel de l'artisan en cours d'avis : on raccourcit au prénom pour
            // éviter le nom commercial répété trois fois, marque des faux avis.
            short: firstName || who,
            city,
            place,
            work,
            workFor: work ? ` pour ${work}` : '',
            kw: primaryKw,
            domain,
        };

        const slots = [...shapes[i]];
        const sentences = slots.map(slot => render[slot](v)).filter(Boolean);
        const text = sentences.join(' ').replace(/\s+/g, ' ').trim();

        // Garde-fou référencement : le métier et la ville doivent apparaître une
        // fois — mais une seule, sinon on retombe dans le bourrage de mots-clés.
        // Le nom du métier ou son domaine font aussi bien l'affaire côté
        // référencement (« plombier » ou « plomberie »).
        const lower = text.toLowerCase();
        const needsTrade = !lower.includes(primaryKw.toLowerCase()) && !lower.includes(domain.toLowerCase());
        const needsCity = Boolean(city) && !text.includes(city);
        if (!needsTrade && !needsCity) {
            suggestions.push(text);
            continue;
        }

        const seo = render.seo({ ...v, place: needsCity ? place : '' });
        // La chute SEO prend la place de la chute neutre quand il y en a une.
        const kept = slots[slots.length - 1] === 'closing' ? sentences.slice(0, -1) : sentences;
        suggestions.push([...kept, seo].join(' ').replace(/\s+/g, ' ').trim());
    }

    return suggestions;
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
    // On invite explicitement à réécrire : un avis recopié mot pour mot se
    // repère, et c'est le client qui sait le mieux ce qui lui a plu.
    const inspiration = suggestion
        ? `\n\nSi vous manquez d'inspiration, vous pouvez partir de ça et le tourner à votre façon :\n"${suggestion}"`
        : '';
    return (
        `${greeting} encore merci pour votre confiance. ` +
        `Si le travail vous a plu, un petit avis Google m'aide beaucoup à me faire connaître, ça prend 30 secondes :${link}${inspiration}` +
        `${signature ? `\n\n${signature}` : ''}`
    );
};
