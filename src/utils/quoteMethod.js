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

export const SITE_VISIT_METHOD = `

MÉTHODE DE CHIFFRAGE (prioritaire sur toute autre consigne de contenu) :

1. STRICT NÉCESSAIRE DANS LE TOTAL, CONSEIL EN OPTIONS. Passe CHAQUE ligne envisagée dans ce filtre, dans l'ordre :
   a) Le client l'a demandé → ligne ferme.
   b) Exigé par la réglementation du métier (ex. électricité : NF C 15-100, NF C 14-100, Consuel) → ligne ferme.
   c) Indispensable pour que ce qui est demandé fonctionne ou soit sûr → ligne ferme.
   d) Bon conseil que l'artisan assume par écrit → ligne OPTION ("is_optional": true) avec "option_reason" : la raison en une phrase.
   e) Sinon → la ligne n'apparaît NULLE PART (ni en option, ni en suggestion).
   Trois ou quatre options au maximum : au-delà, reprends le tri.

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

Format de ligne : {"description":"...","quantity":1,"unit":"u","price":0.00,"type":"service|material","is_optional":false,"option_reason":""}`;

// Repères de durée propres à l'électricité, tirés de la même skill.
const ELECTRICIAN_BENCHMARKS = `
REPÈRES ÉLECTRICITÉ (à ajuster selon le support et l'accès relevés) : pose d'une prise ou d'un interrupteur en rénovation ≈ 0,5 h ; point lumineux ≈ 0,75 h ; remplacement d'un tableau 12 disjoncteurs ≈ 4 h ; saignée + rebouchage : compter en plus. Protections et section des câbles conformes NF C 15-100.`;

/** Métier normalisé (clés françaises de TRADE_CONFIG). */
const normalizeTrade = (trade) => LEGACY_TRADE_KEY_MAP[trade] || trade || '';

/** Méthode complète pour un métier donné. */
export const buildSiteVisitMethod = (trade) =>
    SITE_VISIT_METHOD + (normalizeTrade(trade) === 'electricien' ? ELECTRICIAN_BENCHMARKS : '');

// Nombre de lignes de bibliothèque envoyées au modèle : assez pour couvrir un
// chantier courant sans alourdir le prompt (≈ 60 caractères par ligne).
export const PRICE_LIBRARY_MAX_LINES = 120;

const tokenize = (text) =>
    String(text ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);

const fmtPrice = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');

/**
 * Bloc « BIBLIOTHÈQUE DE PRIX » : les prix de vente que l'artisan pratique
 * réellement. Quand la bibliothèque dépasse la limite, on garde les articles
 * dont la désignation partage le plus de mots avec la visite.
 *
 * @param {Array} library - lignes price_library ({description, price, unit, type, category})
 * @param {string} visitText - texte de la visite (relevé, notes, photos)
 * @returns {string} bloc à ajouter au prompt, vide si rien d'exploitable
 */
export const buildPriceLibraryPrompt = (library, visitText = '', max = PRICE_LIBRARY_MAX_LINES) => {
    const usable = (Array.isArray(library) ? library : []).filter((it) =>
        it && typeof it.description === 'string' && it.description.trim()
        && Number.isFinite(Number(it.price)) && Number(it.price) > 0);
    if (!usable.length) return '';

    let picked = usable;
    if (usable.length > max) {
        const words = new Set(tokenize(visitText));
        picked = usable
            .map((it, i) => ({
                it,
                i,
                score: tokenize(`${it.description} ${it.category || ''}`).filter((w) => words.has(w)).length,
            }))
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .slice(0, max)
            .map((s) => s.it);
    }

    const lines = picked.map((it) => {
        const kind = it.type === 'service' ? 'MO' : 'fourniture';
        return `- ${it.description.trim()} | ${it.unit || 'u'} | ${fmtPrice(Number(it.price))} € HT | ${kind}`;
    });

    return `

BIBLIOTHÈQUE DE PRIX DE L'ARTISAN (ses prix de vente réels) :
Quand une ligne du devis correspond à un article ci-dessous, reprends SA désignation et SON prix tels quels. N'estime un prix marché que pour ce qui n'y figure pas.
${lines.join('\n')}`;
};
