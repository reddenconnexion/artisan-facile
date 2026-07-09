import Papa from 'papaparse';

// Import des lignes d'un devis depuis un fichier CSV (export Excel/LibreOffice,
// chiffrage préparé dans un tableur, export d'un autre logiciel…).
//
// Format attendu : une ligne d'en-têtes puis une ligne par prestation. Seule la
// colonne « Description » est obligatoire ; tout le reste a une valeur par
// défaut. Les intitulés d'en-têtes courants (FR/EN) sont reconnus, le
// séparateur (";" prioritaire, puis tabulation, puis ",") est déduit de la
// ligne d'en-têtes, les champs entre guillemets sont respectés et les nombres
// au format français ("1 234,56 €") sont compris.
//
// Sections : soit une colonne « Section » (ou Lot/Groupe/Catégorie) — un titre
// de section est inséré à chaque changement de valeur — soit des lignes dont la
// colonne Type vaut « section ».

export const HEADER_ALIASES = {
    description: ['description', 'désignation', 'designation', 'libellé', 'libelle', 'ouvrage', 'prestation', 'intitulé', 'intitule', 'nom'],
    quantity: ['quantité', 'quantite', 'qté', 'qte', 'qty', 'quantity'],
    unit: ['unité', 'unite', 'unit', 'u'],
    price: ['prix unitaire', 'prix u. ht', 'prix u ht', 'pu ht', 'pu', 'prix u.', 'prix u', 'prix ht', 'prix', 'price', 'unit price', 'tarif'],
    buying_price: ["prix d'achat", 'prix achat', 'achat u.', 'achat', 'buying_price', 'coût', 'cout', 'cost'],
    type: ['type', 'nature'],
    section: ['section', 'lot', 'groupe', 'catégorie', 'categorie', 'category'],
    optional: ['option', 'optionnel', 'optionnelle', 'optional'],
    // Texte privé de la ligne (réf fournisseur, remarque) : rejoint le
    // chiffrage interne (item.internal_note) — jamais montré au client.
    internal_note: ['référence', 'reference', 'réf', 'ref', 'référence fournisseur', 'ref fournisseur', 'note interne', 'note', 'remarque', 'internal_note'],
};

/**
 * Séparateur : décidé sur la ligne d'en-têtes, priorité au « ; » (format
 * Excel FR — la virgule y sert de séparateur décimal), puis tabulation,
 * puis virgule. On ne laisse pas l'auto-détection statistique trancher :
 * des libellés pleins de virgules (« prises, boîtes et accessoires »)
 * pourraient faire gagner la virgule sur un fichier pourtant en « ; ».
 */
const detectDelimiter = (text) => {
    const headerLine = String(text).split(/\r?\n/, 1)[0] || '';
    const outsideQuotes = headerLine.replace(/"[^"]*"/g, '');
    if (outsideQuotes.includes(';')) return ';';
    if (outsideQuotes.includes('\t')) return '\t';
    return ',';
};

/** Nombre au format français ou anglais : "1 234,56 €", "1,234.56", "12.5"… */
export const parseCsvNumber = (value) => {
    if (value === null || value === undefined) return null;
    let s = String(value).replace(/[€\s\u00a0\u202f]/g, '');
    if (!s) return null;
    if (/,\d{1,2}$/.test(s)) {
        // décimale à la française : la virgule est le séparateur décimal
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        // sinon la virgule ne peut être qu'un séparateur de milliers
        s = s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
};

const TRUTHY = /^(oui|o|x|1|true|vrai|yes|y)$/i;

const normalizeType = (raw, description) => {
    const t = String(raw || '').toLowerCase();
    if (/section|titre/.test(t)) return 'section';
    if (/mat|fourniture/.test(t)) return 'material';
    if (/serv|main|œuvre|oeuvre|presta|mo\b/.test(t)) return 'service';
    // Repli : même détection par mots-clés que la saisie manuelle du devis
    if (/fourniture|matériel|materiel|pièce|consommable/i.test(description || '')) return 'material';
    return 'service';
};

/** Résout, pour chaque champ, le nom de colonne réellement présent dans le CSV. */
const resolveColumns = (fields) => {
    const normalized = fields.map((f) => String(f || '').toLowerCase().trim());
    const mapping = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = normalized.findIndex((h) => aliases.includes(h));
        if (idx !== -1) mapping[field] = fields[idx];
    }
    return mapping;
};

/**
 * Parse un CSV de devis en lignes prêtes pour le formulaire.
 *
 * @param {string} text Contenu brut du fichier CSV.
 * @returns {{ items: Array, skipped: number, error: string|null }}
 *   `items` au format des lignes de devis ({description, quantity, unit,
 *   price, buying_price, type, is_optional}), `skipped` = lignes sans
 *   description ignorées, `error` = message bloquant (en-têtes introuvables…).
 */
export const parseQuoteCsv = (text) => {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    if (!clean.trim()) {
        return { items: [], skipped: 0, error: 'Le fichier CSV est vide.' };
    }

    const result = Papa.parse(clean, {
        header: true,
        delimiter: detectDelimiter(clean),
        skipEmptyLines: 'greedy',
        transformHeader: (h) => String(h || '').trim(),
    });

    const fields = result.meta?.fields || [];
    const cols = resolveColumns(fields);

    if (!cols.description) {
        return {
            items: [],
            skipped: 0,
            error: 'Colonne « Description » introuvable. La première ligne du CSV doit contenir des en-têtes (Description, Quantité, Unité, Prix…).',
        };
    }

    const items = [];
    let skipped = 0;
    let currentSection = null;
    const baseId = Date.now();
    const pushItem = (item) => items.push({ id: baseId + items.length, ...item });

    for (const row of result.data) {
        const description = String(row[cols.description] ?? '').trim();

        // Colonne Section/Lot : insérer un titre à chaque changement de valeur
        if (cols.section) {
            const sectionLabel = String(row[cols.section] ?? '').trim();
            if (sectionLabel && sectionLabel !== currentSection) {
                currentSection = sectionLabel;
                pushItem({ description: sectionLabel, type: 'section' });
            }
        }

        if (!description) {
            // Ligne sans description : ignorée (sauf si elle portait une section)
            if (!cols.section || !String(row[cols.section] ?? '').trim()) skipped += 1;
            continue;
        }

        const type = normalizeType(cols.type ? row[cols.type] : '', description);
        if (type === 'section') {
            currentSection = description;
            pushItem({ description, type: 'section' });
            continue;
        }

        const internalNote = String((cols.internal_note ? row[cols.internal_note] : '') ?? '').trim();
        pushItem({
            description,
            quantity: parseCsvNumber(cols.quantity ? row[cols.quantity] : null) ?? 1,
            unit: String((cols.unit ? row[cols.unit] : '') ?? '').trim() || 'u',
            price: parseCsvNumber(cols.price ? row[cols.price] : null) ?? 0,
            buying_price: parseCsvNumber(cols.buying_price ? row[cols.buying_price] : null) ?? 0,
            type,
            ...(cols.optional && TRUTHY.test(String(row[cols.optional] ?? '').trim()) ? { is_optional: true } : {}),
            ...(internalNote ? { internal_note: internalNote } : {}),
        });
    }

    if (items.filter((i) => i.type !== 'section').length === 0) {
        return {
            items: [],
            skipped,
            error: 'Aucune ligne exploitable : vérifiez que la colonne Description est remplie sous la ligne d\'en-têtes.',
        };
    }

    return { items, skipped, error: null };
};
