import { describe, it, expect, vi, beforeEach } from 'vitest';

const counts = { project_photos: 0, intervention_reports: 0 };
const errors = { project_photos: null, intervention_reports: null };
const remove = vi.fn(async () => ({ error: null }));

const query = (table) => {
    const q = {
        select: () => q,
        eq: () => q,
        contains: () => q,
        then: (resolve) => resolve({ count: counts[table], error: errors[table] }),
    };
    return q;
};

vi.mock('./supabase', () => ({
    supabase: {
        from: (table) => query(table),
        storage: { from: () => ({ remove }) },
    },
}));

const { removePhotoFileIfUnused } = await import('./photoFileCleanup');

const URL = 'https://x.supabase.co/storage/v1/object/public/project-photos/visites/u1/abc.jpg';

describe('removePhotoFileIfUnused', () => {
    beforeEach(() => {
        counts.project_photos = 0;
        counts.intervention_reports = 0;
        errors.project_photos = null;
        errors.intervention_reports = null;
        remove.mockClear();
    });

    it('efface le fichier qui ne sert plus nulle part', async () => {
        expect(await removePhotoFileIfUnused({ userId: 'u1', url: URL })).toBe(true);
        expect(remove).toHaveBeenCalledWith(['visites/u1/abc.jpg']);
    });

    it('garde le fichier encore présent dans le dossier (doublon)', async () => {
        counts.project_photos = 1;
        expect(await removePhotoFileIfUnused({ userId: 'u1', url: URL })).toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });

    it('garde le fichier encore présent dans un rapport', async () => {
        counts.intervention_reports = 1;
        expect(await removePhotoFileIfUnused({ userId: 'u1', url: URL })).toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });

    it('garde le fichier si les références sont illisibles', async () => {
        errors.intervention_reports = { message: 'boom' };
        expect(await removePhotoFileIfUnused({ userId: 'u1', url: URL })).toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });

    it("ne touche pas à une URL hors du bucket", async () => {
        expect(await removePhotoFileIfUnused({ userId: 'u1', url: 'https://ailleurs.fr/a.jpg' })).toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });
});
