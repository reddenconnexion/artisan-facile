// Numéro de référence affiché pour un document (devis, facture, avenant).
//
// Une facture émise porte un numéro légal dédié (invoice_number, format
// FAC-AAAA-NNNN, attribué par la base à l'émission — voir la migration
// 20260822130000_invoice_numbering_compliance). Les devis gardent leur
// référence interne séquentielle (quote_number).
//
// Une facture SANS invoice_number n'est pas encore émise (brouillon) ou est un
// document externe numéroté ailleurs : on retombe alors sur quote_number/id
// comme référence interne, jamais présentée comme numéro de facture légal.

// Types portant un numéro légal dans invoice_number (FAC-… pour les factures,
// AV-… pour les avoirs).
const LEGAL_NUMBER_TYPES = ['invoice', 'credit_note'];

export function documentNumber(doc) {
    if (!doc) return '';
    if (LEGAL_NUMBER_TYPES.includes(doc.type) && doc.invoice_number) return String(doc.invoice_number);
    return String(doc.quote_number ?? doc.id ?? '');
}

// Référence courte préfixée pour les listes internes (FAC-2026-0001, DEV #12…).
export function documentRef(doc) {
    if (!doc) return '';
    if (LEGAL_NUMBER_TYPES.includes(doc.type) && doc.invoice_number) return String(doc.invoice_number);
    const prefix = doc.type === 'invoice' ? 'FAC'
        : (doc.type === 'credit_note' ? 'AVR'
            : (doc.type === 'amendment' ? 'AVT' : 'DEV'));
    return `${prefix} #${doc.quote_number ?? doc.id ?? ''}`;
}
