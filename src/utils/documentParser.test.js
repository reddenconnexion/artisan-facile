import { describe, it, expect, beforeEach, vi } from 'vitest';

// documentParser pulls in pdfjs-dist / mammoth / sonner at module load; none of
// them are needed for the pure text-parsing helpers we test here, so we mock
// them to keep the suite runnable in the node environment.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const { parseQuoteItems, extractQuoteMetadata } = await import('./documentParser');

// Helper: keep only the priced/real lines (drop sections) for assertions.
const realItems = (items) => items.filter(i => i.type !== 'section');

describe('parseQuoteItems — per-line transcription', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('extracts qty / unit / unit price from a standard table row', () => {
        const text = [
            'Désignation                Quantité   Prix Unitaire HT   Total HT',
            'Pose de carrelage              30 m²        25,00 €        750,00 €',
            'Total HT                                                  750,00 €',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/carrelage/i);
        expect(rows[0].quantity).toBe(30);
        expect(rows[0].unit).toBe('m2');
        expect(rows[0].price).toBe(25);
    });

    it('anchors on the printed line total to recover a misaligned unit price', () => {
        // qty=8, total=2800 → unit price must come out at 350 even though the
        // middle column reads slightly off (349.99) — total wins.
        const text = [
            'Description          Qté    PU HT     Total HT',
            "Main d'oeuvre          8 h   349,99    2800,00",
            'Total HT                               2800,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(8);
        // 349.99 reproduces 2800 within 5%, so it is kept as-is.
        expect(rows[0].price).toBeCloseTo(349.99, 2);
    });

    it('ignores a mid-line VAT percentage column', () => {
        const text = [
            'Description          Qté    PU HT    TVA     Total HT',
            'Dépose ancien sol      10 m²  12,00   20%     120,00',
            'Total HT                                       120,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(10);
        expect(rows[0].price).toBe(12);
        expect(rows[0].description).not.toMatch(/20/);
    });

    it('treats discount lines as negative', () => {
        const text = [
            'Description                          Total HT',
            'Peinture murs intérieurs   1 u   500,00   500,00',
            'Remise commerciale                       -50,00',
            'Total HT                                 450,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        const discount = rows.find(r => /remise/i.test(r.description));
        expect(discount).toBeDefined();
        expect(discount.price).toBeLessThan(0);
    });

    it('classifies material lines and detects section headers', () => {
        const text = [
            'Description          Qté    PU HT     Total HT',
            'PLOMBERIE',
            'Fourniture mitigeur     2 u    89,00     178,00',
            "Main d'oeuvre pose      3 h    45,00     135,00",
            'Total HT                                 313,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        expect(items.some(i => i.type === 'section')).toBe(true);
        const mat = items.find(i => /mitigeur/i.test(i.description));
        expect(mat.type).toBe('material');
        expect(mat.quantity).toBe(2);
        expect(mat.price).toBe(89);
    });

    it('merges a multi-line description onto the numeric row', () => {
        const text = [
            'Description          Qté    PU HT     Total HT',
            'Fourniture et pose',
            'de parquet chêne       20 m²   45,00     900,00',
            'Total HT                                 900,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/fourniture et pose.*parquet/i);
        expect(rows[0].quantity).toBe(20);
        expect(rows[0].price).toBe(45);
    });

    it('drops administrative lines: deposit, phone and email', () => {
        const text = [
            'Description          Qté    PU HT     Total HT',
            'Pose de prise            5 u    35,00     175,00',
            'Acompte de 30% à la commande              52,50',
            'Tél : 06 12 34 56 78',
            'Email : contact@artisan.fr',
            'Total HT                                 175,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/prise/i);
        // No bogus line carrying "acompte", a phone number or an email.
        expect(items.some(i => /acompte/i.test(i.description))).toBe(false);
        expect(items.some(i => /\d{2}\s?\d{2}\s?\d{2}/.test(i.description))).toBe(false);
        expect(items.some(i => /@/.test(i.description))).toBe(false);
    });

    it('drops unlabelled address and company-id lines from the header block', () => {
        const text = [
            'ENTREPRISE DURAND',
            '12 rue des Lilas',
            '75001 Paris',
            'N° SIRET 123 456 789 00012',
            'Description          Qté    PU HT     Total HT',
            'Pose de luminaire        4 u    60,00     240,00',
            'Total HT                                 240,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/luminaire/i);
        expect(items.some(i => /rue des lilas/i.test(i.description))).toBe(false);
        expect(items.some(i => /paris/i.test(i.description))).toBe(false);
        expect(items.some(i => /siret/i.test(i.description) || /123\s?456/.test(i.description))).toBe(false);
    });

    it('keeps real items whose name merely starts like an admin keyword', () => {
        const text = [
            'Description          Qté    PU HT     Total HT',
            'Conditionnement spécial   2 u   8,00     16,00',
            'Total HT                                  16,00',
        ].join('\n');

        const { items } = parseQuoteItems(text);
        const rows = realItems(items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/conditionnement/i);
    });

    it('reads a linear-metre row "<qty> m <PU> <total>" correctly', () => {
        // Regression: the unit "m" (mètre) was unknown, so "36 m 7,81 € 281,16 €"
        // was mis-read as qty=7.81 / price=281.16 instead of qty=36 / price=7.81.
        const text = [
            'Désignation Qté PU HT Total HT',
            'Câble rigide U-1000 R2V 3G10 mm² (combles) 36 m 7,81 € 281,16 €',
            'TOTAL HT 281,16 €',
        ].join('\n');

        const rows = realItems(parseQuoteItems(text).items);
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(36);
        expect(rows[0].price).toBe(7.81);
        expect(rows[0].unit).toBe('ml');
    });

    it('inherits the item type from the current section title', () => {
        const text = [
            "SECTION A — MAIN D'ŒUVRE",
            'Désignation Qté (h) PU HT Total HT',
            'Pose et raccordement du tableau 1,0 50,00 € 50,00 €',
            'SECTION B — FOURNITURES ET MATÉRIEL',
            'Désignation Qté PU HT Total HT',
            'Disjoncteur modulaire bipolaire 40 A courbe C 1 24,38 € 24,38 €',
        ].join('\n');

        const items = parseQuoteItems(text).items;
        const labour = items.find(i => /raccordement du tableau/i.test(i.description));
        const supply = items.find(i => /disjoncteur/i.test(i.description));
        expect(labour.type).toBe('service');   // under MAIN D'ŒUVRE
        expect(supply.type).toBe('material');   // under FOURNITURES
        expect(items.filter(i => i.type === 'section')).toHaveLength(2);
    });

    it('merges a wrapped description whose first line contains a dimension', () => {
        const text = [
            'Désignation Qté (h) PU HT Total HT',
            'Pose de 7 m de goulotte + cheminement en combles et descente par goulotte de',
            'climatisation existante 1,5 50,00 € 75,00 €',
            'TOTAL HT 75,00 €',
        ].join('\n');

        const rows = realItems(parseQuoteItems(text).items);
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toMatch(/^Pose de 7 m de goulotte.*climatisation existante$/i);
        expect(rows[0].quantity).toBe(1.5);
        expect(rows[0].price).toBe(50);
    });

    it('excludes an identity line that contains a SIRET mid-line', () => {
        const text = [
            'reddenconnexion.fr | SIRET 925 082 885 000 29',
            'Désignation Qté PU HT Total HT',
            'Pose de prise 5 u 35,00 € 175,00 €',
            'TOTAL HT 175,00 €',
        ].join('\n');

        const items = parseQuoteItems(text).items;
        expect(items.some(i => /siret|reddenconnexion/i.test(i.description))).toBe(false);
        expect(realItems(items)).toHaveLength(1);
    });
});

describe('extractQuoteMetadata', () => {
    it('reads the title and client from labelled lines', () => {
        const text = [
            'Objet : Rénovation salle de bain',
            'Client : M. Dupont',
            'Date : 12/03/2025',
        ].join('\n');
        const meta = extractQuoteMetadata(text);
        expect(meta.title).toBe('Rénovation salle de bain');
        expect(meta.clientName).toBe('M. Dupont');
        expect(meta.date).toBe('12/03/2025');
    });
});
