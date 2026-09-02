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
 * La signature de ce document a-t-elle été suspendue PAR L'ARTISAN ?
 *
 * `token_revoked` ne suffit pas à le dire : une tâche nocturne
 * (`cleanup_expired_tokens`) révoque tout lien expiré depuis plus de 7 jours,
 * ce qui n'est pas une décision mais du ménage. La moitié des documents en
 * porte le drapeau, devis signés compris. Seule `signature_suspended_at`,
 * écrite par l'action explicite de l'artisan, marque une vraie suspension.
 */
export const isSignatureSuspended = (doc) => !!doc && !!doc.signature_suspended_at;

/**
 * Mention à porter en filigrane sur le PDF d'un document fermé, ou null.
 *
 * Le PDF part hors de l'application : imprimé, il peut être signé à la main
 * quoi qu'en dise le serveur. La mention est la seule chose qui suit le
 * document, d'où ce cas de plus que `isSignatureBlocked` — une signature
 * suspendue laisse le statut intact mais ferme bien le document.
 *
 * Un document déjà signé n'est jamais marqué « suspendu » : la signature a eu
 * lieu, plus rien n'est en attente, et son exemplaire ne doit pas laisser
 * croire le contraire. Un devis signé PUIS annulé, lui, garde son « ANNULÉ » —
 * c'est le statut qui parle, et il dit quelque chose de vrai.
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
    const byStatusKind = byStatus[String(doc.status || '').toLowerCase()];
    if (byStatusKind) return byStatusKind;
    if (doc.signed_at || doc.status === 'accepted') return null;
    return isSignatureSuspended(doc) ? 'suspended' : null;
};
