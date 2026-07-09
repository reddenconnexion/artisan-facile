import { suggestedSellingPrice } from './priceLibraryCsv';

// Mise au catalogue (Bibliothèque de Prix) du matériel de l'utilitaire
// « À commander ». Quand un artisan a constaté le prix d'achat réel et le
// fournisseur d'un matériel, on le remonte au BPU pour préremplir les prochains
// devis — sans jamais dupliquer un article déjà connu.

const numberChanged = (a, b) => Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) > 0.009;

// Une ligne « à commander » n'est répertoriable que si elle porte au moins un
// signal de prix : un prix d'achat constaté ou un prix de vente issu du devis.
export const isCatalogable = (item) =>
    !!(item && (item.description || '').trim()
        && ((parseFloat(item.buying_price) || 0) > 0 || (parseFloat(item.sale_price) || 0) > 0));

/**
 * Répartit des lignes « à commander » entre créations et mises à jour du
 * catalogue, par matching sur la description (trim + minuscules).
 *
 * - price      ← prix de vente du devis ; à défaut, prix d'achat × coefficient.
 * - buying_price ← prix d'achat constaté (jamais remis à 0 sur un existant).
 * - supplier   ← fournisseur saisi au bureau.
 * Les mises à jour partent d'un spread de l'article existant (préserve id,
 * user_id, stock, référence…) et n'écrasent que ce qui a réellement changé.
 *
 * @returns {{ toInsert: Array, toUpdate: Array, skipped: number }}
 */
export const buildCatalogUpsert = (procItems, existingLibrary, userId, { coefficient = 0 } = {}) => {
    const byDescription = new Map();
    for (const it of existingLibrary || []) {
        if (it.description) byDescription.set(String(it.description).trim().toLowerCase(), it);
    }

    const toInsert = [];
    const toUpdate = [];
    const seen = new Set();
    let skipped = 0;

    for (const p of procItems || []) {
        if (!isCatalogable(p)) { skipped += 1; continue; }
        const description = String(p.description).trim();
        const key = description.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const buying = parseFloat(p.buying_price) || 0;
        let price = parseFloat(p.sale_price);
        if (!Number.isFinite(price) || price <= 0) {
            const suggested = suggestedSellingPrice(buying, coefficient);
            price = suggested !== null ? suggested : 0;
        }
        const supplier = String(p.supplier || '').trim();
        const existing = byDescription.get(key);

        if (!existing) {
            toInsert.push({
                user_id: userId,
                description,
                price,
                buying_price: buying,
                unit: p.unit || 'unité',
                category: '',
                type: 'material',
                supplier: supplier || null,
            });
            continue;
        }

        const updated = { ...existing };
        let changed = false;
        if (price > 0 && numberChanged(existing.price, price)) { updated.price = price; changed = true; }
        if (buying > 0 && numberChanged(existing.buying_price, buying)) { updated.buying_price = buying; changed = true; }
        if (supplier && supplier !== (existing.supplier || '')) { updated.supplier = supplier; changed = true; }
        if (changed) { updated.updated_at = new Date(); toUpdate.push(updated); }
    }

    return { toInsert, toUpdate, skipped };
};
