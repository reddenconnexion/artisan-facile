import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawTransferQr } from './transferQr';

describe('drawTransferQr', () => {
    it('dessine des modules dans le PDF', () => {
        const doc = new jsPDF();
        const before = doc.internal.pages[1].length;
        drawTransferQr(doc, { x: 10, y: 10, size: 24, iban: 'FR7630006000011234567890189', name: 'Red Den', amount: 360, reference: 'Devis 12' });
        expect(doc.internal.pages[1].length).toBeGreaterThan(before + 50);
    });
    it('ne dessine rien sans montant', () => {
        const doc = new jsPDF();
        const before = doc.internal.pages[1].length;
        drawTransferQr(doc, { x: 10, y: 10, size: 24, iban: 'FR76', amount: 0 });
        expect(doc.internal.pages[1].length).toBe(before);
    });
});
