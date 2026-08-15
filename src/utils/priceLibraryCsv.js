import { HEADER_ALIASES, parseCsvNumber } from './quoteCsvImport';

// Import/export CSV de la Bibliothèque de Prix (BPU).
//
// Contrairement à l'import de lignes de devis (quoteCsvImport.js), les
// en-têtes « Référence »/« Réf » désignent ici la colonne `reference` du
// catalogue (réf fabricant), pas une note interne — d'où une table d'alias
// propre qui emprunte seulement les listes communes.
const CATALOG_ALIASES = {
    description: HEADER_ALIASES.description,
    price: HEADER_ALIASES.price,
    buying_price: [...HEADER_ALIASES.buying_price, 'pa'],
    unit: HEADER_ALIASES.unit,
    category: ['catégorie', 'categorie', 'category', 'famille'],
    type: ['type', 'nature'],
    barcode: ['barcode', 'ean', 'code-barres', 'code barres', 'code-barre'],
    reference: ['référence', 'reference', 'réf', 'ref', 'référence fabricant', 'ref fabricant'],
    supplier: ['fournisseur', 'supplier', 'fournisseurs'],
};

/**
 * Prix de vente suggéré = prix d'achat × coefficient de marge, arrondi au
 * centime. Retourne null si l'un des deux n'est pas exploitable (le champ
 * prix de vente reste alors à la main de l'utilisateur).
 */
export const suggestedSellingPrice = (buyingPrice, coefficient) => {
    const bp = parseFloat(buyingPrice);
    const coef = parseFloat(coefficient);
    if (!Number.isFinite(bp) || bp <= 0 || !Number.isFinite(coef) || coef <= 0) return null;
    return Math.round(bp * coef * 100) / 100;
};

/**
 * Coefficient à appliquer au prix d'achat RÉEL (fournisseur, ex. Sonepar) pour
 * retrouver un prix de vente historiquement calé sur le prix catalogue public.
 * Deux étages de marge : la marge catalogue ET la remise fournisseur.
 * @param catalogMargin       multiplicateur sur catalogue (1.25 = +25 %)
 * @param supplierDiscountPct remise obtenue vs prix public (35 = −35 %)
 * @returns coefficient arrondi au centième, ou null si entrées inexploitables
 */
export const coefficientFromCatalog = (catalogMargin, supplierDiscountPct) => {
    const m = parseFloat(catalogMargin);
    const d = parseFloat(supplierDiscountPct);
    if (!Number.isFinite(m) || m <= 0) return null;
    if (!Number.isFinite(d) || d < 0 || d >= 100) return null;
    return Math.round((m / (1 - d / 100)) * 100) / 100;
};

const normalizeCatalogType = (raw) => {
    const t = String(raw || '').toLowerCase();
    if (/mat|fourniture/.test(t)) return 'material';
    if (/serv|main|œuvre|oeuvre|presta|\bmo\b/.test(t)) return 'service';
    return '';
};

/**
 * Mappe les lignes brutes d'un import (Papa.parse header:true ou fichier
 * Excel converti en objets) vers des articles de catalogue.
 *
 * Une ligne est retenue si elle a une description et un prix de vente —
 * fourni par le fichier, ou calculé depuis le prix d'achat quand un
 * coefficient de marge est configuré. Les « acompte » sont exclus.
 *
 * @returns {{ rows: Array<{description, price, buying_price, unit, category, type, barcode, reference}>, skipped: number }}
 */
