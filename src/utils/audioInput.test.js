import { describe, it, expect } from 'vitest';
import {
    audioConstraints,
    describeInput,
    listAudioInputs,
    rememberAudioInput,
    readAudioInput,
    levelFromTimeDomain,
    AUDIO_INPUT_KEY,
} from './audioInput';

const makeStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        removeItem: (k) => map.delete(k),
    };
};

describe('audioConstraints', () => {
    it('laisse le système choisir quand aucun micro n\'est désigné', () => {
        expect(audioConstraints()).toEqual({ audio: true });
        expect(audioConstraints('')).toEqual({ audio: true });
    });

    it('impose l\'appareil désigné', () => {
        expect(audioConstraints('abc123')).toEqual({ audio: { deviceId: { exact: 'abc123' } } });
    });
});

describe('describeInput / listAudioInputs', () => {
    it('utilise le nom de l\'appareil quand il est connu', () => {
        expect(describeInput({ label: 'Casque USB-C' })).toBe('Casque USB-C');
    });

    it('nomme les entrées sans libellé (permission pas encore accordée)', () => {
        expect(describeInput({ deviceId: 'default', label: '' })).toBe('Micro par défaut');
        expect(describeInput({ deviceId: 'xyz', label: '' }, 2)).toBe('Micro 3');
    });

    it('ne garde que les entrées audio', () => {
        const devices = [
            { kind: 'audioinput', deviceId: 'a', label: 'Micro interne' },
            { kind: 'videoinput', deviceId: 'b', label: 'Caméra' },
            { kind: 'audiooutput', deviceId: 'c', label: 'Haut-parleur' },
            { kind: 'audioinput', deviceId: 'd', label: '' },
        ];
        expect(listAudioInputs(devices)).toEqual([
            { deviceId: 'a', label: 'Micro interne' },
            { deviceId: 'd', label: 'Micro 2' },
        ]);
        expect(listAudioInputs()).toEqual([]);
    });
});

describe('mémorisation du micro', () => {
    it('fait un aller-retour et sait oublier', () => {
        const storage = makeStorage();
        rememberAudioInput('abc', { storage });
        expect(readAudioInput({ storage })).toBe('abc');
        expect(storage.getItem(AUDIO_INPUT_KEY)).toBe('abc');
        rememberAudioInput('', { storage });
        expect(readAudioInput({ storage })).toBe('');
    });

    it('tolère un stockage absent ou en échec', () => {
        expect(rememberAudioInput('abc', { storage: null })).toBe(false);
        expect(readAudioInput({ storage: null })).toBe('');
        const failing = {
            getItem: () => { throw new Error('bloqué'); },
            setItem: () => { throw new Error('bloqué'); },
            removeItem: () => { throw new Error('bloqué'); },
        };
        expect(rememberAudioInput('abc', { storage: failing })).toBe(false);
        expect(readAudioInput({ storage: failing })).toBe('');
    });
});

describe('levelFromTimeDomain', () => {
    it('rend zéro sur un silence parfait', () => {
        expect(levelFromTimeDomain(new Uint8Array(64).fill(128))).toBe(0);
    });

    it('monte avec l\'amplitude et sature à 1', () => {
        const faible = levelFromTimeDomain(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 132 : 124)));
        const fort = levelFromTimeDomain(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 200 : 56)));
        expect(faible).toBeGreaterThan(0);
        expect(fort).toBeGreaterThan(faible);
        expect(fort).toBeLessThanOrEqual(1);
    });

    it('ne casse pas sur une trame vide', () => {
        expect(levelFromTimeDomain(new Uint8Array(0))).toBe(0);
        expect(levelFromTimeDomain(undefined)).toBe(0);
    });
});
