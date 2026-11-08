import { LEGACY_TRADE_KEY_MAP } from '../constants/trades';

// Méthode de chiffrage appliquée au devis issu d'une visite pré-devis.
//
// Reprend les règles de la skill « devis électrique » utilisée pour les devis
// faits à la main (projet Claude) afin que le chiffrage automatique d'une
// visite sorte aussi juste : tri ferme / options, pas de gonflage, main
// d'œuvre en heures au taux de l'artisan, prix de SA bibliothèque en priorité.
//
// Envoyée dans `extras` (voir generateQuoteFromSiteVisit) : elle s'ajoute au
// prompt du serveur comme au prompt personnalisé, sans redéploiement de la
// fonction ai-proxy.

// Tri ferme / options : le cœur de la skill, commun au devis de visite et au
// devis Pro rédigé depuis une description.
const TRI_RULE = `1. STRICT NÉCESSAIRE DANS LE TOTAL, CONSEIL EN OPTIONS. Passe CHAQUE ligne envisagée dans ce filtre, dans l'ordre :
   a) Le client l'a demandé → ligne ferme.
   b) Exigé par la réglementation du métier (ex. électricité : NF C 15-100, NF C 14-100, Consuel) → ligne ferme.
   c) Indispensable pour que ce qui est demandé fonctionne ou soit sûr → ligne ferme.
   d) Bon conseil que l'artisan assume par écrit → ligne OPTION ("is_optional": true) avec "option_reason" : la raison en une phrase.
   e) Sinon → la ligne n'apparaît NULLE PART (ni en option, ni en suggestion).
   Trois ou quatre options au maximum : au-delà, reprends le tri.`;

export const SITE_VISIT_METHOD = `

MÉTHODE DE CHIFFRAGE (prioritaire sur toute autre consigne de contenu) :

0. LIRE LA VISITE COMME UN ARTISAN. Les notes vocales sont la transcription brute d'une visite sur place : l'artisan parle au client, se parle à lui-même, mesure, hésite, se corrige. Ce n'est pas une liste de travaux.
   - D'abord, dresse pour toi la liste des TRAVAUX DEMANDÉS par le client et des CONSTATS de l'artisan (existant, longueurs, supports, accès). Le relevé structuré, s'il existe, fait foi.
   - Ignore les bavardages, les idées abandonnées en cours de conversation et ce que le client a écarté (« non, ça on laisse »). Quand l'artisan se corrige, c'est la dernière version qui compte.
   - Les descriptions de photos sont des constats d'appoint : elles précisent l'existant, elles ne créent pas de travaux à elles seules.
   - Chiffre ensuite CHAQUE travail demandé, entièrement : rien d'oublié (alimentation, protection au tableau, raccordement, mise en service), rien d'ajouté (voir 1).

${TRI_RULE}

2. INTERDITS :
   - Aucune montée en gamme non demandée. Si le client a choisi une marque ou une gamme, chiffre dans SA gamme (l'alternative va dans "suggestions", jamais au chiffrage).
   - Aucune provision « au cas où » dans les prix. Une incertitude sur l'ampleur des travaux devient une RÉSERVE écrite dans "work_object" (« sous réserve de … ; un avenant sera établi si … »).
   - Aucune obligation inventée : une recommandation fabricant, une règle « sauf justification par le calcul » ou une bonne pratique ne sont PAS des obligations.
   - Aucune référence fabricant ni marque dans les désignations : désignation générique uniquement (ex. « Disjoncteur modulaire 16A courbe C »).

3. MAIN D'ŒUVRE : lignes "service" en heures (unit "h", quantity = nombre d'heures, price = taux horaire de l'artisan). Estime les durées comme un artisan expérimenté, poste par poste, déplacements et mise en service compris ; ne regroupe pas tout dans une seule ligne vague.

4. FOURNITURES : lignes "material" détaillées (une ligne par élément avec sa quantité réelle relevée) — l'artisan choisira ensuite de les présenter regroupées ou non. N'oublie pas le petit matériel indispensable (boîtes, câbles, gaines, fixations) quand il est nécessaire à la pose.

5. QUANTITÉS : reprends exactement les quantités et longueurs relevées. Si une quantité manque, estime-la de façon réaliste ET signale-la dans "suggestions" (« Quantité estimée : … — à vérifier »).

6. Les lignes "is_optional" n'entrent pas dans le total : "price_range" porte sur les lignes fermes uniquement.

7. Si le total ferme dépasse 5 000 € HT, ajoute dans "suggestions" : « Devis > 5 000 € HT : proposer une étude technique préalable (200 € HT) déductible en cas de signature. »

8. PRÉCISIONS À DEMANDER : s'il manque des informations qui changeraient sensiblement le prix ou le contenu du devis (longueur de câble, type de support, gamme voulue, état de l'existant, accès…), pose TOUTES tes questions en une seule fois dans "questions" (5 au maximum, les plus déterminantes d'abord, une question courte et précise par entrée, jamais une question dont la réponse figure déjà dans la visite). Chiffre quand même le devis avec tes meilleures hypothèses. Si rien d'important ne manque, renvoie "questions": [].

Format de ligne : {"description":"...","quantity":1,"unit":"u","price":0.00,"type":"service|material","is_optional":false,"option_reason":""}
Ajoute à la réponse : "questions":["..."]`;

