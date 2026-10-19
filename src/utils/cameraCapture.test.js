import { describe, it, expect } from 'vitest';
import { videoConstraints, scaleToMax, photoFileName, isInPageCameraSupported, cameraErrorMessage, deviceAngleFromGravity, captureRotation } from './cameraCapture';

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

describe('cameraErrorMessage', () => {
    it('distingue le refus de permission', () => {
        expect(cameraErrorMessage({ name: 'NotAllowedError' })).toContain('Autorisez-la');
    });

    it('distingue la caméra absente et la caméra déjà occupée', () => {
        expect(cameraErrorMessage({ name: 'NotFoundError' })).toContain('Aucune caméra');
        expect(cameraErrorMessage({ name: 'NotReadableError' })).toContain('déjà utilisée');
    });

    it('reprend le message du navigateur quand l\'erreur est inconnue', () => {
        expect(cameraErrorMessage({ name: 'BizarreError', message: 'boom' })).toBe('Caméra indisponible (boom).');
        expect(cameraErrorMessage()).toBe('Caméra indisponible sur cet appareil.');
    });
});

describe('deviceAngleFromGravity', () => {
    it('reconnaît les quatre façons de tenir le téléphone', () => {
        expect(deviceAngleFromGravity(0, 9.8)).toBe(0);    // debout
        expect(deviceAngleFromGravity(9.8, 0)).toBe(90);   // couché, haut vers la gauche
        expect(deviceAngleFromGravity(0, -9.8)).toBe(180); // tête en bas
        expect(deviceAngleFromGravity(-9.8, 0)).toBe(270); // couché, haut vers la droite
    });

    it('tolère une prise un peu penchée', () => {
        expect(deviceAngleFromGravity(9, 2.5)).toBe(90);
        expect(deviceAngleFromGravity(-2, 9.5)).toBe(0);
    });

    it('garde le sens précédent à plat ou pile entre deux positions', () => {
        expect(deviceAngleFromGravity(0.5, 0.8, 90)).toBe(90);
        expect(deviceAngleFromGravity(6.9, 6.9, 270)).toBe(270);
        expect(deviceAngleFromGravity(undefined, null, 90)).toBe(90);
    });
});

describe('captureRotation', () => {
    it('ne touche à rien quand l\'écran a suivi le téléphone', () => {
        expect(captureRotation(0, 0)).toBe(0);
        expect(captureRotation(90, 90)).toBe(0);
        expect(captureRotation(270, 270)).toBe(0);
    });

    it('redresse la photo quand l\'écran est resté en portrait', () => {
        expect(captureRotation(90, 0)).toBe(90);
        expect(captureRotation(270, 0)).toBe(270);
        expect(captureRotation(180, 0)).toBe(180);
    });
});
