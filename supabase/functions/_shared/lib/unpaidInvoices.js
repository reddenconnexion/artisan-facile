// Relance des factures impayées : quelles factures sont en retard, quel rappel
// leur est dû, et le texte de ce rappel. Logique pure (aucun accès réseau),
// les requêtes vivent dans followUpService.

import { clientGreetingName } from './clientGreeting.js';
import { formatDate, formatPrice } from './format.js';
import { renderTemplate } from './mailTemplate.js';

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

/**
 * Documents déjà facturés par des factures filles (acompte, situation,
 * clôture — `parent_id`) : c'est la facture fille qui est due, pas le parent,
 * même quand celui-ci porte lui-même `type: 'invoice'`.
 */
export const idsBilledByChildren = (docs) => new Set(
    (docs || [])
        .filter(d => d.type === 'invoice' && d.parent_id != null && d.status !== 'cancelled')
        .map(d => d.parent_id)
);

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

// ── Modèles des rappels, modifiables par l'artisan ───────────────────────────
// Stockés dans les réglages du pilote (autopilot_settings.invoice_templates) et
// utilisés partout : rappels automatiques et rappels envoyés à la main.

export const INVOICE_TEMPLATE_KINDS = [
    { key: 'amiable', label: 'Rappel aimable', when: "3 jours après l'échéance" },
    { key: 'ferme', label: 'Rappel ferme', when: '10 jours plus tard' },
    { key: 'mise_en_demeure', label: 'Mise en demeure', when: 'envoyée par vous seulement' },
];

export const INVOICE_PLACEHOLDERS = ['client', 'facture', 'montant', 'date', 'echeance', 'retard', 'dernier_rappel', 'iban', 'indemnite', 'entreprise'];
const INVOICE_OPTIONAL = ['iban'];
const LEVEL_KINDS = ['amiable', 'ferme', 'mise_en_demeure'];

const FACTS = "la facture {facture} du {date}, d'un montant de {montant} TTC, arrivée à échéance le {echeance}";
const IBAN_LINE = 'Pour rappel, le règlement peut se faire par virement sur le compte suivant : {iban}';
const PAID_LINE = 'Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.';

export const DEFAULT_INVOICE_TEMPLATES = {
    amiable: {
        subject: 'Rappel : facture {facture} en attente de règlement',
        body: 'Bonjour {client},\n\n' +
            `Sauf erreur de notre part, ${FACTS}, n'a pas encore été réglée.\n\n` +
            "Il s'agit sans doute d'un simple oubli : pourriez-vous procéder au règlement dans les meilleurs délais ?\n\n" +
            `${IBAN_LINE}\n\n${PAID_LINE}`,
    },
    ferme: {
        subject: '2e rappel : facture {facture} impayée',
        body: 'Bonjour {client},\n\n' +
            `Malgré notre précédent rappel {dernier_rappel}, ${FACTS}, reste impayée à ce jour, soit {retard} jours de retard.\n\n` +
            'Nous vous remercions de bien vouloir régulariser la situation sous 8 jours. ' +
            'Nous vous rappelons que des pénalités de retard sont prévues aux conditions figurant sur la facture.\n\n' +
            `${IBAN_LINE}\n\n${PAID_LINE}`,
    },
    mise_en_demeure: {
        subject: 'Mise en demeure de payer : facture {facture}',
        body: 'Bonjour {client},\n\n' +
            `Malgré nos précédentes relances, ${FACTS}, reste impayée à ce jour, soit {retard} jours de retard.\n\n` +
            'Par la présente, nous vous mettons en demeure de régler la somme de {montant} TTC dans un délai de 8 jours à compter de la réception de ce courrier.\n\n' +
            "À défaut de règlement dans ce délai, nous serons contraints d'engager une procédure de recouvrement. " +
            'Les pénalités de retard prévues aux conditions de la facture seront alors exigibles{indemnite}.\n\n' +
            IBAN_LINE,
    },
};

/** Modèle de l'artisan pour ce niveau de rappel, à défaut celui de l'appli. */
export const invoiceTemplate = (kind, settings) => {
    const custom = settings?.invoice_templates?.[kind] || {};
    const base = DEFAULT_INVOICE_TEMPLATES[kind] || DEFAULT_INVOICE_TEMPLATES.amiable;
    const subject = String(custom.subject || '').trim();
    const body = String(custom.body || '').trim();
    return { subject: subject || base.subject, body: body || base.body, custom: Boolean(subject || body) };
};

/**
 * E-mail de rappel pour le niveau `status.level` (aimable, ferme, mise en
 * demeure), d'après le modèle de l'artisan s'il en a écrit un. Modifiable
 * ensuite par l'artisan avant envoi.
 */
export const buildInvoiceReminderEmail = (invoice, status, { client, profile, settings } = {}) => {
    const lastReminder = invoice.last_followup_at ? formatDate(invoice.last_followup_at) : '';
    const vars = {
        client: clientGreetingName(client?.name, 'fr', client?.civility) || '',
        facture: invoiceReference(invoice),
        montant: formatPrice(invoice.total_ttc, '—'),
        date: formatDate(invoice.date),
        echeance: formatDate(status.dueDate),
        retard: String(status.daysOverdue ?? ''),
        // « du 10/09/2026 », vide s'il n'y a pas encore eu de rappel.
        dernier_rappel: lastReminder ? `du ${lastReminder}` : '',
        iban: profile?.iban || '',
        indemnite: isProfessionalClient(client)
            ? ", ainsi que l'indemnité forfaitaire pour frais de recouvrement de 40 € (article L441-10 du Code de commerce)"
            : '',
        entreprise: profile?.company_name || profile?.full_name || '',
    };
    const kind = LEVEL_KINDS[Math.min(Math.max(status.level || 0, 0), LEVEL_KINDS.length - 1)];
    const tpl = invoiceTemplate(kind, settings);
    const signature = ['Cordialement,', profile?.full_name, profile?.company_name].filter(Boolean).join('\n');
    return {
        subject: renderTemplate(tpl.subject, vars, INVOICE_OPTIONAL),
        body: `${renderTemplate(tpl.body, vars, INVOICE_OPTIONAL)}\n\n${signature}`,
    };
};
