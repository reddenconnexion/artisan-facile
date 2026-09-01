// Le filigrane « document fermé » est vérifié sur le PDF réellement produit,
// pas seulement sur la décision qui le déclenche : c'est la seule mention qui
// suit un document téléchargé, imprimé, puis signé à la main hors de portée de
// tout contrôle serveur. Si elle disparaît du rendu, plus rien ne distingue un
// devis annulé d'un devis valide sur le papier.
//
// L'assertion porte sur le flux PDF brut (jsPDF n'y compresse pas le texte).
// On y cherche la racine non accentuée du mot — « ANNUL », « SUSPEND » — car
// les accents y sont encodés, pas écrits en clair.

import { describe, expect, it } from 'vitest';
import { generateDevisPDF } from './pdfGenerator';

const baseQuote = (over = {}) => ({
    id: 1,
    quote_number: 42,
    date: '2026-09-01',
    valid_until: '2026-10-01',
    items: [{ id: 'a', description: 'Pose de prises', quantity: 1, price: 100, type: 'service' }],
    total_ht: 100,
    total_tva: 20,
    total_ttc: 120,
    include_tva: true,
    title: 'Rénovation',
    type: 'quote',
    status: 'sent',
    ...over,
});

const client = { name: 'Client Test', address: '1 rue des Lilas' };
const artisan = { company_name: 'Red Den Connexion', full_name: 'Denis Meriot', siret: '12345678900011' };

const pdfText = async (quote, isInvoice = false) => {
    const blob = await generateDevisPDF(quote, client, artisan, isInvoice, 'blob');
    // latin1 (windows-1252) : un octet = un caractère, le flux PDF n'est pas
    // de l'UTF-8 et un décodage strict y perdrait les octets hauts.
    return new TextDecoder('latin1').decode(await blob.arrayBuffer());
};

describe('filigrane des documents fermés', () => {
    it('marque un devis annulé', async () => {
        expect(await pdfText(baseQuote({ status: 'cancelled' }))).toContain('ANNUL');
    });

    it('marque un devis refusé', async () => {
        expect(await pdfText(baseQuote({ status: 'refused' }))).toContain('REFUS');
    });

    // Le cas que le statut seul ne dit pas : lien fermé, devis toujours « envoyé ».
    it('marque un devis dont la signature est suspendue', async () => {
        const text = await pdfText(baseQuote({ status: 'sent', token_revoked: true }));
        expect(text).toContain('SUSPEND');
    });

    it('marque aussi un avenant', async () => {
        expect(await pdfText(baseQuote({ type: 'amendment', status: 'cancelled' }))).toContain('ANNUL');
    });

    it('laisse un devis en cours intact', async () => {
        const text = await pdfText(baseQuote());
        expect(text).not.toContain('ANNUL');
        expect(text).not.toContain('SUSPEND');
    });
});
