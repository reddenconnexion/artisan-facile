import { describe, it, expect, beforeEach } from 'vitest';
import { quoteDraftKey, purgeLocalUserData, purgeExpiredDrafts } from './localData';

const DAY = 24 * 3600 * 1000;

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        key: (i) => [...store.keys()][i],
        get length() { return store.size; },
    };
    // Object.keys(localStorage) doit lister les clés, comme dans un navigateur.
    globalThis.localStorage = new Proxy(globalThis.localStorage, {
        ownKeys: () => [...store.keys()],
        getOwnPropertyDescriptor: (_t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined),
    });
});

describe('quoteDraftKey', () => {
    it('est propre à chaque compte', () => {
        expect(quoteDraftKey('u1', 12)).toBe('quote_draft_u1_12');
        expect(quoteDraftKey('u1')).toBe('quote_draft_u1_new');
        expect(quoteDraftKey('u1', 12)).not.toBe(quoteDraftKey('u2', 12));
    });
});

describe('purgeLocalUserData', () => {
    it('efface le cache hors-ligne et les anciens brouillons, garde les brouillons propriétaires', () => {
        localStorage.setItem('offline_clients', '{}');
        localStorage.setItem('quote_draft_new', '{}');
        localStorage.setItem('quote_draft_42', '{}');
        localStorage.setItem(quoteDraftKey('u1', 42), '{}');
        localStorage.setItem('theme', 'dark');
        purgeLocalUserData();
        expect(localStorage.getItem('offline_clients')).toBeNull();
        expect(localStorage.getItem('quote_draft_new')).toBeNull();
        expect(localStorage.getItem('quote_draft_42')).toBeNull();
        expect(localStorage.getItem(quoteDraftKey('u1', 42))).not.toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
    });
});

describe('purgeExpiredDrafts', () => {
    it('supprime les brouillons de plus de 30 jours ou illisibles, garde les récents', () => {
        const now = Date.parse('2026-10-09T12:00:00Z');
        localStorage.setItem('quote_draft_u1_1', JSON.stringify({ _draft_saved_at: new Date(now - 40 * DAY).toISOString() }));
        localStorage.setItem('quote_draft_u1_2', JSON.stringify({ _draft_saved_at: new Date(now - 2 * DAY).toISOString() }));
        localStorage.setItem('intervention-draft-u1-new', JSON.stringify({ savedAt: new Date(now - 90 * DAY).toISOString(), data: {} }));
        localStorage.setItem('quote_draft_u1_3', 'pas du json');
        purgeExpiredDrafts(30, now);
        expect(localStorage.getItem('quote_draft_u1_1')).toBeNull();
        expect(localStorage.getItem('quote_draft_u1_2')).not.toBeNull();
        expect(localStorage.getItem('intervention-draft-u1-new')).toBeNull();
        expect(localStorage.getItem('quote_draft_u1_3')).toBeNull();
    });
});
