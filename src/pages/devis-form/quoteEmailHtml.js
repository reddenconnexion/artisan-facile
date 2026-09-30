// Construit la version HTML du corps d'un email de devis. Le lien de
// signature (URL brute sur sa propre ligne dans le texte) est remplacé par
// un bouton « Signer » bien visible : sans ça, le client ne distingue pas le
// lien de signature d'un simple lien de consultation, et beaucoup renvoient
// le devis signé par mail. Le reste du texte est échappé, les sauts de ligne
// préservés et les autres URLs rendues cliquables. La signature (après le
// marqueur RFC 3676 "-- ") est retirée : l'edge function y rajoute sa propre
// signature HTML riche, sinon elle serait dupliquée.
export const buildQuoteEmailHtml = (bodyText, signUrl, signLabel) => {
    const esc = (s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const marker = '\n\n-- \n';
    const sigIdx = bodyText.indexOf(marker);
    const main = sigIdx >= 0 ? bodyText.slice(0, sigIdx) : bodyText;

    // Bouton « bulletproof » (table + styles inline) pour un rendu fiable sur
    // la majorité des clients mail (Gmail, Outlook, Apple Mail…).
    const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td align="center" style="border-radius:12px;background-color:#2563eb;"><a href="${esc(signUrl)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:-apple-system,system-ui,'Segoe UI',sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">✍️ ${esc(signLabel)}</a></td></tr></table>`;

    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    const out = [];
    let inserted = false;
    for (const line of main.split('\n')) {
        // La ligne qui ne contient que l'URL de signature devient le bouton.
        if (signUrl && line.trim() === signUrl.trim()) {
            if (!inserted) { out.push(button); inserted = true; }
            continue;
        }
        const linked = esc(line).replace(urlRe, (u) => `<a href="${u}" style="color:#2563eb;">${u}</a>`);
        out.push(linked);
    }
    // Filet de sécurité : si l'URL a été modifiée/supprimée dans l'aperçu, on
    // ajoute quand même le bouton (avec l'URL d'origine) à la fin du corps.
    let html = out.join('<br>');
    if (!inserted) html += button;

    return `<div style="font-family:-apple-system,system-ui,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">${html}</div>`;
};
