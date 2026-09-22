/**
 * Utility functions to parse voice transcripts into structured data using Regex/Heuristics.
 * "Free AI" approach running entirely on the client.
 */

// Common patterns
const PHONE_REGEX = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/;
const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.[a-z]{2,}/i;

export const parseClientVoice = (text) => {
    if (!text) return {};

    const result = {
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: ''
    };

    // 1. Extract Phone
    const phoneMatch = text.match(PHONE_REGEX);
    if (phoneMatch) {
        result.phone = phoneMatch[0].replace(/[\s.-]/g, ''); // Clean phone
        // Remove phone from text to avoid confusion? careful
    }

    // 2. Extract Email
    // Voice often says "arobase" or "point"
    let cleanTextForEmail = text.toLowerCase()
        .replace(/\s+arobase\s+/g, '@')
        .replace(/\s+point\s+/g, '.');
    const emailMatch = cleanTextForEmail.match(EMAIL_REGEX);
    if (emailMatch) {
        result.email = emailMatch[0];
    }

    // 3. Extract Name
    // Heuristic: "Client [Name]" or "Nouveau client [Name]" or "Je veux créer [Name]"
    // Or simply take the first few words if it looks like a name?
    // Let's look for "Client" keyword
    const clientKeyword = text.match(/(?:client|monsieur|madame|mme|mr)\s+([a-zà-ÿ\s]+)(?:au|téléphone|habite|adresse|$)/i);
    if (clientKeyword) {
        result.name = clientKeyword[1].trim();
    }

    // 4. Extract Address
    // "habitant à [Address]", "adresse [Address]"
    const addressMatch = text.match(/(?:habitant|habite|adresse|au)\s+(?:à|au)?\s*([^.,]+)/i);
    if (addressMatch) {
        // Filter out simple connectors if captured
        let addr = addressMatch[1].trim();
        // naive check to see if it's just a phone number fragment
        if (!addr.match(/^\d+$/)) {
            result.address = addr;
        }
    }

    // If no specific extraction, put everything in notes as fallback
    if (!result.name && !result.email && !result.phone) {
        result.notes = text;
    }

    return result;
};

// ── Dictée d'une ligne de devis ─────────────────────────────────────────────
//
// Exemples compris :
//   « Pose de 10 prises doubles à 45 euros »
//   « 50 mètres de câble 3G2,5 à 1,20 euro le mètre »
//   « Main d'œuvre 3 heures à 45 euros de l'heure »
//   « Disjoncteur différentiel 30 mA type A à 65 € »   (30 mA n'est PAS une quantité)
//   « Cinq spots LED pour 200 euros en tout »         (prix total ÷ quantité)
//   « Tableau électrique complet forfait 850 euros »

const NUMBER_WORDS = {
    zéro: 0, zero: 0, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
    vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    cent: 100, cents: 100, un: 1, une: 1,
};
const NUMBER_WORD_RE = new RegExp(
    `(^|[^\\p{L}\\d'’-])((?:${Object.keys(NUMBER_WORDS).join('|')})(?:(?:-|\\s+et\\s+|\\s+)(?:${Object.keys(NUMBER_WORDS).join('|')}))*)(?=$|[^\\p{L}\\d-])`,
    'giu'
);

/** « vingt-cinq » → 25, « quatre-vingt-dix » → 90, « trente et un » → 31. */
const wordsToNumber = (words) => {
    const parts = words.toLowerCase().split(/-|\s+et\s+|\s+/).filter(Boolean);
    let value = 0;
    parts.forEach((p, idx) => {
        const n = NUMBER_WORDS[p];
        if (n === 100) value = (value || 1) * 100;
        else if (n === 20 && parts[idx - 1] === 'quatre') value += 80 - 4;
        else value += n;
    });
    return value;
};

/**
 * Remplace les nombres dictés en toutes lettres par des chiffres. « un/une »
 * seuls restent tels quels (article : « une prise » = quantité 1 par défaut).
 */
