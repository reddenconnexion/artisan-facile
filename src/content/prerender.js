// Pré-rendu HTML des pages publiques de contenu (src/content/publicPages.js).
//
// À la construction, pour chaque page, on part du dist/index.html produit par
// Vite (mêmes scripts, styles et service worker) et l'on remplace le <title>,
// les balises meta, le JSON-LD et le bloc statique #af-static par ceux de la
// page. Le fichier dist/<slug>.html obtenu est servi par Vercel sur /<slug>
// (voir vercel.json) : un robot sans JavaScript lit la page complète, un
// humain voit React prendre le relais sur la même route.
//
// Ce module est importé par vite.config.js (Node) et par les tests ; il ne
// doit rien importer de React ni du navigateur.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    PUBLIC_PAGES, PUBLIC_PAGE_LINKS, SITE_URL, getPublicPage, pageJsonLd, pagePath, pageUrl, parseInline,
} from './publicPages.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inline = (text) => parseInline(text).map((seg) => {
    if (seg.type === 'strong') return `<strong class="font-semibold text-gray-900">${esc(seg.text)}</strong>`;
    if (seg.type === 'link') return `<a href="${esc(seg.href)}" class="text-blue-600 underline underline-offset-2">${esc(seg.text)}</a>`;
    return esc(seg.text);
}).join('');

const paragraphs = (arr = []) => arr.map((p) => `<p class="text-gray-700 leading-relaxed mb-4">${inline(p)}</p>`).join('\n');
const bullets = (arr = []) => (arr.length
    ? `<ul class="list-disc pl-6 space-y-2 text-gray-700 mb-4">${arr.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>`
    : '');

const section = (s, level = 2) => {
    const h = s.heading
        ? (level === 2
            ? `<h2 class="text-2xl font-extrabold text-gray-900 mt-10 mb-4">${esc(s.heading)}</h2>`
            : `<h3 class="text-xl font-bold text-gray-900 mt-6 mb-2">${esc(s.heading)}</h3>`)
        : '';
    const subs = (s.sub || []).map((x) => section(x, 3)).join('\n');
    return `${h}\n${paragraphs(s.paragraphs)}\n${bullets(s.bullets)}\n${subs}\n${paragraphs(s.after)}`;
};

const faq = (items = []) => (items.length ? `
<h2 class="text-2xl font-extrabold text-gray-900 mt-10 mb-4">Questions fréquentes</h2>
<dl class="space-y-5">
${items.map(({ q, a }) => `  <div><dt class="font-semibold text-gray-900 mb-1">${esc(q)}</dt><dd class="text-gray-700 leading-relaxed">${inline(a)}</dd></div>`).join('\n')}
</dl>` : '');

const related = (slugs = []) => {
    const pages = slugs.map(getPublicPage).filter(Boolean);
    if (!pages.length) return '';
    return `
<h2 class="text-xl font-bold text-gray-900 mt-10 mb-3">À lire aussi</h2>
<ul class="space-y-1">
${pages.map((p) => `  <li><a href="${pagePath(p)}" class="text-blue-600 underline underline-offset-2">${esc(p.h1)}</a></li>`).join('\n')}
</ul>`;
};

const footerLinks = () => PUBLIC_PAGE_LINKS.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join('\n              ');

