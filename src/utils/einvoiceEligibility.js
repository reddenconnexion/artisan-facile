/**
 * Éligibilité d'un document à la transmission e-facture (réforme 2026-2027).
 *
 * La facture électronique ne s'échange qu'entre professionnels établis en
 * France, identifiés par leur SIREN. Une vente à un particulier n'est pas
 * transmise : elle relèvera du e-reporting. Un document non émis (brouillon
 * sans numéro légal) ou importé d'un autre outil ne se transmet pas non plus.
 *
 * Miroir exact de getEInvoiceEligibility dans
 * supabase/functions/_shared/b2brouter.ts : la fonction de transmission
 * applique la même règle côté serveur, celle-ci sert à l'afficher avant.
 */

export const normalizeSiren = (v) => String(v ?? '').replace(/\D/g, '');
export const isValidSiren = (v) => /^\d{9}$/.test(normalizeSiren(v));

export const EINVOICE_MESSAGES = {
    not_document: 'Seules les factures et les avoirs se transmettent.',
    external: "Document importé d'un autre outil : transmettez-le depuis cet outil.",
    not_issued: "Émettez d'abord le document (attribution du numéro légal) avant de le transmettre.",
    no_client: 'Aucun client rattaché à ce document.',
    individual: "Client particulier : la facture électronique ne s'échange qu'entre professionnels. Cette vente relèvera du e-reporting, pas de la transmission.",
    no_siren: 'Renseignez le SIREN (9 chiffres) de ce client professionnel dans sa fiche pour pouvoir transmettre.',
};

export function getEInvoiceEligibility(doc, client) {
    const fail = (reason) => ({ eligible: false, reason, message: EINVOICE_MESSAGES[reason] });

    if (!doc || !['invoice', 'credit_note'].includes(doc.type)) return fail('not_document');
    if (doc.is_external) return fail('external');
    if (!doc.invoice_number) return fail('not_issued');
    if (!client) return fail('no_client');
    if (client.type === 'individual') return fail('individual');
    if (!isValidSiren(client.siren)) return fail('no_siren');
    return { eligible: true, reason: null, message: null };
}
