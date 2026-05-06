import { useEffect, useRef } from 'react';

const isEditableTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
};

const eventKeyToken = (event) => {
    const parts = [];
    if (event.metaKey) parts.push('meta');
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey && event.key.length > 1) parts.push('shift');
    parts.push(event.key.toLowerCase());
    return parts.join('+');
};

/**
 * Register keyboard shortcuts.
 *
 * Supported key syntaxes (case-insensitive):
 *   - Single key: 'n', '/', '?'
 *   - Modifier combo: 'alt+d', 'ctrl+k', 'meta+s'
 *   - Chord (vim-style, no modifiers): 'g d', 'g c'
 *   - Escape: always fires, even when focus is in an editable field
 *
 * Single-letter and chord shortcuts are suppressed when focus is in an
 * input/textarea/select/contenteditable. Modifier combos still fire.
 *
 * @param {Object<string, (event: KeyboardEvent) => void>} shortcuts
 * @param {Object} options
 * @param {boolean} [options.enabled=true]
 */
export const useKeyboardShortcuts = (shortcuts, { enabled = true } = {}) => {
    const shortcutsRef = useRef(shortcuts);
    shortcutsRef.current = shortcuts;

    useEffect(() => {
        if (!enabled) return undefined;

        let chordPrefix = null;
        let chordTimer = null;

        const clearChord = () => {
            chordPrefix = null;
            if (chordTimer) {
                clearTimeout(chordTimer);
                chordTimer = null;
            }
        };

        const handler = (event) => {
            const map = shortcutsRef.current || {};
            const normalized = Object.fromEntries(
                Object.entries(map).map(([k, v]) => [k.toLowerCase(), v])
            );
            const token = eventKeyToken(event);
            const plainKey = event.key.toLowerCase();

            if (event.key === 'Escape' && normalized.escape) {
                normalized.escape(event);
                clearChord();
                return;
            }

            const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

            if (hasModifier) {
                const handlerFn = normalized[token];
                if (handlerFn) {
                    event.preventDefault();
                    handlerFn(event);
                    clearChord();
                }
                return;
            }

            if (isEditableTarget(event.target)) return;

            if (chordPrefix) {
                const combo = `${chordPrefix} ${plainKey}`;
                if (normalized[combo]) {
                    event.preventDefault();
                    normalized[combo](event);
                }
                clearChord();
                return;
            }

            const prefixCandidates = Object.keys(normalized).filter((k) => k.startsWith(`${plainKey} `));
            if (prefixCandidates.length > 0) {
                chordPrefix = plainKey;
                chordTimer = setTimeout(clearChord, 1500);
                return;
            }

            const direct = normalized[plainKey];
            if (direct) {
                event.preventDefault();
                direct(event);
            }
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
            clearChord();
        };
    }, [enabled]);
};
