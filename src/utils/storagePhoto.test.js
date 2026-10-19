import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { storagePathFromUrl } = await import('./storagePhoto');

const BASE = 'https://x.supabase.co/storage/v1/object/public/project-photos/';

describe('storagePathFromUrl', () => {
    it('retrouve le chemin dans le bucket, décodé et sans paramètres', () => {
        expect(storagePathFromUrl(`${BASE}u1/42/abc.jpg`)).toBe('u1/42/abc.jpg');
        expect(storagePathFromUrl(`${BASE}visites/u1/a%20b.jpg?t=1`)).toBe('visites/u1/a b.jpg');
    });

    it('renvoie null hors du bucket', () => {
        expect(storagePathFromUrl('https://ailleurs.fr/photo.jpg')).toBeNull();
        expect(storagePathFromUrl(null)).toBeNull();
    });
});