// Consigne ajoutée quand l'artisan a répondu aux questions : un seul aller-retour.
export const ANSWERS_INSTRUCTION = `

PRÉCISIONS REÇUES : l'artisan a répondu à tes questions (bloc « PRÉCISIONS DE L'ARTISAN »). Elles priment sur tes hypothèses : corrige le devis en conséquence et renvoie "questions": [] — aucune nouvelle question.`;

/**
 * Normalise les réponses de l'artisan : ne garde que les questions répondues.
 * @param {Array<{question: string, answer: string}>} answers
 */
export const answeredPairs = (answers) =>
    (Array.isArray(answers) ? answers : [])
        .map((a) => ({ question: String(a?.question ?? '').trim(), answer: String(a?.answer ?? '').trim() }))
        .filter((a) => a.question && a.answer);

/** Bloc « PRÉCISIONS DE L'ARTISAN » à ajouter au message, vide sans réponse. */
export const buildAnswersBlock = (answers) => {
    const pairs = answeredPairs(answers);
    if (!pairs.length) return '';
    return 'PRÉCISIONS DE L\'ARTISAN (réponses à tes questions) :\n'
        + pairs.map((a) => `- ${a.question}\n  → ${a.answer}`).join('\n');
};

export const MAX_QUESTIONS = 5;

/** Questions renvoyées par le modèle : chaînes non vides, dédoublonnées, plafonnées. */
export const normalizeQuestions = (raw) => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const q of raw) {
        const text = typeof q === 'string' ? q.trim() : typeof q?.question === 'string' ? q.question.trim() : '';
        if (!text || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        out.push(text);
        if (out.length === MAX_QUESTIONS) break;
    }
    return out;
};

// Repères de durée propres à l'électricité, tirés de la même skill.
const ELECTRICIAN_BENCHMARKS = `
REPÈRES ÉLECTRICITÉ (à ajuster selon le support et l'accès relevés) : pose d'une prise ou d'un interrupteur en rénovation ≈ 0,5 h ; point lumineux ≈ 0,75 h ; remplacement d'un tableau 12 disjoncteurs ≈ 4 h ; saignée + rebouchage : compter en plus. Protections et section des câbles conformes NF C 15-100.`;

/** Métier normalisé (clés françaises de TRADE_CONFIG). */
const normalizeTrade = (trade) => LEGACY_TRADE_KEY_MAP[trade] || trade || '';

/** Méthode complète pour un métier donné. */
export const buildSiteVisitMethod = (trade) =>
    SITE_VISIT_METHOD + (normalizeTrade(trade) === 'electricien' ? ELECTRICIAN_BENCHMARKS : '');

// ── Devis Pro rédigé depuis une description ──────────────────────────────
// La même skill, appliquée à l'Assistant du formulaire de devis : au lieu de
// quelques lignes de 8 mots, l'artisan Pro reçoit un devis complet comme il
// le ferait à la main — titre, objet des travaux, lignes détaillées rangées
// par lot, options hors total avec leur raison, réserves, et les questions
// qui manquent pour chiffrer juste.