export const mapImportedRows = (data, { coefficient = 0 } = {}) => {
    const rows = [];
    let skipped = 0;

    for (const raw of data || []) {
        const keys = Object.keys(raw).reduce((acc, key) => {
            acc[String(key).toLowerCase().trim()] = raw[key];
            return acc;
        }, {});
        const pick = (field) => {
            for (const alias of CATALOG_ALIASES[field]) {
                if (keys[alias] !== undefined && keys[alias] !== null && String(keys[alias]).trim() !== '') {
                    return keys[alias];
                }
            }
            return null;
        };

        const description = String(pick('description') ?? '').trim();
        if (!description || description.toLowerCase().includes('acompte')) {
            if (description) skipped += 1;
            else if (Object.values(keys).some((v) => String(v ?? '').trim() !== '')) skipped += 1;
            continue;
        }

        const buyingPrice = parseCsvNumber(pick('buying_price'));
        let price = parseCsvNumber(pick('price'));
        if (price === null) price = suggestedSellingPrice(buyingPrice, coefficient);
        if (price === null) {
            skipped += 1;
            continue;
        }

        rows.push({
            description,
            price,
            buying_price: buyingPrice ?? 0,
            unit: String(pick('unit') ?? '').trim(),
            category: String(pick('category') ?? '').trim(),
            type: normalizeCatalogType(pick('type')),
            barcode: String(pick('barcode') ?? '').trim(),
            reference: String(pick('reference') ?? '').trim(),
            supplier: String(pick('supplier') ?? '').trim(),
        });
    }

    return { rows, skipped };
};

const numberChanged = (a, b) => Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) > 0.009;

/**
 * Répartit les lignes importées entre créations et mises à jour, par matching
 * contre le catalogue existant : code-barres exact, sinon référence
 * (insensible à la casse), sinon description (trim + minuscules).
 *
 * Les mises à jour partent d'un spread de l'article existant (préserve id,
 * user_id, stock…) et n'écrasent que les champs renseignés dans le fichier ;
 * en particulier un prix d'achat connu n'est jamais remis à 0.
 *
 * @returns {{ toInsert: Array, toUpdate: Array }}
 */
export const splitUpsert = (rows, existingItems, userId) => {
    const byBarcode = new Map();
    const byReference = new Map();
    const byDescription = new Map();
    for (const item of existingItems || []) {
        if (item.barcode) byBarcode.set(String(item.barcode).trim(), item);
        if (item.reference) byReference.set(String(item.reference).trim().toLowerCase(), item);
        if (item.description) byDescription.set(String(item.description).trim().toLowerCase(), item);
    }

    const toInsert = [];
    const toUpdate = [];
    const seen = new Set();

    for (const row of rows || []) {
        const key = row.barcode || row.reference.toLowerCase() || row.description.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const existing =
            (row.barcode && byBarcode.get(row.barcode)) ||
            (row.reference && byReference.get(row.reference.toLowerCase())) ||
            byDescription.get(row.description.toLowerCase());

        if (!existing) {
            toInsert.push({
                user_id: userId,
                description: row.description,
                price: row.price,
                buying_price: row.buying_price || 0,
                unit: row.unit || 'unité',
                category: row.category,
                barcode: row.barcode,
                reference: row.reference,
                ...(row.supplier ? { supplier: row.supplier } : {}),
                ...(row.type ? { type: row.type } : {}),
            });
            continue;
        }

        const updated = { ...existing };
        let changed = false;
        if (numberChanged(existing.price, row.price)) {
            updated.price = row.price;
            changed = true;
        }
        if (row.buying_price > 0 && numberChanged(existing.buying_price, row.buying_price)) {
            updated.buying_price = row.buying_price;
            changed = true;
        }
        for (const field of ['unit', 'category', 'barcode', 'reference', 'supplier', 'type']) {
            if (row[field] && row[field] !== (existing[field] || '')) {
                updated[field] = row[field];
                changed = true;
            }
        }
        if (changed) toUpdate.push({ ...updated, updated_at: new Date() });
    }

    return { toInsert, toUpdate };
};

/**
 * Colonnes d'export du catalogue pour buildCsv/exportToCSV. Les libellés
 * figurent dans les alias d'import ci-dessus : un fichier exporté, complété
 * (prix d'achat…) puis réimporté met à jour les articles sans les dupliquer.
 */
export const priceLibraryCsvColumns = [
    { key: 'description', label: 'Description' },
    { key: 'reference', label: 'Référence' },
    { key: 'barcode', label: 'EAN' },
    { key: 'buying_price', label: "Prix d'achat", format: (v) => (v > 0 ? String(v) : '') },
    { key: 'price', label: 'Prix' },
    { key: 'unit', label: 'Unité' },
    { key: 'category', label: 'Catégorie' },
    { key: 'supplier', label: 'Fournisseur' },
    { key: 'type', label: 'Type', format: (v) => (v === 'material' ? 'Matériel' : "Main d'oeuvre") },
];
