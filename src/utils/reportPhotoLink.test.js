import { describe, it, expect } from 'vitest';
import { parseReportDate, planReportPhotoLink } from './reportPhotoLink';

const DATE = new Date(2026, 8, 22); // 22 septembre 2026
const PHOTOS = [
    { url: 'https://cdn/a.jpg', path: 'visites/u1/a.jpg', name: 'a.jpg' },
    { url: 'https://cdn/b.jpg', path: 'visites/u1/b.jpg', name: 'b.jpg' },
];

describe('parseReportDate', () => {
    it('lit la date du rapport en heure locale', () => {
        const d = parseReportDate('2026-09-22');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(8);
        expect(d.getDate()).toBe(22);
    });

    it('se rabat sur la valeur de secours quand la date est absente ou illisible', () => {
        expect(parseReportDate('', DATE)).toBe(DATE);
        expect(parseReportDate(null, DATE)).toBe(DATE);
        expect(parseReportDate('pas une date', DATE)).toBe(DATE);
        expect(parseReportDate(undefined)).toBeNull();
    });
});

describe('planReportPhotoLink', () => {
    it('verse les photos dans le dossier du client rattaché après coup', () => {
        const { rows, unlinkClientId, unlinkUrls } = planReportPhotoLink({
            userId: 'u1', clientId: 7, photos: PHOTOS, date: DATE,
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            user_id: 'u1',
            client_id: 7,
            photo_url: 'https://cdn/a.jpg',
            category: 'before',
        });
        expect(rows[0].description).toBe('Visite prédevis du 22/09/2026');
        expect(unlinkClientId).toBeNull();
        expect(unlinkUrls).toEqual([]);
    });

    it('ignore les photos déjà présentes dans le dossier du client', () => {
        const { rows } = planReportPhotoLink({
            userId: 'u1', clientId: 7, photos: PHOTOS, linkedUrls: ['https://cdn/a.jpg'], date: DATE,
        });
        expect(rows.map(r => r.photo_url)).toEqual(['https://cdn/b.jpg']);
    });

    it('ne produit rien tant qu\'aucun client n\'est rattaché', () => {
        const { rows, unlinkClientId } = planReportPhotoLink({
            userId: 'u1', clientId: null, photos: PHOTOS, date: DATE,
        });
        expect(rows).toEqual([]);
        expect(unlinkClientId).toBeNull();
    });

    it('retire les photos de l\'ancienne fiche quand le rapport change de client', () => {
        const { rows, unlinkClientId, unlinkUrls } = planReportPhotoLink({
            userId: 'u1', clientId: 9, previousClientId: 7, photos: PHOTOS, date: DATE,
        });
        expect(rows.every(r => r.client_id === 9)).toBe(true);
        expect(unlinkClientId).toBe(7);
        expect(unlinkUrls).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    });

    it('vide la fiche quand le client est retiré du rapport', () => {
        const { rows, unlinkClientId, unlinkUrls } = planReportPhotoLink({
            userId: 'u1', clientId: null, previousClientId: 7, photos: PHOTOS, date: DATE,
        });
        expect(rows).toEqual([]);
        expect(unlinkClientId).toBe(7);
        expect(unlinkUrls).toHaveLength(2);
    });

    it('ne bouge rien quand le client du rapport n\'a pas changé', () => {
        const { unlinkClientId, unlinkUrls } = planReportPhotoLink({
            userId: 'u1', clientId: '7', previousClientId: 7, photos: PHOTOS, linkedUrls: PHOTOS.map(p => p.url), date: DATE,
        });
        expect(unlinkClientId).toBeNull();
        expect(unlinkUrls).toEqual([]);
    });

    it('laisse de côté les photos encore sans URL (envoi en cours ou échoué)', () => {
        const { rows } = planReportPhotoLink({
            userId: 'u1', clientId: 7, photos: [...PHOTOS, { name: 'c.jpg' }], date: DATE,
        });
        expect(rows).toHaveLength(2);
    });
});
