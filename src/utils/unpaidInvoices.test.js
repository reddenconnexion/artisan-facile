import { describe, expect, it } from 'vitest';
import {
    buildInvoiceReminderEmail,
    idsBilledByChildren,
    invoiceDueDate,
    invoiceReminderStatus,
    isUnpaidInvoice,
} from './unpaidInvoices';

const TODAY = new Date('2026-09-28T10:00:00');

const invoice = (overrides = {}) => ({
    id: 216,
    type: 'invoice',
    status: 'accepted',
    invoice_number: 'FAC-2026-0042',
    date: '2026-07-01',
    valid_until: '2026-07-31',
    total_ttc: 8592,
    follow_up_count: 0,
    last_followup_at: null,
    ...overrides,
});

describe('isUnpaidInvoice', () => {
    it.each(['accepted', 'billed', 'sent', 'signed'])('une facture au statut %s attend un paiement', (status) => {
        expect(isUnpaidInvoice(invoice({ status }))).toBe(true);
    });

    it.each(['paid', 'cancelled', 'draft'])('une facture au statut %s n’attend rien', (status) => {
        expect(isUnpaidInvoice(invoice({ status }))).toBe(false);
    });

    it('ignore les devis, les avoirs et les factures archivées', () => {
        expect(isUnpaidInvoice(invoice({ type: 'quote' }))).toBe(false);
        expect(isUnpaidInvoice(invoice({ type: 'credit_note' }))).toBe(false);
        expect(isUnpaidInvoice(invoice({ archived_at: '2026-09-01' }))).toBe(false);
    });
});

describe('idsBilledByChildren', () => {
    // Cas réel : un document « invoice » au statut accepté, entièrement réglé
    // par sa facture d'acompte et sa facture de clôture (parent_id).
    const docs = [
        invoice({ id: 114, status: 'accepted' }),
        invoice({ id: 128, parent_id: 114, status: 'paid' }),
        invoice({ id: 167, parent_id: 114, status: 'paid' }),
        invoice({ id: 298, parent_id: 197, status: 'cancelled' }),
        { id: 181, type: 'amendment', parent_id: 169, status: 'accepted' },
    ];

    it('le parent facturé par ses factures filles n’est pas dû lui-même', () => {
        expect(idsBilledByChildren(docs).has(114)).toBe(true);
    });

    it('une facture fille annulée ou un avenant ne comptent pas', () => {
        const ids = idsBilledByChildren(docs);
        expect(ids.has(197)).toBe(false);
        expect(ids.has(169)).toBe(false);
    });
});

describe('invoiceDueDate — même règle que le PDF', () => {
    it('échéance = valid_until quand elle est renseignée', () => {
        expect(invoiceDueDate(invoice()).toDateString()).toBe(new Date('2026-07-31T00:00:00').toDateString());
    });

    it('payable à réception sinon : échéance = date d’émission', () => {
        expect(invoiceDueDate(invoice({ valid_until: null, date: '2026-09-19' })).toDateString())
            .toBe(new Date('2026-09-19T00:00:00').toDateString());
    });
});