export const QUOTE_PRO_METHOD = `

MÉTHODE DE CHIFFRAGE (prioritaire sur toute autre consigne de contenu, y compris sur la longueur des descriptions) :

0. LIRE LA DEMANDE COMME UN ARTISAN. La description est écrite ou dictée vite, sur le chantier ou dans le camion : abréviations, fautes, phrases incomplètes.
   - Dresse d'abord pour toi la liste des TRAVAUX DEMANDÉS et des CONSTATS (existant, longueurs, supports, accès). Ce qui n'est pas demandé n'est pas un travail à chiffrer.
   - Les heures, quantités et prix donnés par l'artisan font autorité : reprends-les tels quels, sans les discuter.
   - Chiffre ensuite CHAQUE travail demandé, entièrement : rien d'oublié (alimentation, protection, raccordement, mise en service), rien d'ajouté (voir 1).

${TRI_RULE}

2. INTERDITS :
   - Aucune montée en gamme non demandée. Si le client a choisi une marque ou une gamme, chiffre dans SA gamme (l'alternative va dans "suggestions", jamais au chiffrage).
   - Aucune provision « au cas où » dans les prix. Une incertitude sur l'ampleur des travaux devient une RÉSERVE écrite (voir 9) annonçant un avenant.
   - Aucune obligation inventée : une recommandation fabricant, une règle « sauf justification par le calcul » ou une bonne pratique ne sont PAS des obligations.
   - Aucune référence fabricant, aucun code article ni marque dans les désignations : le devis ne doit pas servir de liste de courses au client.

3. MAIN D'ŒUVRE : lignes "service" en heures (unit "h", quantity = nombre d'heures, price = taux horaire de l'artisan), une ligne par poste réel (dépose, pose, raccordement, essais et mise en service…), jamais une seule ligne vague pour tout le chantier. Estime les durées comme un artisan expérimenté.

4. FOURNITURES : lignes "material" détaillées, une ligne par élément avec sa quantité réelle. N'oublie pas le petit matériel indispensable à la pose (boîtes, câbles, gaines, fixations).

5. DÉSIGNATIONS : précises et professionnelles, 90 caractères au maximum, sans retour à la ligne. Désignation générique + caractéristique utile + usage quand il éclaire le client (ex. « Interrupteur différentiel 40 A 30 mA type A — circuits cuisine », « Saignées, passage des câbles et rebouchage au plâtre »).

6. LOTS : chaque ligne porte "lot", la zone de travail ou l'ensemble cohérent auquel elle appartient (ex. « Tableau électrique », « Cuisine », « Extérieur »). La main d'œuvre et les fournitures d'un même lot portent le même "lot". Range les lignes lot par lot. Sur un petit chantier d'un seul tenant, "lot": "" partout.

7. PRIX : prix de vente HT. Reprends la bibliothèque de l'artisan quand elle couvre la ligne. Pour une fourniture absente de la bibliothèque, prends un prix de vente marché réaliste et marque la ligne "price_estimated": true pour que l'artisan le vérifie. Les lignes "is_optional" n'entrent pas dans le total.

8. TITRE ET OBJET :
   - "title" : nom court du projet, 8 mots au maximum, pas une phrase.
   - "work_object" : le périmètre en 2 à 4 phrases (600 caractères au maximum) — ce qui est compris, ce qui ne l'est pas, les constats qui conditionnent le prix. En rénovation partielle, précise que seul ce qui est créé ou remplacé est mis aux normes. Aucune liste de postes, aucun montant.

9. RÉSERVES : "reserves" = 3 à 6 phrases courtes, propres à CE chantier : hypothèses non vérifiables (supports, réseaux ou câbles existants non visibles avant démontage), défauts observés hors périmètre et laissés en l'état, ce qui n'est pas compris (finitions, peinture, plâtrerie, raccordement par un autre corps d'état…), et le principe d'un avenant signé pour tout travail supplémentaire. Ne recopie pas les mentions légales génériques, déjà imprimées sur le devis.

10. Si le total ferme dépasse 5 000 € HT, ajoute dans "suggestions" : « Devis > 5 000 € HT : proposer une étude technique préalable payante, déductible en cas de signature. »

11. PRÉCISIONS À DEMANDER : s'il manque des informations qui changeraient sensiblement le prix ou le contenu du devis (longueur de câble, type de support, gamme voulue, état de l'existant, accès, heures prévues…), pose TOUTES tes questions en une seule fois dans "questions" (5 au maximum, les plus déterminantes d'abord, une question courte et précise par entrée, jamais une question dont la réponse figure déjà dans la demande). Chiffre quand même le devis avec tes meilleures hypothèses. Si rien d'important ne manque, renvoie "questions": [].

JSON UNIQUEMENT — pas de markdown, pas de texte avant/après :
{"title":"...","work_object":"...","items":[{"description":"...","quantity":1,"unit":"u","price":0.00,"type":"service|material","lot":"...","is_optional":false,"option_reason":"","price_estimated":false}],"reserves":["..."],"suggestions":["..."],"questions":["..."],"estimated_duration":"X jours"}`;