export const normalizeSpokenNumbers = (text) => text.replace(NUMBER_WORD_RE, (m, before, words, offset) => {
    if (/^(un|une)$/i.test(words.trim())) return m;
    // « neuf » seul est souvent l'adjectif (« tableau neuf ») : on ne le
    // convertit qu'en début de phrase ou après « de » (« pose de neuf prises »).
    if (/^neuf$/i.test(words.trim())) {
        const prev = text.slice(0, offset + before.length);
        if (prev.trim() && !/(?:^|\s)(?:de|d['’])\s*$/i.test(prev)) return m;
    }
    return `${before}${wordsToNumber(words)}`;
});

// Unités de mesure qui suivent une quantité → unité de la ligne.
const MEASURE_UNITS = [
    { re: /^\s*(?:m2|m²|mètres?\s+carrés?|metres?\s+carres?)(?![\p{L}\d])/iu, unit: 'm²' },
    { re: /^\s*(?:ml|mètres?\s+linéaires?|metres?\s+lineaires?|mètres?|metres?|m)(?![\p{L}\d²])/iu, unit: 'ml' },
    { re: /^\s*(?:heures?|h)(?![\p{L}\d])/iu, unit: 'h' },
    { re: /^\s*(?:jours?|j)(?![\p{L}\d])/iu, unit: 'j' },
    { re: /^\s*forfaits?(?![\p{L}\d])/iu, unit: 'forfait' },
];

// Grandeurs techniques : « 30 mA », « 16 A », « 2,5 mm² », « 1,5 carré »,
// « 3000 W »… ce sont des caractéristiques, pas des quantités.
const TECH_AFTER = /^\s*(?:mA|A|V|W|VA|kW|kVA|kWh|P|mm²|mm2|mm|cm|carrés?|ampères?|amperes?|volts?|watts?|pôles?|poles?|%|°)(?![\p{L}\d])/u;

const PRICE_AFTER = /^\s*(?:€|euros?(?![\p{L}]))/iu;
// Centimes dits après « euros » : « 45 euros 50 ».
const CENTS_AFTER = /^\s*(?:€|euros?)\s+(\d{1,2})(?=\s*(?:$|[,.;]|(?:le|la|l['’]|pièce|pce|ht|ttc|par|chacune?|au total|en tout|de l['’]heure)(?![\p{L}])))/iu;
const PRICE_BEFORE = /(^|[^\p{L}])((?:à|a|pour|au prix de|prix(?:\s+unitaire)?(?:\s+de)?|coût(?:\s+de)?|cout(?:\s+de)?)\s*)$/iu;
const PRICE_TAIL = /^(?:\s*(?:hors taxes?|ht|ttc))?(?:\s*(?:le|la|l['’]|par|de l['’]|du)\s*(?:mètre(?:\s+linéaire)?|metre|m|ml|m²|m2|unité|unite|pièce|piece|heure|h|jour|point|u)(?![\p{L}\d])|\s*(?:pièce|pce|chacune?|l['’]unité|l['’]un|l['’]une))?(?:\s*(?:hors taxes?|ht|ttc)(?![\p{L}]))?(?:\s*(?:au total|en tout|le tout|total))?/iu;
const TOTAL_PRICE = /(?:au total|en tout|le tout|pour l['’]ensemble)/iu;

const toNumber = (s) => parseFloat(String(s).replace(',', '.'));
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const parseQuoteItemVoice = (rawText) => {
    if (!rawText || !rawText.trim()) return null;
    const text = normalizeSpokenNumbers(rawText.trim().replace(/\s+/g, ' '));

    const result = { description: '', quantity: 1, unit: 'u', price: 0, type: 'service' };
    const removals = []; // [start, end) à retirer de la désignation

    // 1. Repérer chaque nombre et le classer : prix, grandeur technique ou quantité.
    let priceFound = null;
    let quantityFound = null;
    const numberRe = /\d+(?:[.,]\d+)?/g;
    let m;
    while ((m = numberRe.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const before = text.slice(0, start);
        const after = text.slice(end);

        // Référence produit collée à des lettres (3G2,5, H07, RO2V…) : ignorée.
        if (/[\p{L}]$/u.test(before) || /^[\p{L}²]/u.test(after) && !MEASURE_UNITS.some(u => u.re.test(after))) continue;
        if (/\dG\s*$/i.test(before)) continue; // « 3G 2,5 »

        if (PRICE_AFTER.test(after)) {
            const cents = after.match(CENTS_AFTER);
            const priceEnd = end + (cents ? cents[0].length : after.match(PRICE_AFTER)[0].length);
            const tail = text.slice(priceEnd).match(PRICE_TAIL);
            const prep = before.match(PRICE_BEFORE);
            priceFound = {
                value: toNumber(m[0]) + (cents ? toNumber(cents[1]) / 100 : 0),
                start: prep ? start - prep[2].length : start,
                end: priceEnd + (tail ? tail[0].length : 0),
            };
            continue;
        }
        if (TECH_AFTER.test(after)) continue;

        if (!quantityFound) {
            const measure = MEASURE_UNITS.find(u => u.re.test(after));
            let qEnd = end;
            if (measure) {
                qEnd += after.match(measure.re)[0].length;
                // « 50 mètres de câble » → on retire aussi le « de ».
                const de = text.slice(qEnd).match(/^\s+(?:de|d['’])\s*/i);
                if (de) qEnd += de[0].length;
            }
            quantityFound = { value: toNumber(m[0]), unit: measure ? measure.unit : 'u', start, end: qEnd };
        }
    }

    if (quantityFound && quantityFound.value > 0) {
        result.quantity = quantityFound.value;
        result.unit = quantityFound.unit;
        removals.push([quantityFound.start, quantityFound.end]);
    }
    if (priceFound) {
        result.price = priceFound.value;
        const priceText = text.slice(priceFound.start, priceFound.end);
        if (TOTAL_PRICE.test(priceText) && result.quantity > 1) {
            result.price = Math.round((priceFound.value / result.quantity) * 100) / 100;
        }
        removals.push([priceFound.start, priceFound.end]);
    }

    // 2. Forfait sans quantité : « Tableau complet forfait 850 euros ».
    const forfait = /(?:^|\s)(?:au |en |un )?forfait(?![\p{L}])/iu;
    if (result.unit === 'u' && forfait.test(text)) {
        result.unit = 'forfait';
    }

    // 3. Désignation : texte dicté sans la quantité ni le prix.
    let desc = text;
    removals.sort((a, b) => b[0] - a[0]).forEach(([a, b]) => {
        desc = `${desc.slice(0, a)} ${desc.slice(b)}`;
    });
    if (result.unit === 'forfait') desc = desc.replace(forfait, ' ');
    desc = desc
        .replace(/\s+([,.;])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(/^(?:pour|de|d['’]|des)\s+/i, '')
        .replace(/[\s,.;:–-]+$/u, '')
        .replace(/\s+(?:à|pour|de|et|au|en)$/i, '')
        .trim();
    result.description = capitalize(desc);

    // 4. Nature de la ligne : main d'œuvre par défaut, matériel si c'est dit.
    if (/^(?:fourniture|matériel|materiel|achat)\b/i.test(result.description)) {
        result.type = 'material';
    }

    return result;
};