describe('invoiceReminderStatus', () => {
    it('rien tant que l’échéance n’est pas dépassée', () => {
        expect(invoiceReminderStatus(invoice({ valid_until: '2026-10-07' }), TODAY)).toBeNull();
        expect(invoiceReminderStatus(invoice({ valid_until: '2026-09-28' }), TODAY)).toBeNull();
    });

    it('en retard mais dans le délai de grâce : listée, pas encore à relancer', () => {
        const s = invoiceReminderStatus(invoice({ valid_until: '2026-09-26' }), TODAY);
        expect(s.daysOverdue).toBe(2);
        expect(s.dueNow).toBe(false);
        expect(s.nextReminderDate.toDateString()).toBe(new Date('2026-09-29T00:00:00').toDateString());
    });

    it('premier rappel amiable une fois le délai de grâce passé', () => {
        const s = invoiceReminderStatus(invoice(), TODAY);
        expect(s).toMatchObject({ daysOverdue: 59, level: 0, label: 'Rappel amiable', dueNow: true, exhausted: false });
    });

    it('ignore un last_followup_at hérité des relances du devis', () => {
        const s = invoiceReminderStatus(invoice({ last_followup_at: '2026-09-27T09:00:00Z' }), TODAY);
        expect(s.dueNow).toBe(true);
    });

    it('relance ferme 10 jours après le premier rappel, pas avant', () => {
        const recent = invoiceReminderStatus(invoice({ follow_up_count: 1, last_followup_at: '2026-09-20T09:00:00' }), TODAY);
        expect(recent).toMatchObject({ level: 1, label: 'Relance ferme', dueNow: false });
        const old = invoiceReminderStatus(invoice({ follow_up_count: 1, last_followup_at: '2026-09-18T09:00:00' }), TODAY);
        expect(old.dueNow).toBe(true);
    });

    it('mise en demeure au troisième rappel, puis plus de rappel automatique', () => {
        expect(invoiceReminderStatus(invoice({ follow_up_count: 2, last_followup_at: '2026-09-01' }), TODAY))
            .toMatchObject({ level: 2, label: 'Mise en demeure', dueNow: true });
        expect(invoiceReminderStatus(invoice({ follow_up_count: 3, last_followup_at: '2026-09-01' }), TODAY))
            .toMatchObject({ exhausted: true, dueNow: false, nextReminderDate: null });
    });

    it('respecte un report (snooze)', () => {
        const s = invoiceReminderStatus(invoice({ relance_snoozed_until: '2026-10-01' }), TODAY);
        expect(s.dueNow).toBe(false);
    });

    it('rien pour une facture payée', () => {
        expect(invoiceReminderStatus(invoice({ status: 'paid' }), TODAY)).toBeNull();
    });
});

describe('buildInvoiceReminderEmail', () => {
    const client = { name: 'M. Dupont Jean' };
    const profile = { full_name: 'Denis Meriot', company_name: 'Red Den Connexion', iban: 'FR76 1234' };

    it('rappel amiable : référence, montant, échéance, IBAN et signature', () => {
        const s = invoiceReminderStatus(invoice(), TODAY);
        const { subject, body } = buildInvoiceReminderEmail(invoice(), s, { client, profile });
        expect(subject).toBe('Rappel : facture FAC-2026-0042 en attente de règlement');
        expect(body).toContain('Bonjour M. Dupont,');
        expect(body).toContain('la facture FAC-2026-0042 du 01/07/2026');
        expect(body).toMatch(/8\s592,00 € TTC/);
        expect(body).toContain('arrivée à échéance le 31/07/2026');
        expect(body).toContain('FR76 1234');
        expect(body).toMatch(/Cordialement,\nDenis Meriot\nRed Den Connexion$/);
    });

    it('relance ferme : cite le rappel précédent et le retard', () => {
        const inv = invoice({ follow_up_count: 1, last_followup_at: '2026-09-10T09:00:00' });
        const { subject, body } = buildInvoiceReminderEmail(inv, invoiceReminderStatus(inv, TODAY), { client, profile });
        expect(subject).toBe('2e rappel : facture FAC-2026-0042 impayée');
        expect(body).toContain('précédent rappel du 10/09/2026');
        expect(body).toContain('59 jours de retard');
    });

    it('mise en demeure : indemnité de 40 € réservée aux clients professionnels', () => {
        const inv = invoice({ follow_up_count: 2, last_followup_at: '2026-09-01' });
        const s = invoiceReminderStatus(inv, TODAY);
        const particulier = buildInvoiceReminderEmail(inv, s, { client, profile }).body;
        const pro = buildInvoiceReminderEmail(inv, s, { client: { ...client, siren: '123456789' }, profile }).body;
        expect(particulier).toContain('mettons en demeure');
        expect(particulier).not.toContain('40 €');
        expect(pro).toContain('indemnité forfaitaire pour frais de recouvrement de 40 €');
    });

    it('sans numéro de facture ni IBAN', () => {
        const inv = invoice({ invoice_number: null, quote_number: 17 });
        const { subject, body } = buildInvoiceReminderEmail(inv, invoiceReminderStatus(inv, TODAY), { client, profile: {} });
        expect(subject).toContain('facture n°17');
        expect(body).not.toContain('virement');
    });
});
