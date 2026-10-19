import { describe, it, expect } from 'vitest';
import { normalizeQuarterTurn, rotatedSize, rotationPreviewStyle } from './imageRotation';

describe('normalizeQuarterTurn', () => {
    it('ramène tout angle à 0, 90, 180 ou 270', () => {
        expect(normalizeQuarterTurn(0)).toBe(0);
        expect(normalizeQuarterTurn(450)).toBe(90);
        expect(normalizeQuarterTurn(-90)).toBe(270);
        expect(normalizeQuarterTurn(-180)).toBe(180);
        expect(normalizeQuarterTurn(360)).toBe(0);
        expect(normalizeQuarterTurn(undefined)).toBe(0);
    });
});

describe('rotatedSize', () => {
    it('échange largeur et hauteur sur un quart de tour seulement', () => {
        expect(rotatedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
        expect(rotatedSize(400, 300, -90)).toEqual({ width: 300, height: 400 });
        expect(rotatedSize(400, 300, 180)).toEqual({ width: 400, height: 300 });
    });
});

describe('rotationPreviewStyle', () => {
    it("n'applique rien sans rotation", () => {
        expect(rotationPreviewStyle(0)).toBeUndefined();
    });

    it("borne l'image sur un quart de tour pour qu'elle tienne à l'écran", () => {
        expect(rotationPreviewStyle(-90)).toMatchObject({ transform: 'rotate(270deg)', maxWidth: '85vh', maxHeight: '85vw' });
        expect(rotationPreviewStyle(180).maxWidth).toBeUndefined();
    });
});
