// Bloc « Bon pour accord » d'un devis signé, vérifié sur le PDF réellement
// produit. Deux régressions y sont verrouillées :
//   - la fiche devis doit transmettre au PDF la date et la mention de signature
//     relues en base (elles disparaissaient au rechargement de la page) ;
//   - une mention longue est renvoyée à la ligne au lieu de sortir de la page.

import { describe, expect, it, vi } from 'vitest';
import { generateDevisPDF } from './pdfGenerator';

// quoteHelpers importe le client Supabase, qui exige ses variables
// d'environnement : inutile ici, on ne teste que la conversion des données.
vi.mock('./supabase', () => ({ supabase: {} }));

import { quoteRowToFormData } from '../pages/devis-form/quoteHelpers';

// PNG 2 × 1 px, noir opaque.
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGNgYGD4D8IABgMB/8+HxnAAAAAASUVORK5CYII=';

const quote = (over = {}) => ({
    id: 1,
    quote_number: 326,
    date: '2026-11-27',
    items: [{ id: 'a', description: 'Borne de recharge', quantity: 1, price: 100, type: 'service' }],
    total_ht: 100,
    total_tva: 20,
    total_ttc: 120,
    include_tva: true,
    title: 'Borne',
    type: 'quote',
    status: 'accepted',
    ...over,
});

const client = { name: 'Client Test', address: '1 rue des Lilas' };
const artisan = { company_name: 'Red Den Connexion', full_name: 'Denis Meriot', siret: '12345678900011' };

const pdfText = async (q) => {
    const blob = await generateDevisPDF(q, client, artisan, false, 'blob');
    return new TextDecoder('latin1').decode(await blob.arrayBuffer());
};

describe('bloc de signature du PDF', () => {
    it('la fiche devis relit la date et la mention de signature', () => {
        const form = quoteRowToFormData({
            date: '2026-11-27',
            items: [],
            signed_at: '2026-11-27T15:37:55Z',
            bon_pour_accord: 'Bon pour accord',
        });
        expect(form.signed_at).toBe('2026-11-27T15:37:55Z');
        expect(form.bon_pour_accord).toBe('Bon pour accord');
    });

    it('imprime la signature et sa date', async () => {
        const signed = await pdfText(quote({ signature: SIGNATURE, signed_at: '2026-11-27T15:37:55Z' }));
        expect(signed).toContain('/Subtype /Image');
        expect(signed).toContain('27/11/2026');

        const unsigned = await pdfText(quote({ status: 'sent' }));
        expect(unsigned).not.toContain('/Subtype /Image');
    });

    it('renvoie une mention longue à la ligne', async () => {
        const mention = 'Devis signe sur papier et renvoye par mail avec la mention manuscrite lu et approuve pour borne conforme, acompte recu par virement';
        const text = await pdfText(quote({ signature: SIGNATURE, bon_pour_accord: mention }));
        expect(text).toContain('Devis signe sur papier');
        expect(text).not.toContain(mention);
    });
});
