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
        for (const p of ['/', '/register', '/login', '/mentions-legales', '/politique-confidentialite']) {
            expect(sitemap).toContain(`<loc>https://artisanfacile.fr${p}</loc>`);
        }
        expect(sitemap).not.toMatch(/artisanfacile\.fr\/(app|p|q)\//);
    });
});
