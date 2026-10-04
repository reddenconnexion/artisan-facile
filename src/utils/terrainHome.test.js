import { describe, it, expect } from 'vitest';
import { shouldOpenTerrainHome } from './terrainHome';

describe('shouldOpenTerrainHome', () => {
    it('ouvre le mode terrain sur mobile par défaut', () => {
        expect(shouldOpenTerrainHome({ isMobile: true, pref: null, alreadyOpened: false })).toBe(true);
        expect(shouldOpenTerrainHome({ isMobile: true, pref: 'on', alreadyOpened: false })).toBe(true);
    });

    it('ne redirige jamais sur ordinateur', () => {
        expect(shouldOpenTerrainHome({ isMobile: false, pref: 'on', alreadyOpened: false })).toBe(false);
    });

    it('respecte la préférence désactivée', () => {
        expect(shouldOpenTerrainHome({ isMobile: true, pref: 'off', alreadyOpened: false })).toBe(false);
    });

    it('une seule fois par session, pour laisser revenir au bureau', () => {
        expect(shouldOpenTerrainHome({ isMobile: true, pref: null, alreadyOpened: true })).toBe(false);
    });
});
