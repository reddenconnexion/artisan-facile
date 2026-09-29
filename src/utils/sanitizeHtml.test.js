import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
    it('conserve une signature HTML classique', () => {
        const sig = '<p style="color:#333"><strong>Denis</strong><br>'
            + '<a href="https://exemple.fr" target="_blank">Site</a>'
            + '<img src="https://exemple.fr/logo.png" alt="logo" width="80" /></p>';
        expect(sanitizeHtml(sig)).toBe(sig);
    });

    it('garde le texte brut et les sauts de ligne', () => {
        expect(sanitizeHtml('Denis\n06 00 00 00 00\n\nÀ bientôt')).toBe('Denis\n06 00 00 00 00\n\nÀ bientôt');
    });

    it('supprime les scripts et leur contenu', () => {
        expect(sanitizeHtml('a<script>alert(1)</script>b')).toBe('ab');
        expect(sanitizeHtml('a<SCRIPT src="x.js"></SCRIPT>b')).toBe('ab');
        expect(sanitizeHtml('<scr<script>x</script>ipt>alert(1)</script>')).not.toMatch(/<script/i);
    });

    it('supprime les gestionnaires d’événements', () => {
        expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">');
        // Comme le navigateur : la valeur non quotée va jusqu'à l'espace ou '>'.
        expect(sanitizeHtml('<img/src=x/onerror=alert(1)>')).toBe('<img src="x/onerror=alert(1)">');
        expect(sanitizeHtml('<a href="#" OnClick=\'x()\'>t</a>')).toBe('<a href="#">t</a>');
    });

    it('neutralise les URLs dangereuses, même encodées', () => {
        expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
        expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe('<a>x</a>');
        expect(sanitizeHtml('<a href=" JaVaScRiPt&colon;alert(1)">x</a>')).toBe('<a>x</a>');
        expect(sanitizeHtml('<a href="data:text/html,<script>">x</a>')).not.toMatch(/data:text/);
        expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA">');
    });

    it('retire les éléments actifs', () => {
        for (const tag of ['iframe', 'object', 'svg', 'style', 'form', 'embed', 'meta', 'base']) {
            expect(sanitizeHtml(`a<${tag} x="1">z</${tag}>b`)).not.toMatch(new RegExp(`<${tag}`, 'i'));
        }
    });

    it('ne se laisse pas tromper par un > dans un attribut', () => {
        const out = sanitizeHtml('<img title=">" onerror="alert(1)">');
        expect(out).not.toMatch(/onerror\s*=/i);
    });

    it('retire les styles exécutables et les commentaires', () => {
        expect(sanitizeHtml('<p style="width:expression(alert(1))">x</p>')).toBe('<p>x</p>');
        expect(sanitizeHtml('a<!-- <script>x</script> -->b')).toBe('ab');
    });

    it('ne plante pas sur une entité hors plage', () => {
        expect(sanitizeHtml('<a href="&#99999999;&#xFFFFFFF;">x</a>')).toBe('<a href="&#99999999;&#xFFFFFFF;">x</a>');
    });

    it('accepte null / undefined', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml(undefined)).toBe('');
    });
});
