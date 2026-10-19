import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./storageQuota', () => ({ assertWithinQuota: vi.fn() }));

const { storagePathFromUrl, rotatedPhotoPath, replacePhotoInList } = await import('./rotateSavedPhoto');

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

describe('rotatedPhotoPath', () => {
    it("range la version tournée à côté de l'originale", () => {
        expect(rotatedPhotoPath('u1/42/abc.png', 'u1', 'new')).toBe('u1/42/new.jpg');
        expect(rotatedPhotoPath('interventions/u1/abc.jpg', 'u1', 'new')).toBe('interventions/u1/new.jpg');
    });

    it("se rabat sur le dossier de l'utilisateur sans chemin connu", () => {
        expect(rotatedPhotoPath(null, 'u1', 'new')).toBe('u1/rotations/new.jpg');
    });
});

describe('replacePhotoInList', () => {
    it('remplace la photo en gardant ses autres champs', () => {
        const list = [{ url: 'a', path: 'pa', name: 'A' }, { url: 'b', path: 'pb', name: 'B' }];
        expect(replacePhotoInList(list, 'b', { url: 'c', path: 'pc' })).toEqual([
            { url: 'a', path: 'pa', name: 'A' },
            { url: 'c', path: 'pc', name: 'B' },
        ]);
    });

    it('renvoie null si la photo est absente', () => {
        expect(replacePhotoInList([{ url: 'a' }], 'z', { url: 'c', path: 'pc' })).toBeNull();
        expect(replacePhotoInList(null, 'a', { url: 'c', path: 'pc' })).toBeNull();
    });
});
