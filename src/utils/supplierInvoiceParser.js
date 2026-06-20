// ──────────────────────────────────────────────────────────────────────────────
// Aide à l'import des factures fournisseurs (matériel) et au comparateur d'achats.
//
// On réutilise l'extracteur de lignes générique de documentParser (parseQuoteItems)
// — il reconnaît déjà les tableaux "désignation / quantité / prix unitaire" — et on
// y ajoute :
//   • normalizeProductKey : une clé de regroupement (même produit chez plusieurs
//     fournisseurs) robuste aux accents, à la casse et à la ponctuation ;
//   • guessSupplierName   : une heuristique simple pour le nom du fournisseur
//     (en-tête de la facture), en repli si l'IA n'est pas disponible ;
//   • parseSupplierInvoiceText : assemble le tout en un objet exploitable.
// ──────────────────────────────────────────────────────────────────────────────

import { parseQuoteItems, extractQuoteMetadata } from './documentParser';

/**
 * Construit la clé de regroupement d'un produit.
 * Deux libellés qui désignent le même article doivent produire la même clé.
 * On garde les dimensions/sections (ex. "3G2.5") car elles distinguent de vrais
 * produits différents ; on ne retire que le bruit (accents, ponctuation, casse,
 * espaces multiples).
 *
 * @param {string} name      Libellé du produit
 * @param {string} [reference] Référence article (optionnelle) — concaténée si présente
 * @returns {string} clé normalisée (vide si rien d'exploitable)
 */
export const normalizeProductKey = (name, reference = '') => {
    const base = `${name || ''}`.trim();
    if (!base) return '';
    let key = base
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')     // ponctuation → espace
        .replace(/\s+/g, ' ')
        .trim();
    // La référence article, quand elle existe, fiabilise le regroupement.
    const ref = `${reference || ''}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
    if (ref && ref.length >= 3) key = `${key} #${ref}`;
    return key;
};

/**
 * Heuristique de détection du nom du fournisseur à partir du texte brut.
 * Les factures placent presque toujours la raison sociale de l'émetteur tout
 * en haut. On prend la première ligne "propre" (ni date, ni montant, ni champ
 * administratif évident) parmi les premières lignes du document.
 *
 * @param {string} text Texte brut extrait du PDF
 * @returns {string} nom probable du fournisseur (vide si rien de convaincant)
 */
export const guessSupplierName = (text) => {
    if (!text) return '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 15);
    const SKIP = /(facture|devis|bon de|n°|date|tva|siret|siren|rcs|tél|tel|email|e-mail|www|http|adresse|client|code postal|page|montant|total|€)/i;
    for (const line of lines) {
        if (line.length < 3 || line.length > 60) continue;
        if (SKIP.test(line)) continue;
        if (/^\d/.test(line)) continue;                 // commence par un chiffre (adresse, montant)
        if (/^[^a-zA-ZÀ-ÿ]+$/.test(line)) continue;     // pas de lettres
        const letters = line.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
        if (letters < 3) continue;
        return line.replace(/\s+/g, ' ').trim();
    }
    return '';
};

/**
 * Extraction par regex (gratuite, hors-ligne) d'une facture fournisseur.
 * Sert de base et de repli quand l'IA n'est pas disponible.
 *
 * @param {string} text Texte brut extrait du PDF
 * @returns {{ supplier_name: string, invoice_number: string, invoice_date: string,
 *             items: Array<{product_name, reference, quantity, unit, unit_price, total_price}> }}
 */
export const parseSupplierInvoiceText = (text) => {
    const { items: rawItems } = parseQuoteItems(text || '');
    const meta = extractQuoteMetadata(text || '');

    const items = rawItems
        .filter(it => it.type !== 'section' && it.description)
        .map(it => {
            const quantity = Number(it.quantity) || 1;
            const unitPrice = Number(it.price) || 0;
            return {
                product_name: it.description,
                reference: '',
                quantity,
                unit: it.unit || 'u',
                unit_price: unitPrice,
                total_price: Math.round(unitPrice * quantity * 100) / 100,
            };
        })
        .filter(it => it.product_name.length > 1);

    // N° de facture : "Facture n° 12345" / "FACTURE N°FA-2026-001"
    const invMatch = (text || '').match(/facture\s*(?:n[°o]|num[ée]ro)?\s*[:.]?\s*([A-Za-z0-9\-/_.]{2,30})/i);

    return {
        supplier_name: guessSupplierName(text),
        invoice_number: invMatch ? invMatch[1].replace(/[.,;]+$/, '') : '',
        invoice_date: meta.date || '',
        items,
    };
};

/**
 * Convertit une date "JJ/MM/AAAA" (ou variantes) en ISO "AAAA-MM-JJ".
 * Renvoie null si non reconnue.
 */
export const toISODate = (raw) => {
    if (!raw) return null;
    const s = String(raw).trim();
    // Déjà ISO ?
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (!m) return null;
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    const dd = d.padStart(2, '0');
    const mm = mo.padStart(2, '0');
    if (Number(mm) > 12 || Number(dd) > 31) return null;
    return `${y}-${mm}-${dd}`;
};
