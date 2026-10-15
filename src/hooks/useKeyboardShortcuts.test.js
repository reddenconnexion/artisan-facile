import { describe, it, expect } from 'vitest';
import { eventKeyToken } from './useKeyboardShortcuts';

describe('eventKeyToken', () => {
    it('lit la lettre physique avec Option sur macOS (event.key composé)', () => {
        expect(eventKeyToken({ altKey: true, key: '®', code: 'KeyR' })).toBe('alt+r');
        expect(eventKeyToken({ altKey: true, key: '∂', code: 'KeyD' })).toBe('alt+d');
    });

    it('garde event.key sans Alt (disposition AZERTY respectée)', () => {
        expect(eventKeyToken({ ctrlKey: true, key: 'k', code: 'KeyK' })).toBe('ctrl+k');
        expect(eventKeyToken({ key: 'a', code: 'KeyQ' })).toBe('a');
    });

    it('garde la lettre AZERTY quand Alt ne compose pas (Windows/Linux)', () => {
        expect(eventKeyToken({ altKey: true, key: 'a', code: 'KeyQ' })).toBe('alt+a');
    });

    it('garde event.key pour Alt + touche non alphabétique', () => {
        expect(eventKeyToken({ altKey: true, key: 'ArrowLeft', code: 'ArrowLeft' })).toBe('alt+arrowleft');
    });
});
