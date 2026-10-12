import { describe, it, expect } from 'vitest';
import { printLineWidths, pickPrintOrientation, ORIENTATIONS } from './etiquettesPrint';

const row = (modulesList) => ({ items: modulesList.map((m, i) => ({ circuit: { id: String(i), modules: m } })) });
const rows = (n, modules) => Array.from({ length: n }, () => row(Array(modules).fill(1)));

describe('printLineWidths', () => {
    it('replie une rangée de 13 modules en portrait mais pas en paysage', () => {
        const { items } = row(Array(13).fill(1));
        expect(printLineWidths(items, 18, ORIENTATIONS.landscape.pageWidthMm)).toEqual([234]);
        expect(printLineWidths(items, 18, ORIENTATIONS.portrait.pageWidthMm)).toEqual([180, 54]);
    });
});

describe('pickPrintOrientation', () => {
    it('choisit le paysage quand les rangées de 13 modules y tiennent entières', () => {
        expect(pickPrintOrientation(rows(4, 13), 18)).toBe('landscape');
        expect(pickPrintOrientation(rows(3, 13), 17.5)).toBe('landscape');
    });

    it('garde le portrait pour des rangées de 18 modules (coupées dans les deux sens)', () => {
        expect(pickPrintOrientation(rows(4, 18), 18)).toBe('portrait');
    });

    it('garde le portrait quand tout tient déjà (petites rangées)', () => {
        expect(pickPrintOrientation(rows(2, 8), 18)).toBe('portrait');
    });

    it('tableau vide → portrait', () => {
        expect(pickPrintOrientation([], 18)).toBe('portrait');
    });
});
