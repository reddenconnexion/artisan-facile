// Modes de règlement d'une facture (colonne quotes.payment_method), dans
// l'ordre d'usage le plus courant. Mêmes valeurs que le sélecteur de
// l'éditeur (QuoteHeaderFields) et le livre de recettes.
export const PAYMENT_METHODS = [
    { id: 'virement', label: 'Virement' },
    { id: 'wero', label: 'Wero' },
    { id: 'especes', label: 'Espèces' },
    { id: 'cheque', label: 'Chèque' },
    { id: 'carte', label: 'Carte bancaire' },
    { id: 'paypal', label: 'PayPal' },
    { id: 'autre', label: 'Autre' },
];

export const DEFAULT_PAYMENT_METHOD = 'virement';
