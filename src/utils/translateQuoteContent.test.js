import { describe, it, expect, vi, beforeEach } from 'vitest';

// translateQuoteContent calls callAiProxy() which goes through the Supabase
// client; mock the supabase module so we can drive the AI response.
const invokeMock = vi.fn();
vi.mock('./supabase', () => ({
    supabase: { functions: { invoke: (...args) => invokeMock(...args) } },
}));

const { translateQuoteContent } = await import('./aiService');

const aiReturns = (obj) => {
    invokeMock.mockResolvedValueOnce({ data: { rawResponse: JSON.stringify(obj) }, error: null });
};

describe('translateQuoteContent', () => {
    beforeEach(() => {
        invokeMock.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('returns input unchanged without calling the AI when everything is empty', async () => {
        const out = await translateQuoteContent({ title: '', notes: '', descriptions: ['', '  '] }, 'en');
        expect(invokeMock).not.toHaveBeenCalled();
        expect(out.descriptions).toEqual(['', '  ']);
    });

    it('maps translated title, notes and descriptions in order', async () => {
        aiReturns({
            title: 'Sauna electrical connection',
            notes: 'Deposit required',
            descriptions: ['Tiling installation', 'Rigid cable U-1000 R2V'],
        });
        const out = await translateQuoteContent({
            title: 'Raccordement sauna',
            notes: 'Acompte requis',
            descriptions: ['Pose de carrelage', 'Câble rigide U-1000 R2V'],
        }, 'en');
        expect(out.title).toBe('Sauna electrical connection');
        expect(out.notes).toBe('Deposit required');
        expect(out.descriptions).toEqual(['Tiling installation', 'Rigid cable U-1000 R2V']);
    });

    it('translates the work object and sends it to the model', async () => {
        aiReturns({
            title: 'Video intercom',
            work_object: 'Supply and installation of a video intercom at the pedestrian gate.',
            notes: '',
            descriptions: [],
        });
        const out = await translateQuoteContent({
            title: 'Interphone vidéo',
            workObject: "Fourniture et pose d'un interphone vidéo au portail piéton.",
            notes: '',
            descriptions: [],
        }, 'en');
        const sent = invokeMock.mock.calls[0][1].body.userMessage;
        expect(sent).toContain("Fourniture et pose d'un interphone vidéo au portail piéton.");
        expect(out.workObject).toBe('Supply and installation of a video intercom at the pedestrian gate.');
    });

    it('keeps the French work object when the model omits it', async () => {
        aiReturns({ title: 'T', notes: '', descriptions: [] });
        const out = await translateQuoteContent({
            title: 'Titre',
            workObject: 'Périmètre en français',
            notes: '',
            descriptions: [],
        }, 'en');
        expect(out.workObject).toBe('Périmètre en français');
    });

    it('does not call the AI when only empty fields are provided, work object included', async () => {
        const out = await translateQuoteContent({ title: '', workObject: '  ', notes: '', descriptions: [] }, 'en');
        expect(invokeMock).not.toHaveBeenCalled();
        expect(out.workObject).toBe('  ');
    });

    it('falls back to the source description when the model drops an entry', async () => {
        // Model returned only one translation for two inputs.
        aiReturns({ title: 'T', notes: '', descriptions: ['Tiling installation'] });
        const out = await translateQuoteContent({
            title: 'Titre',
            notes: '',
            descriptions: ['Pose de carrelage', 'Câble rigide'],
        }, 'en');
        expect(out.descriptions[0]).toBe('Tiling installation');
        // Second one kept in French rather than left undefined.
        expect(out.descriptions[1]).toBe('Câble rigide');
    });
});
