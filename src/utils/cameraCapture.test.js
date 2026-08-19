import { describe, it, expect } from 'vitest';
import { videoConstraints, scaleToMax, photoFileName, isInPageCameraSupported } from './cameraCapture';

describe('videoConstraints', () => {
    it('ne demande jamais le micro : il est déjà pris par l\'enregistrement', () => {
        expect(videoConstraints().audio).toBe(false);
    });

    it('vise la caméra arrière par défaut, et sait basculer', () => {
        expect(videoConstraints().video.facingMode).toEqual({ ideal: 'environment' });
        expect(videoConstraints('user').video.facingMode).toEqual({ ideal: 'user' });
    });
});

describe('scaleToMax', () => {
    it('laisse une image déjà assez petite intacte', () => {
        expect(scaleToMax(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    });

    it('réduit en gardant le rapport d\'image, paysage comme portrait', () => {
        expect(scaleToMax(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
        expect(scaleToMax(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    });

    it('ne casse pas sur des dimensions absentes', () => {
        expect(scaleToMax(0, 0, 2048)).toEqual({ width: 0, height: 0 });
    });
});

describe('photoFileName', () => {
    it('horodate le nom de fichier à la seconde', () => {
        const at = new Date(2026, 7, 19, 8, 5, 3).getTime();
        expect(photoFileName(at)).toBe('visite-20260819-080503.jpg');
    });

    it('accepte un préfixe et tolère une date invalide', () => {
        const at = new Date(2026, 7, 19, 8, 5, 3).getTime();
        expect(photoFileName(at, 'tableau')).toBe('tableau-20260819-080503.jpg');
        expect(photoFileName(NaN)).toBe('visite.jpg');
    });
});

describe('isInPageCameraSupported', () => {
    it('suit la présence de getUserMedia', () => {
        expect(isInPageCameraSupported()).toBe(Boolean(navigator.mediaDevices?.getUserMedia));
    });
});
