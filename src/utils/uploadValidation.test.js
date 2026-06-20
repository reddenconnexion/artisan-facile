import { describe, it, expect } from 'vitest';
import { validateFileForUpload, UPLOAD_PRESETS } from './uploadValidation';

// Construit un objet type-File à partir d'octets (Blob suffit : la validation
// n'utilise que size, type, slice/arrayBuffer).
const makeFile = (bytes, type) => new Blob([new Uint8Array(bytes)], { type });

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // "%PDF-1.7"
const pad = (n) => Array.from({ length: n }, () => 0x20); // espaces

describe('validateFileForUpload — PDF', () => {
    it('accepte un PDF standard (%PDF au début)', async () => {
        const file = makeFile([...PDF_HEADER, ...pad(50)], 'application/pdf');
        const res = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
        expect(res.ok).toBe(true);
    });

    it('accepte un PDF avec des octets parasites avant l\'en-tête', async () => {
        // Cas réel : BOM/espaces/sauts de ligne avant "%PDF" (export mobile, scanners)
        const leading = [0xEF, 0xBB, 0xBF, 0x0A, 0x0D, ...pad(10)];
        const file = makeFile([...leading, ...PDF_HEADER, ...pad(50)], 'application/pdf');
        const res = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
        expect(res.ok).toBe(true);
    });

    it('rejette un fichier annoncé PDF mais sans en-tête %PDF', async () => {
        const file = makeFile([...pad(1100)], 'application/pdf');
        const res = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
        expect(res.ok).toBe(false);
    });

    it('rejette un type non autorisé', async () => {
        const file = makeFile(PDF_HEADER, 'image/png');
        const res = await validateFileForUpload(file, UPLOAD_PRESETS.pdf);
        expect(res.ok).toBe(false);
    });
});
