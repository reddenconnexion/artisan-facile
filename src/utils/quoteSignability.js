// ── Un document est-il encore signable par le client ? ───────────────────────
//
// La règle est appliquée côté serveur par `quote_signature_block_reason`
// (migration 20260901120000_suspend_quote_signature.sql) : c'est elle qui fait
// foi, elle seule empêche réellement une signature. Ce module en est le miroir
// côté interface, pour ne pas afficher un bouton « Signer » que le serveur
// refusera — le client ne doit pas découvrir le refus après avoir tracé sa
// signature.
//
// Toute évolution ici doit suivre la fonction SQL, et réciproquement.

// Statuts de fermeture d'un document non encore signé. `accepted` et `paid`
// n'y figurent pas : ils ont leur propre affichage (« signé », « acquittée »)
// et sont traités en amont par les pages.
export const SIGNATURE_BLOCKING_STATUSES = ['cancelled', 'refused', 'rejected', 'postponed', 'billed'];

/** true si le statut ferme la signature (devis annulé, refusé, reporté, facturé). */
export const isSignatureBlocked = (status) =>
    SIGNATURE_BLOCKING_STATUSES.includes(String(status || '').toLowerCase());

/**
 * Le portail client peut-il proposer la signature de ce document ?
 *
 * `sign_quote_via_portal` n'accepte que les types quote/devis : un avenant ne
 * s'y signe pas (il passe par son lien public). Afficher le bouton quand même
 * promettait au client une action qui échouait à tous les coups.
 */
export const canSignInPortal = (quote, isSigned = false) => {
    if (!quote || isSigned) return false;
    if (!['quote', 'devis'].includes(String(quote.type || 'quote').toLowerCase())) return false;
    if (quote.status === 'accepted' || quote.status === 'paid') return false;
    if (isSignatureBlocked(quote.status)) return false;
    return true;
};

/**
 * Mention à porter en filigrane sur le PDF d'un document fermé, ou null.
 *
 * Le PDF part hors de l'application : imprimé, il peut être signé à la main
 * quoi qu'en dise le serveur. La mention est la seule chose qui suit le
 * document, d'où ce cas de plus que `isSignatureBlocked` — un lien suspendu
 * (`token_revoked`) laisse le statut intact mais ferme bien la signature.
 *
 * `billed`/`paid` n'en font pas partie : une facture porte déjà son propre
 * marquage (« ACQUITTÉE ») et n'a jamais attendu de signature.
 */
export const closedWatermarkKind = (doc) => {
    if (!doc) return null;
    const byStatus = {
        cancelled: 'cancelled',
        refused: 'refused',
        rejected: 'refused',
        postponed: 'postponed',
    };
    return byStatus[String(doc.status || '').toLowerCase()]
        || (doc.token_revoked === true ? 'suspended' : null);
};
