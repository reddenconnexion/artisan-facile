import { describe, it, expect, afterEach, vi } from 'vitest';
import { isNetworkError, isOffline } from './offlineSave';

describe('offlineSave', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('détecte le mode hors-ligne du navigateur', () => {
        vi.stubGlobal('navigator', { onLine: false });
        expect(isOffline()).toBe(true);
        expect(isNetworkError(null)).toBe(true);
    });

    it('reconnaît les erreurs réseau même si navigator.onLine est vrai', () => {
        vi.stubGlobal('navigator', { onLine: true });
        expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
        expect(isNetworkError({ message: 'TypeError: Load failed' })).toBe(true);
        expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    });

    it("ne confond pas une erreur serveur avec une coupure réseau", () => {
        vi.stubGlobal('navigator', { onLine: true });
        expect(isNetworkError({ code: '23505', message: 'duplicate key value' })).toBe(false);
        expect(isNetworkError(null)).toBe(false);
    });
});
