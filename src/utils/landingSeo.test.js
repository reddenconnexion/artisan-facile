// Garde-fou référencement : la page d'accueil existe en trois exemplaires qui
// doivent raconter la même chose.
//   1. src/pages/LandingPage.jsx       — ce que voit un humain (React)
//   2. index.html, bloc #af-static     — ce que lisent les robots sans JavaScript
//                                        (moteurs de recherche, assistants IA)
//   3. index.html, JSON-LD FAQPage     — données structurées
// Google exige que les questions/réponses du JSON-LD soient visibles sur la
// page ; les assistants IA citent le texte brut. Ce test échoue dès qu'une FAQ
// est modifiée à un seul endroit.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAGES, ROUTE_META, pageJsonLd, pagePath, parseInline, plainText } from '../content/publicPages.js';
import { buildPageDocument, renderPageBody } from '../content/prerender.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const landing = readFileSync(resolve(root, 'src/pages/LandingPage.jsx'), 'utf8');

const jsonLd = () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    return JSON.parse(m[1]);
};

// Dans le JSX, les apostrophes sont parfois échappées (\') : on compare sans.
const unescape = (s) => s.replace(/\\'/g, "'");

describe('index.html — contenu lisible sans JavaScript', () => {
    it('contient un bloc statique dans #root, masqué hors accueil par static-shell.js', () => {
        expect(html).toMatch(/<div id="root">\s*(<!--[\s\S]*?-->\s*)?<div id="af-static"/);
        expect(html).toContain('<script src="/static-shell.js"></script>');
        expect(html).toContain('.af-app #af-static{display:none}');
    });

    it('reprend le titre et les sections clés de la page React', () => {
        expect(html).toContain('Votre premier devis professionnel');
        expect(landing).toContain('Votre premier devis professionnel');
        for (const section of ['Questions fréquentes', 'Factur-X 1.08', 'Plan Essentiel', 'Plan Pro']) {
            expect(html, section).toContain(section);
            expect(landing, section).toContain(section);
        }
    });
});

describe('JSON-LD', () => {
    it('est un JSON valide avec les entités attendues', () => {
        const types = jsonLd()['@graph'].map((e) => e['@type']);
        expect(types).toEqual(expect.arrayContaining(['WebSite', 'SoftwareApplication', 'Organization', 'FAQPage']));
    });

    it('chaque question de la FAQ est visible, mot pour mot, dans la page React et le bloc statique', () => {
        const faq = jsonLd()['@graph'].find((e) => e['@type'] === 'FAQPage').mainEntity;
        expect(faq.length).toBeGreaterThanOrEqual(5);
        const staticBlock = html.slice(html.indexOf('id="af-static"'));
        for (const { name, acceptedAnswer } of faq) {
            expect(unescape(landing), name).toContain(name);
            expect(unescape(landing), name).toContain(acceptedAnswer.text);
            expect(staticBlock, name).toContain(name);
            expect(staticBlock, name).toContain(acceptedAnswer.text);
        }
    });

    it('les offres annoncent le même prix que le code (founderOffer)', async () => {
        const { PRO_PRICES } = await import('./founderOffer.js');
        const offers = jsonLd()['@graph'].find((e) => e['@type'] === 'SoftwareApplication').offers;
        const pro = offers.find((o) => o.name === 'Plan Pro');
        expect(Number(pro.price)).toBe(PRO_PRICES.standard.month / 100);
        expect(offers.find((o) => o.price === '0')).toBeTruthy();
    });
});

describe('fichiers pour robots et assistants IA', () => {
    const read = (p) => readFileSync(resolve(root, 'public', p), 'utf8');

    it('robots.txt référence le sitemap, llms.txt et protège les liens privés', () => {
        const robots = read('robots.txt');
        expect(robots).toContain('Sitemap: https://artisanfacile.fr/sitemap.xml');
        expect(robots).toContain('llms.txt');
        for (const path of ['/app/', '/p/', '/q/']) expect(robots).toContain(`Disallow: ${path}`);
    });

    it('llms.txt suit le format attendu et pointe vers llms-full.txt', () => {
        const llms = read('llms.txt');
        expect(llms.startsWith('# Artisan Facile\n\n> ')).toBe(true);
        expect(llms).toContain('https://artisanfacile.fr/llms-full.txt');
        expect(read('llms-full.txt')).toContain('# Artisan Facile');
    });

    it('le sitemap liste les pages publiques, et aucune page privée', () => {
        const sitemap = read('sitemap.xml');
        for (const p of ['/', '/register', '/login', '/mentions-legales', '/politique-confidentialite', ...PUBLIC_PAGES.map(pagePath)]) {
            expect(sitemap).toContain(`<loc>https://artisanfacile.fr${p}</loc>`);
        }
        expect(sitemap).not.toMatch(/artisanfacile\.fr\/(app|p|q)\//);
    });

    it('llms.txt et index.html lient chaque page de contenu', () => {
        const llms = read('llms.txt');
        for (const p of PUBLIC_PAGES) {
            expect(llms, p.slug).toContain(`https://artisanfacile.fr/${p.slug}`);
            expect(html, p.slug).toContain(`href="${pagePath(p)}"`);
        }
    });
});

describe('pages publiques de contenu (src/content/publicPages.js)', () => {
    it('ont des slugs uniques, un titre et une description aux bonnes longueurs', () => {
        const slugs = PUBLIC_PAGES.map((p) => p.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const p of PUBLIC_PAGES) {
            expect(p.slug, p.slug).toMatch(/^[a-z0-9-]+$/);
            expect(p.title.length, `${p.slug} : titre ${p.title.length} car.`).toBeLessThanOrEqual(80);
            expect(p.description.length, `${p.slug} : description ${p.description.length} car.`).toBeGreaterThanOrEqual(80);
            expect(p.description.length, `${p.slug} : description ${p.description.length} car.`).toBeLessThanOrEqual(220);
            expect(p.h1).toBeTruthy();
            expect(p.sections.length).toBeGreaterThanOrEqual(3);
            if (p.kind !== 'about') expect(p.faq.length, p.slug).toBeGreaterThanOrEqual(3);
            for (const r of p.related || []) expect(slugs, `${p.slug} → ${r}`).toContain(r);
        }
        for (const path of Object.keys(ROUTE_META)) expect(ROUTE_META[path].title).toContain('Artisan Facile');
    });

    it('parseInline gère gras et liens', () => {
        expect(parseInline('a **b** [c](/d) e')).toEqual([
            { type: 'text', text: 'a ' },
            { type: 'strong', text: 'b' },
            { type: 'text', text: ' ' },
            { type: 'link', text: 'c', href: '/d' },
            { type: 'text', text: ' e' },
        ]);
        expect(plainText('a **b** [c](/d)')).toBe('a b c');
    });

    it('les liens internes du contenu pointent vers des routes existantes', () => {
        const known = new Set(['/', '/register', '/login', '/mentions-legales', '/politique-confidentialite', ...PUBLIC_PAGES.map(pagePath)]);
        const texts = (s) => [...(s.paragraphs || []), ...(s.bullets || []), ...(s.after || []), ...(s.sub || []).flatMap(texts)];
        for (const p of PUBLIC_PAGES) {
            const all = [p.lead, ...p.sections.flatMap(texts), ...p.faq.map((f) => f.a), p.cta.href];
            for (const t of all) {
                for (const seg of parseInline(t)) {
                    if (seg.type === 'link' && seg.href.startsWith('/')) expect(known.has(seg.href), `${p.slug} : lien ${seg.href}`).toBe(true);
                }
            }
        }
    });

    it('le pré-rendu produit un document complet et cohérent pour chaque page', () => {
        for (const p of PUBLIC_PAGES) {
            const doc = buildPageDocument(html, p);
            expect(doc).toContain(`<title>${p.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;')}</title>`);
            expect(doc).toContain(`data-static="${pagePath(p)}"`);
            expect(doc).toContain(`<link rel="canonical" href="https://artisanfacile.fr/${p.slug}"`);
            expect(doc).toContain(`<h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-5">${p.h1.replace(/'/g, '&#39;')}</h1>`);
            // Le bloc de l'accueil a bien été remplacé, pas ajouté.
            expect(doc).not.toContain('Votre premier devis professionnel <span');
            expect((doc.match(/id="af-static"/g) || []).length).toBe(1);
            // JSON-LD valide, FAQ identique au texte visible.
            const ld = JSON.parse(doc.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
            expect(ld['@graph'].map((e) => e['@type'])).toEqual(expect.arrayContaining(['BreadcrumbList']));
            const faq = ld['@graph'].find((e) => e['@type'] === 'FAQPage');
            if (p.faq.length) {
                expect(faq.mainEntity.length).toBe(p.faq.length);
                const body = renderPageBody(p);
                for (const q of faq.mainEntity) expect(body).toContain(q.name.replace(/'/g, '&#39;'));
            } else {
                expect(faq).toBeUndefined();
            }
            expect(JSON.stringify(pageJsonLd(p))).not.toContain('**');
        }
    });

    it('vercel.json réécrit chaque page vers son HTML pré-rendu, et App.jsx la route', () => {
        const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
        const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
        expect(app).toContain('PUBLIC_PAGES.map');
        for (const p of PUBLIC_PAGES) {
            const rule = vercel.rewrites.find((r) => r.source === pagePath(p));
            expect(rule, p.slug).toBeTruthy();
            expect(rule.destination).toBe(`/${p.slug}.html`);
        }
        // La règle générique SPA reste en dernier.
        expect(vercel.rewrites[vercel.rewrites.length - 1].destination).toBe('/index.html');
    });
});
