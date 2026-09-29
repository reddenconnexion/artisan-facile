// Assainissement minimal du HTML saisi par l'artisan (signature email).
//
// Partagé entre l'edge function send-document-email (le HTML part dans les
// mails) et l'aperçu de Profile.jsx (le HTML est injecté dans l'app). Pas de
// dépendance ni d'API DOM/Deno : fonctionne dans les deux environnements.
//
// Approche : chaque balise est reconstruite à partir de ses attributs
// autorisés — rien de ce qui n'est pas reconnu n'est recopié tel quel.
// Retire : scripts et éléments actifs (iframe, object, svg, form…),
// gestionnaires d'événements `on*`, URLs `javascript:` / `vbscript:` /
// `data:` (hors images), `expression()` dans les styles, commentaires.

// Éléments supprimés avec leur contenu.
const DROP_WITH_CONTENT = [
    'script', 'style', 'iframe', 'object', 'noscript', 'template', 'svg', 'math',
    'textarea', 'select', 'xmp', 'noembed', 'noframes', 'title', 'applet',
];
// Éléments supprimés (balise seule).
const DROP_TAG = new Set([
    ...DROP_WITH_CONTENT, 'embed', 'frame', 'frameset', 'link', 'meta', 'base',
    'form', 'input', 'button', 'option', 'plaintext',
]);
const DROP_ATTR = new Set(['srcdoc', 'formaction', 'action']);

// Code point hors plage (ex. `&#99999999;`) → caractère vide plutôt qu'une
// RangeError qui ferait planter l'envoi.
const fromCode = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
const decodeEntities = (s: string) => s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => fromCode(parseInt(d, 10)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n');

function isUnsafeValue(name: string, raw: string): boolean {
    // eslint-disable-next-line no-control-regex
    const v = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
    if (/^(javascript|vbscript|livescript):/.test(v)) return true;
    if (v.startsWith('data:') && !/^data:image\/(png|jpe?g|gif|webp);/.test(v)) return true;
    if (name === 'style' && /expression\(|javascript:|behavior:|-moz-binding/.test(v)) return true;
    return false;
}

const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

function rebuildTag(name: string, attrs: string, selfClose: boolean): string {
    const kept: string[] = [];
    for (const m of attrs.matchAll(ATTR_RE)) {
        const attr = m[1].toLowerCase();
        if (attr.startsWith('on') || DROP_ATTR.has(attr)) continue;
        if (m[2] === undefined) { kept.push(attr); continue; }
        let value = m[2];
        if (value[0] === '"' || value[0] === "'") value = value.slice(1, -1);
        if (isUnsafeValue(attr, value)) continue;
        kept.push(`${attr}="${value.replace(/"/g, '&quot;')}"`);
    }
    return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose ? ' /' : ''}>`;
}

const CONTENT_RE = new RegExp(`<(${DROP_WITH_CONTENT.join('|')})\\b[\\s\\S]*?</\\1\\s*>`, 'gi');
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

export function sanitizeHtml(input: string | null | undefined): string {
    let html = String(input ?? '');
    // Itère jusqu'à stabilité pour déjouer les imbrications (`<scr<script>ipt>`).
    for (let i = 0; i < 5; i++) {
        const before = html;
        html = html
            .replace(/<!--[\s\S]*?(-->|$)/g, '')
            .replace(/<[!?][^>]*>/g, '')
            .replace(CONTENT_RE, '')
            .replace(TAG_RE, (_, close: string, rawName: string, attrs: string) => {
                const name = rawName.toLowerCase();
                if (DROP_TAG.has(name)) return '';
                if (close) return `</${name}>`;
                const selfClose = /\/\s*$/.test(attrs);
                return rebuildTag(name, attrs, selfClose);
            });
        if (html === before) break;
    }
    return html;
}
