import { describe, it, expect } from 'vitest';
import {
    isDepositInvoice, isBalanceInvoice, isSituationInvoice, paymentReceivedKind, paymentProjectTitle, buildPaymentReceivedEmail,
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

describe('isSituationInvoice', () => {
    it('reconnaît une situation par son contexte ou son titre', () => {
        expect(isSituationInvoice({ type: 'invoice', title: 'Cuisine', amendment_details: { situation: { index: 2 } } })).toBe(true);
        expect(isSituationInvoice({ type: 'invoice', title: 'Situation de travaux n°1' })).toBe(true);
        expect(isSituationInvoice({ type: 'invoice', title: 'Dépannage' })).toBe(false);
        expect(isSituationInvoice({ type: 'invoice', status: 'cancelled', title: 'Situation - Cuisine' })).toBe(false);
    });

    it("prime sur l'acompte et le solde (lignes de matériel remboursé à prix négatif)", () => {
        const doc = {
            type: 'invoice', title: 'Situation - Cuisine',
            items: [{ description: 'Déduction acompte matériel (Avancement: -50%)', price: -200 }],
        };
        expect(paymentReceivedKind(doc)).toBe('situation');
        expect(isBalanceInvoice(doc)).toBe(false);
        expect(isDepositInvoice(doc)).toBe(false);
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
        expect(paymentProjectTitle({ title: 'Situation de travaux n°2 - Extension' })).toBe('Extension');
        expect(paymentProjectTitle({ title: 'Situation - X', amendment_details: { situation: { parent_title: 'Maison Durand' } } })).toBe('Maison Durand');
        expect(paymentProjectTitle({ title: 'Situation de travaux n°1' })).toBe('');
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

    it('situation : confirme le règlement, les travaux continuent, rappelle le reste à facturer', () => {
        const { subject, body } = buildPaymentReceivedEmail({
            kind: 'situation',
            invoice: {
                title: 'Situation - Extension', total_ttc: 1500, invoice_number: 'FAC-2026-0110', payment_method: 'virement',
                amendment_details: { situation: { index: 2, remaining_ttc: 3200 } },
            },
            parentQuote: { title: 'Extension garage', quote_number: 51 },
            client: { name: 'M. Bernard Luc' },
            userProfile,
        });
        expect(subject).toBe('Règlement bien reçu - Situation n°2 - Extension garage - Red Den Connexion');
        expect(body).toMatch(/^Bonjour M\. Bernard,/);
        expect(body).toContain('règlement de la situation de travaux n°2 de 1');
        expect(body).toContain('par virement (facture FAC-2026-0110)');
        expect(body).toContain('Les travaux de votre chantier « Extension garage » (devis n°51) se poursuivent');
        expect(body).toContain('il reste 3');
        expect(body).not.toContain('commande du matériel');
    });

    it('situation : sans numéro ni reste connu', () => {
        const { subject, body } = buildPaymentReceivedEmail({ kind: 'situation', invoice: { title: 'Situation - Cuisine' }, userProfile });
        expect(subject).toBe('Règlement bien reçu - Situation - Cuisine - Red Den Connexion');
        expect(body).toContain('règlement de la situation de travaux. Merci.');
        expect(body).not.toContain('il reste');
    });
});
