// Parse a voice transcript or free-text line into one or more procurement items.
// Handles French phrasing typical on a job site:
//   "trois mètres de gaine ICTA, cinq boîtes de dérivation et deux disjoncteurs"
//   → [
//       { quantity: 3, unit: 'm',    description: 'gaine ICTA' },
//       { quantity: 5, unit: 'u',    description: 'boîtes de dérivation' },
//       { quantity: 2, unit: 'u',    description: 'disjoncteurs' },
//     ]
//
// Falls back to a single item with quantity 1 if no number is detected.

const NUM_WORDS = {
    'un': 1, 'une': 1,
    'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5, 'six': 6,
    'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
    'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14, 'quinze': 15,
    'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50,
    'soixante': 60, 'cent': 100, 'cents': 100,
};

const UNIT_ALIASES = {
    'm': 'm', 'mètre': 'm', 'mètres': 'm', 'metre': 'm', 'metres': 'm',
    'cm': 'cm', 'centimètre': 'cm', 'centimètres': 'cm',
    'mm': 'mm', 'millimètre': 'mm', 'millimètres': 'mm',
    'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'kilogramme': 'kg', 'kilogrammes': 'kg',
    'g': 'g', 'gramme': 'g', 'grammes': 'g',
    'l': 'L', 'litre': 'L', 'litres': 'L',
    'ml': 'mL', 'millilitre': 'mL', 'millilitres': 'mL',
    'sac': 'sac', 'sacs': 'sacs',
    'boîte': 'boîte', 'boîtes': 'boîtes', 'boite': 'boîte', 'boites': 'boîtes',
    'paquet': 'paquet', 'paquets': 'paquets',
    'rouleau': 'rouleau', 'rouleaux': 'rouleaux',
    'palette': 'palette', 'palettes': 'palettes',
    'pack': 'pack', 'packs': 'pack',
    'carton': 'carton', 'cartons': 'cartons',
};

const splitOnSeparators = (text) =>
    text
        // Some speech-to-text engines insert "virgule" verbatim
        .replace(/\s+virgule\s+/gi, ', ')
        .replace(/\s+puis\s+/gi, ', ')
        .replace(/\s+ensuite\s+/gi, ', ')
        .split(/[,;\n]|(?:\s+(?:et|plus)\s+)/i)
        .map(s => s.trim())
        .filter(Boolean);

const parseNumber = (token) => {
    if (!token) return null;
    const t = token.toLowerCase();
    if (/^\d+(?:[.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
    if (NUM_WORDS[t] != null) return NUM_WORDS[t];
    return null;
};

const parseSingleItem = (raw) => {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;

    const tokens = cleaned.split(' ');
    let quantity = 1;
    let unit = 'u';
    let rest = tokens;

    const firstNum = parseNumber(tokens[0]);
    if (firstNum != null) {
        quantity = firstNum;
        rest = tokens.slice(1);

        // Optional unit right after the number — drop "de"/"d'" liaison word
        if (rest.length && UNIT_ALIASES[rest[0].toLowerCase()]) {
            unit = UNIT_ALIASES[rest[0].toLowerCase()];
            rest = rest.slice(1);
            if (rest.length && /^d['e]$|^de$/i.test(rest[0])) {
                rest = rest.slice(1);
            }
        }
    }

    const description = rest.join(' ').trim();
    if (!description) return null;

    return {
        quantity,
        unit,
        description: description.charAt(0).toUpperCase() + description.slice(1),
    };
};

export const parseProcurementTranscript = (text) => {
    if (!text || typeof text !== 'string') return [];
    const segments = splitOnSeparators(text);
    if (segments.length === 0) return [];
    return segments
        .map(parseSingleItem)
        .filter(Boolean);
};
