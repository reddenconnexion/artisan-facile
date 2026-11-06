import { describe, it, expect } from 'vitest';
import {
    invoiceEmailKind, invoiceEmailProjectName, invoiceEmailSubjectPrefix, buildInvoiceEmailIntro,
} from './invoiceEmail';

const closing = { type: 'invoice', status: 'billed', title: 'Facture de Clôture - Mise en Conformité Électrique 4 Appartements' };

describe('invoiceEmailKind', () => {
    it('distingue clôture, solde, acompte et facture simple', () => {
        expect(invoiceEmailKind(closing)).toBe('closing');
        expect(invoiceEmailKind({ type: 'invoice', title: 'Solde', items: [{ description: 'Déduction acompte', price: -300 }] })).toBe('balance');
        expect(invoiceEmailKind({ type: 'invoice', title: "Facture d'acompte (30%) - Garage" })).toBe('deposit');
        expect(invoiceEmailKind({ type: 'invoice', title: 'Dépannage prise cuisine' })).toBe('standard');
    });
});

describe('invoiceEmailProjectName', () => {
    it('retire le préfixe « Facture de … »', () => {
        expect(invoiceEmailProjectName(closing)).toBe('Mise en Conformité Électrique 4 Appartements');
        expect(invoiceEmailProjectName({ title: 'Dépannage prise cuisine' })).toBe('Dépannage prise cuisine');
        expect(invoiceEmailProjectName({ title: 'Facture de clôture' })).toBe('');
        expect(invoiceEmailProjectName({ title: 'Facture' })).toBe('');
    });
    it('gère le titre traduit en anglais', () => {
        expect(invoiceEmailProjectName(closing, 'en', 'Final invoice - Electrical compliance')).toBe('Electrical compliance');
        expect(invoiceEmailProjectName(closing, 'en', 'Final invoice')).toBe('');
    });
});

describe('invoiceEmailSubjectPrefix', () => {
    it('nomme le type de facture', () => {
        expect(invoiceEmailSubjectPrefix('closing')).toBe('Facture de clôture');
        expect(invoiceEmailSubjectPrefix('standard', 'fr', true)).toBe('Facture acquittée');
        expect(invoiceEmailSubjectPrefix('deposit', 'en')).toBe('Deposit invoice');
    });
});

describe('buildInvoiceEmailIntro', () => {
    it('facture de clôture : ne répète plus « Facture de Clôture » dans le nom du projet', () => {
        const intro = buildInvoiceEmailIntro({
            kind: 'closing',
            projectName: 'Mise en Conformité Électrique 4 Appartements',
            greetingName: 'Mme Lafitte',
        });
        expect(intro).toBe(
            'Bonjour Mme Lafitte,\n\n'
            + 'Les travaux « Mise en Conformité Électrique 4 Appartements » étant terminés, je vous transmets la facture de clôture du chantier.\n'
            + 'Vous pouvez la consulter et la télécharger via le lien ci-dessous.'
        );
    });
    it('facture simple, acompte et sans titre', () => {
        expect(buildInvoiceEmailIntro({ kind: 'standard', projectName: 'Dépannage prise', greetingName: 'M. Durand' }))
            .toContain('Je vous transmets la facture des travaux « Dépannage prise ».');
        expect(buildInvoiceEmailIntro({ kind: 'deposit', projectName: 'Garage', greetingName: 'M. Durand' }))
            .toContain("Comme convenu, je vous transmets la facture d'acompte pour les travaux « Garage ».");
        expect(buildInvoiceEmailIntro({ kind: 'standard', projectName: '', greetingName: 'M. Durand' }))
            .toContain('Je vous transmets votre facture.');
    });
    it('facture acquittée', () => {
        const intro = buildInvoiceEmailIntro({ kind: 'closing', projectName: 'Garage', greetingName: 'M. Durand', paid: true, paidDate: '05/11/2026' });
        expect(intro).toContain('Votre règlement du 05/11/2026 a bien été reçu, je vous en remercie.');
        expect(intro).toContain('la facture de clôture acquittée des travaux « Garage »');
    });
});
