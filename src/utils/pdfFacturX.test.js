// Une facture sort en Factur-X : le XML EN 16931 est joint au PDF visuel.
// Un devis, lui, reste un PDF simple.

import { describe, expect, it } from 'vitest';
import { generateDevisPDF } from './pdfGenerator';

const doc = (over = {}) => ({
    id: 7,
    quote_number: 12,
    invoice_number: 'F-2026-0007',
    date: '2026-09-01',
    items: [{ id: 'a', description: 'Pose de prises', quantity: 1, price: 100, type: 'service' }],
    total_ht: 100,
    total_tva: 20,
    total_ttc: 120,
    include_tva: true,
    title: 'Rénovation',
    type: 'invoice',
    status: 'sent',
    ...over,
});

const client = { name: 'Client Test', address: '1 rue des Lilas', postal_code: '33230', city: 'Coutras' };
const artisan = { company_name: 'Red Den Connexion', full_name: 'Denis Meriot', siret: '12345678900011' };

const pdfText = async (d, isInvoice) => {
    const blob = await generateDevisPDF(d, client, artisan, isInvoice, 'blob');
    return new TextDecoder('latin1').decode(await blob.arrayBuffer());
};

describe('Factur-X', () => {
    it('joint le XML Factur-X à une facture', async () => {
        const text = await pdfText(doc(), true);
        expect(text).toContain('factur-x.xml');
        // Réécrit par pdf-lib (jsPDF, lui, produit du PDF 1.3).
        expect(text.startsWith('%PDF-1.7')).toBe(true);
    });

    it("ne joint rien à un devis", async () => {
        const text = await pdfText(doc({ type: 'quote' }), false);
        expect(text).not.toContain('factur-x.xml');
    });
});
