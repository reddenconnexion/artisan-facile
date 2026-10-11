import { describe, it, expect } from 'vitest';
import { splitRowForCricut, buildCricutStrips, cricutStripFileName, CRICUT_PTC_MAX_MM } from './cricutExport';

const row = (modulesList) => modulesList.map((m, i) => ({ circuit: { id: String(i), modules: m, label: `C${i}` }, slot: i + 1 }));
const lengths = (pieces, pitch) => pieces.map((p) => p.reduce((a, it) => a + (it.circuit.modules || 1) * pitch, 0));

describe('splitRowForCricut', () => {
    it('garde une rangée de 13 modules (234 mm) en une seule bande', () => {
        const pieces = splitRowForCricut(row(Array(13).fill(1)), 18);
        expect(pieces).toHaveLength(1);
        expect(lengths(pieces, 18)).toEqual([234]);
    });

    it('partage 18 modules en deux bandes équilibrées (9 + 9)', () => {
        const pieces = splitRowForCricut(row(Array(18).fill(1)), 18);
        expect(lengths(pieces, 18)).toEqual([162, 162]);
    });

    it('ne coupe jamais une étiquette multi-modules et respecte la limite', () => {
        const pieces = splitRowForCricut(row([2, 1, 1, 4, 1, 2, 2, 1, 1, 2, 1, 1]), 18);
        const total = pieces.flat().length;
        expect(total).toBe(12);
        lengths(pieces, 18).forEach((l) => expect(l).toBeLessThanOrEqual(CRICUT_PTC_MAX_MM.long));
    });

    it('conserve l’ordre des étiquettes', () => {
        const items = row(Array(18).fill(1));
        expect(splitRowForCricut(items, 18).flat()).toEqual(items);
    });

    it('rangée vide → aucune bande', () => {
        expect(splitRowForCricut([], 18)).toEqual([]);
    });
});

describe('buildCricutStrips', () => {
    it('tourne une bande plus longue que 171 mm et donne la taille à saisir', () => {
        const strips = buildCricutStrips([{ items: row(Array(13).fill(1)) }, { items: row(Array(18).fill(1)) }], { modulePitch: 18, height: 25 });
        expect(strips).toHaveLength(3);
        expect(strips[0]).toMatchObject({ rowIndex: 1, rotated: true, widthMm: 25, tallMm: 234 });
        expect(strips[1]).toMatchObject({ rowIndex: 2, pieceIndex: 1, pieceCount: 2, rotated: false, widthMm: 162, tallMm: 25 });
    });

    it('nomme le fichier avec la rangée, le morceau et la taille', () => {
        const [, s] = buildCricutStrips([{ items: row([1]) }, { items: row(Array(18).fill(1)) }], { modulePitch: 17.5, height: 25 });
        expect(cricutStripFileName(s, 'Mme Dupont-Léa')).toBe('etiquettes-Mme_Dupont_Lea-rangee2-1sur2-157,5x25mm.png');
    });
});
