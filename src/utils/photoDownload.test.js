import { describe, it, expect } from 'vitest';
import { photoFileName } from './photoDownload';

describe('photoFileName', () => {
    it('nomme la photo par catégorie, date et rang', () => {
        expect(photoFileName({ category: 'before', created_at: '2026-10-03T09:15:00' }, 0, 'image/jpeg'))
            .toBe('chantier-avant-2026-10-03-1.jpg');
        expect(photoFileName({ category: 'after', created_at: '2026-01-05T09:15:00' }, 2, 'image/png'))
            .toBe('chantier-apres-2026-01-05-3.png');
    });

    it('reste valide sans catégorie, sans date ni type connu', () => {
        expect(photoFileName({}, 4, 'application/octet-stream')).toBe('chantier-5.jpg');
        expect(photoFileName({ created_at: 'pas une date' }, 0)).toBe('chantier-1.jpg');
    });
});