/** Méthode Pro complète pour un métier donné. */
export const buildQuoteProMethod = (trade) =>
    QUOTE_PRO_METHOD + (normalizeTrade(trade) === 'electricien' ? ELECTRICIAN_BENCHMARKS : '');

// Réserves renvoyées par le modèle : phrases non vides, dédoublonnées, plafonnées.
export const MAX_RESERVES = 8;

export const normalizeReserves = (raw) => {
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\n+/) : [];
    const seen = new Set();
    const out = [];
    for (const r of list) {
        const text = typeof r === 'string' ? r.replace(/^\s*[-•*]\s*/, '').replace(/\s+/g, ' ').trim() : '';
        if (!text || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        out.push(text);
        if (out.length === MAX_RESERVES) break;
    }
    return out;
};

/** Bloc « Réserves » prêt à rejoindre les notes du devis, vide sans réserve. */
export const formatReservesBlock = (reserves) => {
    const list = normalizeReserves(reserves);
    if (!list.length) return '';
    return 'Réserves :\n' + list.map((r) => `- ${r}`).join('\n');
};

/**
 * Lignes du devis Pro → lignes du formulaire : un titre de section est inséré
 * à chaque changement de lot (comme l'import CSV), une option garde sa raison
 * visible du client, un prix estimé est signalé dans la note interne.
 */
export const proItemsToFormItems = (items, idBase = Date.now()) => {
    const out = [];
    let currentLot = null;
    let n = 0;
    const nextId = () => idBase + (n++);
    for (const item of Array.isArray(items) ? items : []) {
        const lot = typeof item.lot === 'string' ? item.lot.trim() : '';
        if (lot && lot !== currentLot) {
            out.push({ id: nextId(), description: lot, type: 'section' });
        }
        currentLot = lot || currentLot;
        out.push({
            id: nextId(),
            description: item.is_optional && item.option_reason
                ? `${item.description} — ${item.option_reason}`
                : item.description,
            quantity: Number(item.quantity) || 1,
            unit: item.unit || 'u',
            price: Number(item.price) || 0,
            buying_price: 0,
            type: item.type === 'material' ? 'material' : 'service',
            ...(item.is_optional ? { is_optional: true } : {}),
            ...(item.price_estimated ? { internal_note: "Prix estimé par l'appli, à vérifier" } : {}),
        });
    }
    return out;
};

// Nombre maximal de lignes de bibliothèque envoyées au modèle. Une
// bibliothèque réelle compte des milliers d'articles : en envoyer 120 à chaque
// appel pesait ≈ 4 000 tokens, payés à chaque chiffrage, pour une poignée
// d'articles réellement utiles.
export const PRICE_LIBRARY_MAX_LINES = 40;

// Mots qui ne disent rien du chantier : ils faisaient remonter des articles
// sans rapport (« pour », « avec », « pose » se trouvent partout).
const STOPWORDS = new Set([
    'les', 'des', 'une', 'aux', 'pour', 'avec', 'sans', 'dans', 'sur', 'sous', 'par', 'entre',
    'est', 'sont', 'qui', 'que', 'quoi', 'dont', 'son', 'ses', 'leur', 'leurs', 'cette', 'ces',
    'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'mais', 'donc', 'car', 'pas', 'non', 'oui',
    'client', 'cliente', 'chez', 'faire', 'fait', 'mettre', 'mis', 'prevoir', 'environ', 'deja',
    'pose', 'poser', 'fourniture', 'fournir', 'main', 'oeuvre', 'mise', 'place', 'compris', 'comprise',
    'travaux', 'chantier', 'existant', 'existante', 'neuf', 'neuve', 'type', 'modele',
]);

