import { describe, it, expect } from 'vitest';
import {
    isDepositInvoice, isBalanceInvoice, paymentReceivedKind, paymentProjectTitle, buildPaymentReceivedEmail,
} from './paymentReceivedEmail';

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

describe('isBalanceInvoice', () => {
    it('reconnaît la facture de clôture', () => {
        expect(isBalanceInvoice({ type: 'invoice', title: 'Facture de Clôture - Cuisine' })).toBe(true);
    });

    it('reconnaît une facture qui déduit un acompte', () => {
        const doc = {
            type: 'invoice', title: 'Rénovation cuisine',
            items: [
                { description: 'Tableau électrique', price: 900 },
                { description: "Déduction Facture d'Acompte - Cuisine du 12/10/2026", price: -300 },
            ],
        };
        expect(isBalanceInvoice(doc)).toBe(true);
        expect(paymentReceivedKind(doc)).toBe('balance');
    });

    it("écarte une facture classique, l'acompte et une clôture annulée", () => {
        expect(isBalanceInvoice({ type: 'invoice', title: 'Dépannage', items: [{ description: 'Remise', price: -20 }] })).toBe(false);
        expect(isBalanceInvoice({ type: 'invoice', title: "Facture d'Acompte - Cuisine" })).toBe(false);
        expect(isBalanceInvoice({ type: 'invoice', status: 'cancelled', title: 'Facture de Clôture - Cuisine' })).toBe(false);
        expect(paymentReceivedKind({ type: 'invoice', title: 'Dépannage' })).toBe(null);
    });
});

describe('paymentProjectTitle', () => {
    it("prend le titre du devis d'origine", () => {
        expect(paymentProjectTitle({ title: "Facture d'acompte - X" }, { title: 'Rénovation cuisine' })).toBe('Rénovation cuisine');
    });

    it('retire le préfixe de la facture à défaut de devis', () => {
        expect(paymentProjectTitle({ title: "Facture d'Acompte (30%) - Salle de bain" })).toBe('Salle de bain');
        expect(paymentProjectTitle({ title: 'Acompte matériel - Tableau électrique' })).toBe('Tableau électrique');
        expect(paymentProjectTitle({ title: 'Facture de Clôture - Garage' })).toBe('Garage');
        expect(paymentProjectTitle({ title: 'Acompte' })).toBe('');
    });
});

describe('buildPaymentReceivedEmail', () => {
    const userProfile = { company_name: 'Red Den Connexion', full_name: 'Denis Meriot', phone: '06 00 00 00 00', email: 'denis@example.fr' };

    it('acompte : confirme le montant reçu et annonce la commande du matériel', () => {
        const { subject, body } = buildPaymentReceivedEmail({
            invoice: { title: "Facture d'acompte - Cuisine", total_ttc: 1200, invoice_number: 'FAC-2026-0101', payment_method: 'virement' },
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

    it('acompte : reste lisible sans montant, client ni chantier connus', () => {
        const { subject, body } = buildPaymentReceivedEmail({ invoice: { title: 'Acompte' }, userProfile });
        expect(subject).toBe('Acompte bien reçu - Red Den Connexion');
        expect(body).toMatch(/^Bonjour,/);
        expect(body).toContain('bonne réception de votre acompte. Merci');
        expect(body).toContain('commande du matériel pour votre chantier.');
    });

    it('solde : confirme le règlement et annonce le chantier soldé', () => {
        const { subject, body } = buildPaymentReceivedEmail({
            kind: 'balance',
            invoice: { title: 'Facture de Clôture - Cuisine', total_ttc: 2800, invoice_number: 'FAC-2026-0120', payment_method: 'cheque' },
            parentQuote: { title: 'Rénovation cuisine', quote_number: 42 },
            client: { name: 'Mme Martin Claire' },
            userProfile,
        });
        expect(subject).toBe('Solde bien reçu - Rénovation cuisine - Red Den Connexion');
        expect(body).toMatch(/^Bonjour Mme Martin,/);
        expect(body).toContain('bonne réception du règlement du solde de 2');
        expect(body).toContain('par chèque (facture FAC-2026-0120)');
        expect(body).toContain('Votre chantier « Rénovation cuisine » (devis n°42) est désormais entièrement réglé.');
        expect(body).not.toContain('commande du matériel');
    });
});