/** Corps HTML statique de la page (ce que remplace React au montage). */
export const renderPageBody = (page) => `<div id="af-static" class="min-h-screen bg-white text-gray-800">
        <header class="border-b border-gray-100">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <a href="/" class="flex items-center gap-2">
              <img src="/logo-bleu.svg" alt="Logo Artisan Facile" width="32" height="32" class="w-8 h-8 rounded-md" />
              <span class="text-2xl font-bold text-blue-600">Artisan Facile</span>
            </a>
            <nav aria-label="Compte" class="flex items-center gap-4 text-sm font-medium">
              <a href="/login" class="text-gray-600">Se connecter</a>
              <a href="/register" class="bg-blue-600 text-white px-4 py-2 rounded-lg">S'inscrire</a>
            </nav>
          </div>
        </header>
        <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <nav aria-label="Fil d'Ariane" class="text-sm text-gray-500 mb-6"><a href="/" class="hover:text-blue-600">Accueil</a> › <span>${esc(page.kicker)}</span></nav>
          <article>
            <p class="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">${esc(page.kicker)}</p>
            <h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-5">${esc(page.h1)}</h1>
            <p class="text-lg text-gray-600 leading-relaxed mb-8">${inline(page.lead)}</p>
            ${page.sections.map((s) => section(s)).join('\n')}
            ${faq(page.faq)}
            ${related(page.related)}
            <aside class="mt-12 rounded-2xl bg-blue-600 text-white p-8">
              <h2 class="text-2xl font-extrabold mb-2">${esc(page.cta.title)}</h2>
              <p class="text-blue-100 mb-5">${esc(page.cta.text)}</p>
              <a href="${esc(page.cta.href)}" class="inline-block bg-white text-blue-700 font-bold px-6 py-3 rounded-xl">${esc(page.cta.button)}</a>
            </aside>
            <p class="text-xs text-gray-400 mt-8">Mis à jour le ${esc(page.updated)}.</p>
          </article>
        </main>
        <footer class="bg-gray-900 text-gray-400 py-12 mt-12">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between gap-6 text-sm">
            <div>
              <p class="text-white font-bold text-lg">Artisan Facile</p>
              <p class="mt-2 max-w-xs">Le logiciel de gestion gratuit des artisans qui se lancent : devis, factures, agenda, clients.</p>
            </div>
            <nav aria-label="Pied de page" class="flex flex-wrap gap-x-6 gap-y-2 max-w-xl">
              <a href="/">Accueil</a>
              ${footerLinks()}
              <a href="/mentions-legales">Mentions légales</a>
              <a href="/politique-confidentialite">Confidentialité</a>
              <a href="mailto:contact@artisanfacile.fr">Contact</a>
            </nav>
          </div>
        </footer>
      </div>`;

// Remplacement d'une occurrence, avec « $1 », « $2 »… résolus par nous-mêmes :
// le contenu inséré (JSON-LD, HTML) peut contenir des « $ » que String.replace
// interpréterait.
const replaceOnce = (html, pattern, replacement, what) => {
    const m = html.match(pattern);
    if (!m) throw new Error(`prerender : ${what} introuvable dans index.html`);
    return html.replace(pattern, (...groups) => replacement.replace(/\$(\d)/g, (_, i) => groups[Number(i)]));
};
const metaContent = (html, selector, value, what) => replaceOnce(
    html,
    new RegExp(`(<meta ${selector} content=")[^"]*(")`),
    `$1${esc(value)}$2`,
    what,
);

/** Document complet de la page, à partir du dist/index.html produit par Vite. */
export const buildPageDocument = (template, page) => {
    const url = pageUrl(page);
    let html = template;
    html = replaceOnce(html, /<html lang="fr" data-static="\/">/, `<html lang="fr" data-static="${pagePath(page)}">`, 'attribut data-static');
    html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`, '<title>');
    html = metaContent(html, 'name="description"', page.description, 'meta description');
    html = replaceOnce(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`, 'canonical');
    html = metaContent(html, 'property="og:url"', url, 'og:url');
    html = metaContent(html, 'property="og:title"', page.title, 'og:title');
    html = metaContent(html, 'property="og:description"', page.description, 'og:description');
    html = metaContent(html, 'property="og:type"', 'article', 'og:type');
    html = metaContent(html, 'name="twitter:title"', page.title, 'twitter:title');
    html = metaContent(html, 'name="twitter:description"', page.description, 'twitter:description');
    html = replaceOnce(
        html,
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">\n${JSON.stringify(pageJsonLd(page), null, 2)}\n</script>`,
        'JSON-LD',
    );
    html = replaceOnce(
        html,
        /<!-- af-static:start -->[\s\S]*?<!-- af-static:end -->/,
        `<!-- af-static:start -->\n      ${renderPageBody(page)}\n      <!-- af-static:end -->`,
        'bloc #af-static',
    );
    return html;
};

/** Plugin Vite : écrit dist/<slug>.html pour chaque page publique après le bundle. */
export const prerenderPublicPages = () => {
    let outDir = 'dist';
    return {
        name: 'af-prerender-public-pages',
        apply: 'build',
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            const template = readFileSync(join(outDir, 'index.html'), 'utf8');
            for (const page of PUBLIC_PAGES) {
                writeFileSync(join(outDir, `${page.slug}.html`), buildPageDocument(template, page));
            }
            console.log(`\nPages publiques pré-rendues : ${PUBLIC_PAGES.map((p) => `${SITE_URL}/${p.slug}`).join(', ')}\n`);
        },
    };
};
