// Relance des factures impayées : quelles factures sont en retard, quel rappel
// leur est dû, et le texte de ce rappel. Logique pure (aucun accès réseau),
// les requêtes vivent dans followUpService.

import { clientGreetingName } from './clientGreeting';
import { formatDate, formatPrice } from './format';

// Statuts d'une facture qui n'attend plus aucun paiement.
const SETTLED_STATUSES = ['paid', 'cancelled', 'draft'];

// Délai de grâce après l'échéance avant le premier rappel, puis écart minimal
// entre deux rappels : un rappel le lendemain de l'échéance braque le client,
// un écart trop court entre deux relances aussi.
export const GRACE_DAYS = 3;
export const DAYS_BETWEEN_REMINDERS = 10;

export const REMINDER_LEVELS = [
    { label: 'Rappel amiable', tone: 'amiable' },
    { label: 'Relance ferme', tone: 'ferme' },
    { label: 'Mise en demeure', tone: 'mise_en_demeure' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
};

const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

export const isUnpaidInvoice = (doc) =>
    doc?.type === 'invoice' && !SETTLED_STATUSES.includes(doc.status || 'draft') && !doc.archived_at;

// Même règle que le PDF de la facture : l'échéance imprimée est `valid_until`,
// à défaut la facture est payable à réception, donc à sa date d'émission.
export const invoiceDueDate = (invoice) => startOfDay(invoice.valid_until || invoice.date);

export const invoiceReference = (invoice) =>
    invoice.invoice_number || `n°${invoice.quote_number || invoice.id}`;

/**
 * Situation de relance d'une facture impayée à la date `today`.
 * Le compteur de rappels réutilise `follow_up_count` / `last_followup_at`,
 * les colonnes de relance déjà portées par chaque document.
 *
 * @returns {null | {
 *   daysOverdue: number, dueDate: Date, level: number, label: string,
 *   dueNow: boolean, nextReminderDate: Date | null, exhausted: boolean
 * }} null si la facture n'est pas (encore) en retard.
 */
export const invoiceReminderStatus = (invoice, today = new Date()) => {
    if (!isUnpaidInvoice(invoice)) return null;

    const dueDate = invoiceDueDate(invoice);
    const daysOverdue = daysBetween(dueDate, today);
    if (daysOverdue < 1) return null;

    const sent = invoice.follow_up_count || 0;
    const exhausted = sent >= REMINDER_LEVELS.length;
    const level = Math.min(sent, REMINDER_LEVELS.length - 1);

    // Un `last_followup_at` antérieur au premier rappel de paiement peut dater
    // de la phase devis (relances de signature) : il ne compte qu'une fois un
    // rappel de paiement envoyé.
    const lastReminder = sent > 0 && invoice.last_followup_at ? startOfDay(invoice.last_followup_at) : null;
    const nextReminderDate = exhausted
        ? null
        : lastReminder
            ? new Date(lastReminder.getTime() + DAYS_BETWEEN_REMINDERS * DAY_MS)
            : new Date(dueDate.getTime() + GRACE_DAYS * DAY_MS);

    const snoozedUntil = invoice.relance_snoozed_until ? startOfDay(invoice.relance_snoozed_until) : null;
    const snoozed = snoozedUntil && snoozedUntil > startOfDay(today);

    return {
        daysOverdue,
        dueDate,
        level,
        label: REMINDER_LEVELS[level].label,
        dueNow: !exhausted && !snoozed && startOfDay(today) >= nextReminderDate,
        nextReminderDate,
        exhausted,
    };
};

// Client professionnel : l'indemnité forfaitaire de recouvrement (40 €,
// art. L441-10 du Code de commerce) ne s'applique qu'entre professionnels.
const isProfessionalClient = (client) => Boolean(client?.siren || client?.tva_intracom);

/**
 * E-mail de rappel pour le niveau `status.level`, modifiable ensuite par
 * l'artisan avant envoi.
 */
export const buildInvoiceReminderEmail = (invoice, status, { client, profile } = {}) => {
    const ref = invoiceReference(invoice);
    const amount = formatPrice(invoice.total_ttc, '—');
    const issued = formatDate(invoice.date);
    const due = formatDate(status.dueDate);
    const greeting = `Bonjour ${clientGreetingName(client?.name) || ''}`.trim() + ',';
    const lastReminder = invoice.last_followup_at ? formatDate(invoice.last_followup_at) : null;
    const iban = profile?.iban ? `\n\nPour rappel, le règlement peut se faire par virement sur le compte suivant : ${profile.iban}` : '';
    const signature = ['Cordialement,', profile?.full_name, profile?.company_name].filter(Boolean).join('\n');
    const facts = `la facture ${ref} du ${issued}, d'un montant de ${amount} TTC, arrivée à échéance le ${due}`;

    if (status.level === 0) {
        return {
            subject: `Rappel : facture ${ref} en attente de règlement`,
            body: `${greeting}\n\n` +
                `Sauf erreur de notre part, ${facts}, n'a pas encore été réglée.\n\n` +
                `Il s'agit sans doute d'un simple oubli : pourriez-vous procéder au règlement dans les meilleurs délais ?` +
                `${iban}\n\n` +
                `Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.\n\n` +
                signature,
        };
    }

    if (status.level === 1) {
        return {
            subject: `2e rappel : facture ${ref} impayée`,
            body: `${greeting}\n\n` +
                `Malgré notre précédent rappel${lastReminder ? ` du ${lastReminder}` : ''}, ${facts}, reste impayée à ce jour, soit ${status.daysOverdue} jours de retard.\n\n` +
                `Nous vous remercions de bien vouloir régulariser la situation sous 8 jours. ` +
                `Nous vous rappelons que des pénalités de retard sont prévues aux conditions figurant sur la facture.` +
                `${iban}\n\n` +
                `Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.\n\n` +
                signature,
        };
    }

    const recoveryFee = isProfessionalClient(client)
        ? `, ainsi que l'indemnité forfaitaire pour frais de recouvrement de 40 € (article L441-10 du Code de commerce)`
        : '';
    return {
        subject: `Mise en demeure de payer : facture ${ref}`,
        body: `${greeting}\n\n` +
            `Malgré nos précédentes relances, ${facts}, reste impayée à ce jour, soit ${status.daysOverdue} jours de retard.\n\n` +
            `Par la présente, nous vous mettons en demeure de régler la somme de ${amount} TTC dans un délai de 8 jours à compter de la réception de ce courrier.\n\n` +
            `À défaut de règlement dans ce délai, nous serons contraints d'engager une procédure de recouvrement. ` +
            `Les pénalités de retard prévues aux conditions de la facture seront alors exigibles${recoveryFee}.` +
            `${iban}\n\n` +
            signature,
    };
};
