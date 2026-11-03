import { describe, it, expect } from 'vitest';
import { isDepositInvoice, depositProjectTitle, buildDepositReceivedEmail } from './depositReceivedEmail';

describe('isDepositInvoice', () => {
    it("reconnaît une facture d'acompte par son titre", () => {
        expect(isDepositInvoice({ type: 'invoice', title: "Facture d'Acompte - Cuisine" })).toBe(true);
        expect(isDepositInvoice({ type: 'invoice', title: 'Acompte matériel - Tableau' })).toBe(true);
    });

    it('reconnaît un acompte par sa ligne', () => {
        const doc = { type: 'invoice', title: 'Facture', items: [{ description: 'Acompte matériel (100%) sur devis n°1', price: 500 }] };
        expect(isDepositInvoice(doc)).toBe(true);
    });

    it('écarte la clôture, les devis, les factures classiques et les annulées', () => {
        expect(isDepositInvoice({ type: 'invoice', title: 'Facture de clôture - Cuisine' })).toBe(false);
        expect(isDepositInvoice({ type: 'quote', title: 'Acompte' })).toBe(false);
        expect(isDepositInvoice({ type: 'invoice', title: 'Dépannage' })).toBe(false);
        expect(isDepositInvoice({ type: 'invoice', status: 'cancelled', title: 'Acompte' })).toBe(false);
        // Ligne de déduction d'acompte (prix négatif) : facture de solde, pas un acompte.
        expect(isDepositInvoice({ type: 'invoice', title: 'Facture', items: [{ description: 'Acompte déjà versé', price: -300 }] })).toBe(false);
    });
});

describe('depositProjectTitle', () => {
    it("prend le titre du devis d'origine", () => {
        expect(depositProjectTitle({ title: "Facture d'acompte - X" }, { title: 'Rénovation cuisine' })).toBe('Rénovation cuisine');
    });

    it("retire le préfixe d'acompte à défaut de devis", () => {
        expect(depositProjectTitle({ title: "Facture d'Acompte (30%) - Salle de bain" })).toBe('Salle de bain');
        expect(depositProjectTitle({ title: 'Acompte matériel - Tableau électrique' })).toBe('Tableau électrique');
        expect(depositProjectTitle({ title: 'Acompte' })).toBe('');
    });
});

describe('buildDepositReceivedEmail', () => {
    const userProfile = { company_name: 'Red Den Connexion', full_name: 'Denis Meriot', phone: '06 00 00 00 00', email: 'denis@example.fr' };

    it('confirme le montant reçu et annonce la commande du matériel', () => {
        const { subject, body } = buildDepositReceivedEmail({
            deposit: { title: "Facture d'acompte - Cuisine", total_ttc: 1200, invoice_number: 'FAC-2026-0101', payment_method: 'virement' },
            parentQuote: { title: 'Rénovation cuisine', quote_number: 42 },
            client: { name: 'M. Dupont Jean' },
            userProfile,
        });
        expect(subject).toBe('Acompte bien reçu - Rénovation cuisine - Red Den Connexion');
        expect(body).toMatch(/^Bonjour M\. Dupont,/);
        expect(body).toContain('acompte de 1');
        expect(body).toContain('par virement (facture FAC-2026-0101)');
        expect(body).toContain('Je lance dès à présent la commande du matériel pour votre chantier « Rénovation cuisine » (devis n°42).');
        expect(body).toContain('Denis Meriot');
        expect(body).toContain('06 00 00 00 00');
    });

    it('reste lisible sans montant, client ni chantier connus', () => {
        const { subject, body } = buildDepositReceivedEmail({ deposit: { title: 'Acompte' }, userProfile });
        expect(subject).toBe('Acompte bien reçu - Red Den Connexion');
        expect(body).toMatch(/^Bonjour,/);
        expect(body).toContain('bonne réception de votre acompte. Merci');
        expect(body).toContain('commande du matériel pour votre chantier.');
    });
});
