import DOMPurify from 'dompurify';

// HTML saisi par l'utilisateur (signature email) : on garde la mise en forme
// (liens, images, styles) mais on retire scripts, handlers on* et URLs javascript:.
export const sanitizeHtml = (html) =>
    DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'iframe'] });
