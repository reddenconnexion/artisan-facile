import DOMPurify from 'dompurify';

// Signature email saisie par l'artisan : on ne garde que le HTML de mise en
// forme (texte, liens, images, tableaux, styles inline). Scripts, iframes,
// formulaires et gestionnaires d'événements (onerror=…) sont retirés.
const SIGNATURE_CONFIG = {
    ALLOWED_TAGS: [
        'a', 'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'img',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'hr',
        'h1', 'h2', 'h3', 'h4', 'font', 'small', 'sup', 'sub',
    ],
    ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'style', 'width', 'height', 'target',
        'rel', 'align', 'valign', 'colspan', 'rowspan', 'color', 'size',
        'border', 'cellpadding', 'cellspacing',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp);)/i,
};

export function sanitizeSignatureHtml(html) {
    if (!html) return '';
    return DOMPurify.sanitize(String(html), SIGNATURE_CONFIG);
}