// Minuscules sans accents, mots de 3 lettres et plus hors mots vides, au
// singulier (« prises » trouve « Prise 2P+T »).
const tokenize = (text) =>
    String(text ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .map((w) => (w.length > 4 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

const fmtPrice = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');

/**
 * Bloc « BIBLIOTHÈQUE DE PRIX » : les prix de vente que l'artisan pratique
 * réellement, limités aux articles qui parlent du chantier — ceux dont la
 * désignation partage des mots avec le texte, les plus proches d'abord.
 *
 * @param {Array} library - lignes price_library ({description, price, unit, type, category})
 * @param {string} visitText - texte du chantier (description, relevé, notes, photos)
 * @returns {string} bloc à ajouter au prompt, vide si aucun article ne correspond
 */
export const buildPriceLibraryPrompt = (library, visitText = '', max = PRICE_LIBRARY_MAX_LINES) => {
    const words = new Set(tokenize(visitText));
    if (!words.size) return '';

    const picked = (Array.isArray(library) ? library : [])
        .filter((it) => it && typeof it.description === 'string' && it.description.trim()
            && Number.isFinite(Number(it.price)) && Number(it.price) > 0)
        .map((it, i) => {
            const own = new Set(tokenize(it.description));
            const score = [...own].filter((w) => words.has(w)).length;
            // À score égal, l'article le plus spécifique (peu de mots hors
            // sujet) passe devant.
            return { it, i, score, ratio: own.size ? score / own.size : 0 };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || b.ratio - a.ratio || a.i - b.i)
        .slice(0, max)
        .map((s) => s.it);
    if (!picked.length) return '';

    const lines = picked.map((it) => {
        const kind = it.type === 'service' ? 'MO' : 'fourniture';
        return `- ${it.description.trim()} | ${it.unit || 'u'} | ${fmtPrice(Number(it.price))} € HT | ${kind}`;
    });

    return `

BIBLIOTHÈQUE DE PRIX DE L'ARTISAN (ses prix de vente réels) :
Quand une ligne du devis correspond à un article ci-dessous, reprends SA désignation et SON prix tels quels. N'estime un prix marché que pour ce qui n'y figure pas.
${lines.join('\n')}`;
};

// ── Lecture des photos de visite ──────────────────────────────────────────
// Une description générique (« état des surfaces, matériaux visibles ») noyait
// le chiffrage sous des constats inutiles et lui suggérait des travaux que
// personne n'avait demandés. La photo ne sert qu'à préciser l'existant.

const PHOTO_GENERIC_FOCUS = 'matériaux et supports visibles, équipements existants et leur état, dimensions approximatives, contraintes d\'accès';

const PHOTO_ELECTRICIAN_FOCUS = `- Tableau : type (coffret, GTL), nombre de rangées, modules libres, interrupteurs différentiels (calibre, 30 mA, type AC/A/F), disjoncteurs et calibres lisibles, peignes, présence d'un disjoncteur de branchement.
- Terre et liaisons : barrette de terre, conducteur de terre visible ou absent.
- Câblage : sections lisibles, câbles apparents, goulottes, gaines, état (isolant abîmé, fils sans protection).
- Supports et cheminements : placo, brique, béton, faux plafond, combles accessibles — ce qui conditionne saignées et passages.
- Appareillage : prises, interrupteurs, points lumineux visibles et leur état.
- Écarts visibles à la NF C 15-100, uniquement s'ils sont certains sur la photo.`;

/**
 * Consignes d'analyse d'une photo de visite, adaptées au métier.
 * @returns {{systemPrompt: string, userPrompt: string}}
 */
export const buildSitePhotoPrompts = (trade) => {
    const isElec = normalizeTrade(trade) === 'electricien';
    return {
        systemPrompt: `Tu assistes un ${isElec ? 'électricien expérimenté' : 'artisan du bâtiment expérimenté'} pendant une visite avant devis. Décris UNIQUEMENT ce qui est visible et utile au chiffrage, en phrases courtes, sans conseil ni liste de travaux à proposer — c'est l'artisan qui décide des travaux.
Points à relever :
${isElec ? PHOTO_ELECTRICIAN_FOCUS : `- ${PHOTO_GENERIC_FOCUS}.`}
Si un élément n'est pas lisible, dis-le plutôt que de le deviner. 8 lignes au maximum.`,
        userPrompt: 'Relève les constats de cette photo de visite.',
    };
};
