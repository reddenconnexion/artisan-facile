// Remplissage des modèles de mails écrits par l'artisan (relances de devis,
// rappels de factures, demande d'avis). Partagé par l'appli et le serveur.

/**
 * Remplace les repères {nom} par leur valeur. Une ligne qui contient un repère
 * facultatif (`optional`) sans valeur disparaît entièrement : jamais de
 * « Mon numéro : » ou de « Pour rappel, le règlement peut se faire par
 * virement sur le compte suivant : » tout seul.
 */
export const renderTemplate = (text, vars, optional = []) => {
    const lines = String(text || '').split('\n')
        .filter((line) => !optional.some((k) => !vars[k] && line.includes(`{${k}}`)));
    let out = lines.join('\n');
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v ?? '');
    return out
        .replace(/[ \t]+([,.])/g, '$1') // « Bonjour , » quand la fiche client n'a pas de nom
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
