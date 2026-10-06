// Construit la version HTML du corps d'un email de document. Le lien
// principal (URL brute sur sa propre ligne dans le texte) est remplacé par
// un bouton bien visible : « Signer » pour un devis — sans ça, le client ne
// distingue pas le lien de signature d'un simple lien de consultation, et
// beaucoup renvoient le devis signé par mail — ou « Voir ma facture ». De même, le lien du portail client devient un
// encart avec un bouton « Accéder à mon espace client » : noyé dans le texte,
// le client ne le remarquait pas. Le reste du texte est échappé, les sauts de
// ligne préservés et les autres URLs rendues cliquables. La signature (après
// le marqueur RFC 3676 "-- ") est retirée : l'edge function y rajoute sa
// propre signature HTML riche, sinon elle serait dupliquée.
//
// options : { actionUrl, actionLabel, actionIcon, portalUrl, portalLabelLine, portalTitle,
//             portalCaption, portalButtonLabel }
const FONT = "-apple-system,system-ui,'Segoe UI',sans-serif";

const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Bouton « bulletproof » (table + styles inline) pour un rendu fiable sur
// la majorité des clients mail (Gmail, Outlook, Apple Mail…).
const actionButton = (url, label, icon) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td align="center" style="border-radius:12px;background-color:#2563eb;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${icon ? `${icon} ` : ''}${esc(label)}</a></td></tr></table>`;

// Encart portail client : fond doux, titre, phrase d'explication et bouton.
// Couleur émeraude pour le distinguer du bouton de signature (bleu).
const portalCard = (url, { title, caption, buttonLabel }) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0;max-width:520px;"><tr><td style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:20px 22px;font-family:${FONT};">`
    + `<div style="font-size:16px;font-weight:700;color:#065f46;margin:0 0 4px;">🏠 ${esc(title)}</div>`
    + (caption ? `<div style="font-size:13px;line-height:1.5;color:#047857;margin:0 0 14px;">${esc(caption)}</div>` : '')
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:10px;background-color:#059669;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(buttonLabel)} →</a></td></tr></table>`
    + `</td></tr></table>`;

export const buildDocumentEmailHtml = (bodyText, options = {}) => {
    const { actionUrl, actionLabel, actionIcon, portalUrl, portalLabelLine } = options;
    const portal = portalUrl ? portalCard(portalUrl, {
        title: options.portalTitle,
        caption: options.portalCaption,
        buttonLabel: options.portalButtonLabel,
    }) : '';
    const action = actionUrl ? actionButton(actionUrl, actionLabel, actionIcon) : '';

    const marker = '\n\n-- \n';
    const sigIdx = bodyText.indexOf(marker);
    const main = sigIdx >= 0 ? bodyText.slice(0, sigIdx) : bodyText;

    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    const out = [];
    let actionInserted = false;
    let portalInserted = false;
    let afterBlock = false;
    for (const line of main.split('\n')) {
        const trimmed = line.trim();
        // Bouton et encart ont déjà leurs marges : on saute la ligne vide qui
        // les suit pour éviter un grand trou dans le mail.
        if (afterBlock) {
            afterBlock = false;
            if (!trimmed) continue;
        }
        // La ligne qui ne contient que l'URL principale devient le bouton.
        if (actionUrl && trimmed === actionUrl.trim()) {
            if (!actionInserted) { out.push(action); actionInserted = true; afterBlock = true; }
            continue;
        }
        if (portalUrl && trimmed === portalUrl.trim()) {
            // L'intitulé texte (« Votre espace client… : ») qui précède l'URL
            // est repris dans l'encart : on le retire pour éviter le doublon.
            if (portalLabelLine && out.length && out[out.length - 1] === esc(portalLabelLine)) {
                out.pop();
            }
            if (!portalInserted) { out.push(portal); portalInserted = true; afterBlock = true; }
            continue;
        }
        const linked = esc(line).replace(urlRe, (u) => `<a href="${u}" style="color:#2563eb;">${u}</a>`);
        out.push(linked);
    }
    // Filet de sécurité : si l'URL principale a été modifiée/supprimée dans
    // l'aperçu, on ajoute quand même le bouton (avec l'URL d'origine) à la fin
    // du corps. Pas pour le portail : si l'artisan a retiré le lien, on respecte.
    let html = out.join('<br>');
    if (actionUrl && !actionInserted) html += action;

    return `<div style="font-family:${FONT};font-size:14px;line-height:1.6;color:#1f2937;">${html}</div>`;
};
