import { describe, it, expect } from 'vitest';
import { supportsNativeFullscreen } from './useFullscreen';

describe('supportsNativeFullscreen', () => {
    const el = { requestFullscreen() {} };

    it('accepte un navigateur avec l\'API Fullscreen', () => {
        expect(supportsNativeFullscreen(el, { fullscreenEnabled: true })).toBe(true);
    });

    it('accepte la variante préfixée webkit (iPad)', () => {
        expect(supportsNativeFullscreen({ webkitRequestFullscreen() {} }, { webkitFullscreenEnabled: true })).toBe(true);
    });

    it('refuse l\'iPhone : pas d\'API sur les éléments → overlay', () => {
        expect(supportsNativeFullscreen({}, {})).toBe(false);
    });

    it('refuse quand le plein écran est désactivé (iframe sans allowfullscreen)', () => {
        expect(supportsNativeFullscreen(el, { fullscreenEnabled: false })).toBe(false);
    });

    it('refuse sans élément', () => {
        expect(supportsNativeFullscreen(null, { fullscreenEnabled: true })).toBe(false);
    });
});
