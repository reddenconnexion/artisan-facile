// Règlement de l'acompte par virement depuis le téléphone du client.
//
// Le client signe sur son mobile : il lui faut des valeurs à copier (montant,
// IBAN, référence) et un moyen de les retrouver quand il ouvre son appli
// bancaire. Le QR code (virement SEPA « EPC ») ne sert qu'à qui voit le
// document sur un autre écran : il n'est donc que dans le PDF.
import { materialDepositAmounts } from './materialDeposit';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Acompte demandé à la commande, ou null si le devis n'en prévoit pas.
 * Même règle que le tableau « Conditions de règlement » du PDF : l'acompte
 * matériel prime sur l'acompte en % du total.
 */
export function depositDue(quote) {
    if (!quote || quote.type === 'invoice' || quote.type === 'credit_note') return null;
    if (quote.has_material_deposit === true) {
        const amounts = materialDepositAmounts(quote);
        if (amounts && amounts.materialTTC > 0) {
            return { amount: round2(amounts.materialTTC), balance: round2(amounts.balanceTTC) };
        }
    }
    const pct = Number(quote.deposit_percentage) || 0;
    const total = Number(quote.total_ttc) || 0;
    if (pct > 0 && total > 0) {
        const amount = round2(total * pct / 100);
        return { amount, balance: round2(Math.max(total - amount, 0)) };
    }
    return null;
}

export const paymentReference = (quote) => `Devis ${quote.quote_number || quote.id}`;

/** IBAN sans espaces, en majuscules : la forme que les appli bancaires acceptent. */
export const compactIban = (iban) => String(iban || '').replace(/\s+/g, '').toUpperCase();

/** IBAN groupé par 4 pour la lecture. */
export const formatIban = (iban) => compactIban(iban).replace(/(.{4})(?=.)/g, '$1 ');

/** Montant à l'écran et pour le presse-papiers : « 1 234,50 € ». */
export const formatEuros = (amount) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

/** Montant brut à coller dans un champ de virement : « 1234.50 ». */
export const plainAmount = (amount) => round2(amount).toFixed(2);

/**
 * Contenu d'un QR code de virement SEPA (norme EPC069-12, version 002 : le
 * BIC est facultatif). Retourne null sans IBAN ou sans montant exploitable.
 */
export function epcPayload({ iban, name, amount, reference }) {
    const compact = compactIban(iban);
    const value = round2(amount);
    if (!compact || !(value > 0) || value > 999999999.99) return null;
    return [
        'BCD', '002', '1', 'SCT',
        '',
        String(name || '').slice(0, 70),
        compact,
        `EUR${value.toFixed(2)}`,
        '',
        '',
        String(reference || '').slice(0, 140),
    ].join('\n');
}

/** Texte envoyé au client pour qu'il retrouve ses coordonnées au moment de payer. */
export function paymentMessage({ beneficiary, iban, amount, reference }) {
    return [
        `Acompte à régler par virement${beneficiary ? ` à ${beneficiary}` : ''} :`,
        `Montant : ${formatEuros(amount)}`,
        `IBAN : ${formatIban(iban)}`,
        `Référence à indiquer : ${reference}`,
    ].join('\n');
}
