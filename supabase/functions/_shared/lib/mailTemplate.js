// Remplissage des modèles de mails écrits par l'artisan (relances de devis,
// rappels de factures, demande d'avis). Partagé par l'appli et le serveur.

// Une ligne qui n'a de sens qu'avec l'information : « Mon numéro : {telephone} »,
// « … valable jusqu'au {validite}. », « {lien} » seul sur sa ligne.
const DANGLING_BEFORE = /(?::|\bjusqu'au|\bau|\ble|\bdu|\bà)\s*$/i;

const isDanglingLine = (line, tag) => {
    const at = line.indexOf(tag);
    if (at < 0) return false;
    const before = line.slice(0, at).trim();
    const after = line.slice(at + tag.length).trim();
    if (!/^[.!?]?$/.test(after)) return false; // le repère n'est pas en fin de ligne
    return before === '' || DANGLING_BEFORE.test(before);
};

/**
 * Remplace les repères {nom} par leur valeur. Pour un repère facultatif
 * (`optional`) sans valeur : la ligne qui n'a plus de sens sans lui
 * disparaît (jamais de « Mon numéro : » tout seul) ; ailleurs, le repère est
 * simplement retiré.
 */
export const renderTemplate = (text, vars, optional = []) => {
    const lines = String(text || '').split('\n')
        .filter((line) => !optional.some((k) => !vars[k] && isDanglingLine(line, `{${k}}`)));
    let out = lines.join('\n');
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v ?? '');
    return out
        .replace(/[ \t]+([,.])/g, '$1') // « Bonjour , » quand la fiche client n'a pas de nom
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
