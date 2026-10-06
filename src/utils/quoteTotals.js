import { effectiveLineCost } from './quoteInternalDetail';

// Totaux d'un devis/facture en cours d'édition (extrait tel quel de DevisForm).
// - Devis externe : montants saisis à la main.
// - Sinon : les sections et les lignes optionnelles (is_optional) ne font PAS
//   partie du total ferme, comme le devis public, le PDF et la RPC
//   select_quote_options.
// totalCost = coût matière (prix d'achat ou chiffrage interne).
export const computeQuoteTotals = (formData) => {
    if (formData.is_external) {
        return {
            subtotal: parseFloat(formData.manual_total_ht) || 0,
            tva: parseFloat(formData.manual_total_tva) || 0,
            total: parseFloat(formData.manual_total_ttc) || 0,
            totalCost: 0
        };
    }
    const lineItems = formData.items.filter(item => item.type !== 'section' && !item.is_optional);
    const subtotal = lineItems.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
    const totalCost = lineItems.reduce((sum, item) => sum + effectiveLineCost(item), 0);
    const tva = formData.include_tva ? subtotal * 0.20 : 0;
    const total = subtotal + tva;
    return { subtotal, tva, total, totalCost };
};
