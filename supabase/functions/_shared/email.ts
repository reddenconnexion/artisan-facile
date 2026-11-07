// Mise en forme des e-mails envoyés au nom de l'artisan : sujet ASCII,
// HTML à partir du texte, pixel de suivi d'ouverture, signature HTML.
// Partagé par `send-document-email` et `autopilot-run`.

// Normalises an email Subject to pure ASCII.
//
// Why: the SMTP library (denomailer 1.6.0) ALWAYS applies its own header
// encoding to the subject, and that encoder is broken for long accented
// subjects — it either emits a single oversized RFC 2047 word with literal
// spaces (shown raw by Gmail) or, if we pre-encode ourselves, double-encodes
// it (=?utf-8?B?…?= gets Q-encoded again, "=" → "=3d"). Since we can't control
// the library, we hand it a pure-ASCII subject it leaves untouched: accents are
// transliterated (é→e, à→a…), common typographic punctuation is simplified
// (— → -, … → ...), and any leftover non-ASCII is dropped. The email BODY, the
// PDF and the stored quote keep their accents — only the subject line is ASCII.
export function toAsciiSubject(subject: string): string {
    return subject
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
        .replace(/[‐-―]/g, '-')                 // – — ‒ … → -
        .replace(/[‘’‚‛]/g, "'")      // ‘ ’ → '
        .replace(/[“”„‟]/g, '"')      // “ ” → "
        .replace(/…/g, '...')                         // … → ...
        .replace(/€/g, 'EUR')                         // € → EUR
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x09\x20-\x7E]/g, '')                 // drop any remaining non-ASCII
        .replace(/\s+/g, ' ')
        .trim();
}

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Convertit un texte brut en HTML minimal en préservant les sauts de ligne
// et en convertissant les URLs en liens cliquables.
export function textToHtml(text: string): string {
    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    const escaped = escapeHtml(text);
    const linked = escaped.replace(urlRe, (url) => `<a href="${url}">${url}</a>`);
    const withBreaks = linked.replace(/\n/g, '<br>');
    return `<div style="font-family: -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.5; color: #1f2937; white-space: pre-wrap;">${withBreaks}</div>`;
}

export function injectTrackingPixel(html: string, pixelUrl: string): string {
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
    // Insère juste avant </body> si possible, sinon à la fin
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${pixel}</body>`);
    }
    return html + pixel;
}

// ── Signature email ──
// Sépare le corps du mail de la signature texte (qui suit le marqueur
// standard RFC 3676 `\n\n-- \n`). Permet à l'edge function de remplacer
// la signature texte par une signature HTML riche dans la version HTML
// sans la dupliquer.
export function splitBodyAndSignature(text: string): { body: string; sig: string } {
    const idx = text.indexOf('\n\n-- \n');
    if (idx < 0) return { body: text, sig: '' };
    return { body: text.slice(0, idx), sig: text.slice(idx + 2) };
}

// Signature HTML : utilise la version perso si renseignée, sinon génère
// automatiquement à partir des champs profil (logo, nom, contact, liens).
export function buildHtmlSignature(profile: Record<string, unknown>): string {
    const custom = (profile.email_signature_html || '') as string;
    if (custom.trim()) {
        // `white-space:pre-wrap` preserves the line breaks and blank lines the
        // artisan typed in the signature editor — HTML normally collapses them,
        // which made the sent signature look tighter than what was entered.
        return `<div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;white-space:pre-wrap;">${custom}</div>`;
    }

    const companyName = (profile.company_name || profile.full_name || '') as string;
    const fullName = (profile.full_name || '') as string;
    const phone = (profile.phone || '') as string;
    const email = (profile.professional_email || '') as string;
    const website = (profile.website || '') as string;
    const logoUrl = (profile.logo_url || '') as string;
    const googleReview = (profile.google_review_url || '') as string;

    if (!companyName && !email && !phone) return '';

    const escapeHtml = (s: string) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const websiteHref = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;

    const logoCell = logoUrl
        ? `<td style="padding-right:16px;vertical-align:top;"><img src="${escapeHtml(logoUrl)}" alt="" style="max-width:80px;max-height:80px;display:block;" /></td>`
        : '';

    const lines: string[] = [];
    if (companyName) lines.push(`<strong style="color:#111827;font-size:14px;">${escapeHtml(companyName)}</strong>`);
    if (fullName && fullName !== companyName) lines.push(`<span style="color:#374151;">${escapeHtml(fullName)}</span>`);
    if (phone) lines.push(`<a href="tel:${escapeHtml(phone.replace(/\s/g, ''))}" style="color:#374151;text-decoration:none;">${escapeHtml(phone)}</a>`);
    if (email) lines.push(`<a href="mailto:${escapeHtml(email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(email)}</a>`);
    if (website) lines.push(`<a href="${escapeHtml(websiteHref)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(website.replace(/^https?:\/\//i, ''))}</a>`);
    if (googleReview) lines.push(`<a href="${escapeHtml(googleReview)}" style="color:#f59e0b;text-decoration:none;font-size:12px;">⭐ Laisser un avis Google</a>`);

    return `
<table style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;font-family:-apple-system,system-ui,sans-serif;font-size:13px;line-height:1.5;">
  <tr>
    ${logoCell}
    <td style="vertical-align:top;color:#374151;">
      ${lines.join('<br>')}
    </td>
  </tr>
</table>`;
}
