// Pilote automatique (plan Pro) : ce que l'appli fait toute seule pour
// l'artisan, et quand.
//
//   1. Relancer les devis envoyés et pas encore signés (séquence de relance
//      de l'artisan : J+7, J+14, J+21 puis clôture à J+34 par défaut).
//   2. Rappeler les factures en retard (rappel amiable puis 2e rappel). La
//      mise en demeure n'est jamais envoyée seule : elle est signalée à
//      l'artisan, qui décide.
//   3. Demander un avis Google à la fin du chantier, quand l'artisan quitte
//      les lieux (après son pointage).
//   4. Résumer la journée le soir (notification).
//
// Logique pure, sans accès réseau : la même source sert l'Edge Function
// `autopilot-run` (qui envoie) et l'appli (qui montre ce qui partirait).

import { clientGreetingName } from './clientGreeting.js';
import { formatDate, formatPrice } from './format.js';
import { idsBilledByChildren, invoiceReminderStatus, buildInvoiceReminderEmail, invoiceReference } from './unpaidInvoices.js';
import { renderTemplate } from './mailTemplate.js';

export { renderTemplate };

export const AUTOPILOT_DEFAULTS = {
    enabled: false,
    quotes: true,
    invoices: true,
    reviews: true,
    summary: true,
};

/** Réglages de l'artisan complétés par les valeurs par défaut. */
export const readAutopilotSettings = (raw) => ({ ...AUTOPILOT_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) });

/** Séquence de relance des devis quand l'artisan n'en a pas défini. */
export const DEFAULT_FOLLOW_UP_STEPS = [
    { delay: 7, label: 'Première relance', context: 'Vérifier que le devis a bien été reçu et proposer de répondre à toute question immédiate.' },
    { delay: 7, label: 'Deuxième relance', context: 'Apporter de la valeur : partager un cas client similaire, une précision technique ou un comparatif pour aider à la décision.' },
    { delay: 7, label: 'Troisième relance', context: 'Proposer un appel téléphonique ou un contact via un autre canal (LinkedIn) pour lever les derniers freins.' },
    { delay: 13, label: 'Message de clôture', context: 'Informer que le devis va être archivé sous peu et proposer un recontact futur si le projet se concrétise.' },
];

export const TIME_ZONE = 'Europe/Paris';
// Envois aux heures de bureau, du lundi au vendredi : un mail de relance reçu
// un dimanche soir fait mauvais effet.
export const SEND_DAYS = [1, 2, 3, 4, 5];
export const SEND_START_HOUR = 9;
export const SEND_END_HOUR = 18;
export const SUMMARY_HOUR = 18;

// Garde-fous : un devis de plus de 60 jours ou expiré n'est plus relancé
// automatiquement (le client a souvent tranché), une facture en retard de
// plus de 90 jours est signalée plutôt que rappelée (elle a peut-être été
// réglée en espèces sans être pointée).
export const MAX_QUOTE_AGE_DAYS = 60;
export const MAX_AUTO_OVERDUE_DAYS = 90;
export const REVIEW_DELAY_DAYS = 2;
export const REVIEW_MAX_DAYS = 30;
export const MAX_EMAILS_PER_DAY = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Date du jour, heure et jour de la semaine à Paris. */
export const parisClock = (now = new Date()) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: TIME_ZONE,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', hourCycle: 'h23', weekday: 'short',
        }).formatToParts(now).map((p) => [p.type, p.value]),
    );
    return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour) % 24,
        weekday: WEEKDAYS[parts.weekday],
    };
};

export const isSendingWindow = (now = new Date()) => {
    const { hour, weekday } = parisClock(now);
    return SEND_DAYS.includes(weekday) && hour >= SEND_START_HOUR && hour < SEND_END_HOUR;
};

/**
 * Prochain passage de l'envoi horaire (h05) dans la plage d'envoi.
 * Les fuseaux de Paris sont décalés d'heures entières : h05 UTC = h05 Paris.
 */
export const nextSendTime = (now = new Date()) => {
    const t = new Date(now.getTime());
    t.setUTCSeconds(0, 0);
    if (t.getUTCMinutes() >= 5 || t.getTime() < now.getTime()) t.setUTCHours(t.getUTCHours() + 1);
    t.setUTCMinutes(5);
    for (let i = 0; i < 8 * 24; i++) {
        if (isSendingWindow(t)) return t;
        t.setUTCHours(t.getUTCHours() + 1);
    }
    return t;
};

const WEEKDAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « aujourd'hui vers 14 h 05 », « demain vers 9 h 05 », « lundi vers 9 h 05 ». */
export const sendTimeLabel = (when, now = new Date()) => {
    const a = parisClock(when);
    const b = parisClock(now);
    const days = Math.round((Date.parse(`${a.dateKey}T00:00:00Z`) - Date.parse(`${b.dateKey}T00:00:00Z`)) / DAY_MS);
    const day = days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : WEEKDAY_NAMES[a.weekday];
    return `${day} vers ${a.hour} h 05`;
};

export const isSummaryHour = (now = new Date()) => {
    const { hour, weekday } = parisClock(now);
    return SEND_DAYS.includes(weekday) && hour === SUMMARY_HOUR;
};

// Numéro de jour (jours depuis 1970) d'une date « AAAA-MM-JJ » ou d'un
// horodatage, ramené au jour calendaire de Paris.
const dayNumber = (value) => {
    if (!value) return null;
    const s = String(value);
    const key = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : parisClock(new Date(value)).dateKey;
    const t = Date.parse(`${key}T00:00:00Z`);
    return Number.isNaN(t) ? null : Math.round(t / DAY_MS);
};

export const isValidEmail = (email) => EMAIL_RE.test(String(email || '').trim());

// ── 1. Relance des devis ─────────────────────────────────────────────────────

/**
 * Relance due aujourd'hui pour un devis envoyé, ou null.
 * @returns {null | { index: number, step: object, isLast: boolean, nextCount: number }}
 */
export const dueQuoteFollowUp = (quote, steps = DEFAULT_FOLLOW_UP_STEPS, now = new Date()) => {
    if (!quote || (quote.type || 'quote') === 'invoice') return null;
    if (quote.status !== 'sent' || quote.archived_at || quote.signed_at) return null;
    if (!Array.isArray(steps) || steps.length === 0) return null;

    const today = dayNumber(now);
    const issued = dayNumber(quote.date || quote.created_at);
    if (issued == null) return null;

    const snoozed = dayNumber(quote.relance_snoozed_until);
    if (snoozed != null && snoozed > today) return null;

    const index = quote.follow_up_count || 0;
    const last = dayNumber(quote.last_followup_at);

    // Projet reporté par le client (« ce sera pour le printemps ») : à la date
    // de reprise, un mail de reprise, même si le devis a expiré entre-temps
    // (on propose de le mettre à jour) ou dépasse 60 jours.
    if (quote.relance_postponed && snoozed != null && (last == null || last < snoozed)) {
        if (today - snoozed > MAX_QUOTE_AGE_DAYS) return null;
        return { index, step: { label: 'Reprise du projet' }, isLast: false, resumed: true, nextCount: index + 1 };
    }

    // Après la reprise d'un projet reporté, la séquence compte depuis la
    // reprise, et l'expiration du devis d'origine ne l'arrête pas.
    const postponed = Boolean(quote.relance_postponed && snoozed != null);
    const start = postponed ? Math.max(issued, snoozed) : issued;
    if (today - start > MAX_QUOTE_AGE_DAYS) return null;
    const validUntil = dayNumber(quote.valid_until);
    if (!postponed && validUntil != null && validUntil < today) return null;
    if (index >= steps.length) return null;

    const reference = index === 0 || last == null ? issued : last;
    const delay = Number(steps[index]?.delay) || 0;
    if (reference + delay > today) return null;

    return { index, step: steps[index], isLast: index === steps.length - 1, nextCount: index + 1 };
};

const signatureLines = (profile) => {
    const head = ['Cordialement,', profile?.full_name || profile?.company_name].filter(Boolean).join('\n');
    // Après le marqueur « -- », l'envoi remplace ces lignes par la signature
    // HTML de l'artisan (logo, téléphone, liens).
    const sig = [profile?.company_name, profile?.phone].filter(Boolean).join('\n');
    return sig ? `${head}\n\n-- \n${sig}` : head;
};

const quoteLabel = (quote) => (quote.title ? `« ${quote.title} »` : `n°${quote.quote_number || quote.id}`);

// ── Modèles de mails, modifiables par l'artisan ──────────────────────────────
//
// Repères entre accolades, remplacés à l'envoi. Une ligne qui contient un
// repère facultatif sans valeur (pas de lien de signature, pas de téléphone,
// devis déjà expiré…) disparaît entièrement, pour ne jamais envoyer
// « Mon numéro : » tout seul. La signature est ajoutée à la fin.

// Relances de devis : un modèle par moment de la séquence.
export const QUOTE_TEMPLATE_KINDS = [
    { key: 'first', label: '1re relance', when: 'J+7' },
    { key: 'middle', label: 'Relances suivantes', when: 'J+14, J+21' },
    { key: 'last', label: 'Dernier message', when: 'J+34' },
    { key: 'resume', label: "Reprise d'un projet reporté", when: 'à la date choisie' },
];

export const QUOTE_PLACEHOLDERS = ['client', 'devis', 'montant', 'date', 'lien', 'telephone', 'validite', 'entreprise'];
const QUOTE_OPTIONAL = ['lien', 'telephone', 'validite'];

const LINK_LINE = 'Vous pouvez le consulter et le signer en ligne ici : {lien}';

export const DEFAULT_QUOTE_TEMPLATES = {
    first: {
        subject: 'Votre devis {devis}',
        body: 'Bonjour {client},\n\n' +
            'Je me permets de revenir vers vous au sujet du devis {devis} ({montant} TTC) que je vous ai adressé le {date}.\n\n' +
            "L'avez-vous bien reçu ? Si vous avez la moindre question sur les travaux, le matériel ou le planning, je suis disponible pour en parler.\n\n" +
            `${LINK_LINE}\n\n` +
            "Pour information, ce devis est valable jusqu'au {validite}.",
    },
    middle: {
        subject: 'Votre projet : devis {devis}',
        body: 'Bonjour {client},\n\n' +
            'Je reviens vers vous concernant le devis {devis} ({montant} TTC).\n\n' +
            'Si certains points vous font hésiter (choix du matériel, planning, budget), je peux tout à fait adapter la proposition. ' +
            'Un simple appel suffit souvent à y voir plus clair, ou répondez directement à ce message.\n' +
            'Mon numéro : {telephone}\n\n' +
            `${LINK_LINE}\n\n` +
            "Pour information, ce devis est valable jusqu'au {validite}.",
    },
    last: {
        subject: "Devis {devis} : votre projet est-il toujours d'actualité ?",
        body: 'Bonjour {client},\n\n' +
            'Je reviens une dernière fois vers vous au sujet du devis {devis} ({montant} TTC).\n\n' +
            'Sans nouvelles de votre part, je vais classer ce dossier prochainement. ' +
            "Si votre projet est toujours d'actualité, même plus tard, il suffit de répondre à ce message ou de m'appeler : je reprendrai le dossier avec plaisir.\n" +
            'Mon numéro : {telephone}\n\n' +
            LINK_LINE,
    },
    resume: {
        subject: 'Votre projet : devis {devis}',
        body: 'Bonjour {client},\n\n' +
            'Comme convenu lors de notre échange, je reviens vers vous au sujet de votre projet et du devis {devis} ({montant} TTC).\n\n' +
            "Est-il toujours d'actualité ? Si les choses ont évolué depuis, je peux mettre le devis à jour et convenir avec vous d'une date pour les travaux. " +
            "Il suffit de répondre à ce message ou de m'appeler.\n" +
            'Mon numéro : {telephone}\n\n' +
            LINK_LINE,
    },
};

/** Quel modèle pour cette relance ? */
export const quoteTemplateKind = (due) => {
    if (due?.resumed) return 'resume';
    // Devis rouvert par le client après expiration : on propose de l'adapter.
    if (due?.reopened) return 'middle';
    if (due?.isLast && due.index > 0) return 'last';
    return due?.index === 0 ? 'first' : 'middle';
};

/** Modèle de l'artisan pour ce moment, à défaut celui de l'appli. */
export const quoteTemplate = (kind, settings) => {
    const custom = readAutopilotSettings(settings).quote_templates?.[kind] || {};
    const base = DEFAULT_QUOTE_TEMPLATES[kind] || DEFAULT_QUOTE_TEMPLATES.middle;
    return {
        subject: String(custom.subject || '').trim() || base.subject,
        body: String(custom.body || '').trim() || base.body,
        custom: Boolean(String(custom.subject || '').trim() || String(custom.body || '').trim()),
    };
};

/**
 * E-mail de relance d'un devis, selon l'étape : accusé de réception, puis
 * proposition d'échange, puis message de clôture (ou reprise d'un projet
 * reporté). Texte : modèle de l'artisan s'il en a écrit un.
 */
export const buildQuoteFollowUpEmail = (quote, due, { client, profile, link, settings, now = new Date(), overrides = {} } = {}) => {
    const vars = {
        client: clientGreetingName(client?.name, 'fr', client?.civility) || '',
        devis: quoteLabel(quote),
        montant: quote.total_ttc != null ? formatPrice(quote.total_ttc) : '',
        date: quote.date ? formatDate(quote.date) : '',
        lien: link || '',
        telephone: profile?.phone || '',
        validite: quote.valid_until && dayNumber(quote.valid_until) >= dayNumber(now) ? formatDate(quote.valid_until) : '',
        entreprise: profile?.company_name || profile?.full_name || '',
        ...overrides,
    };
    const tpl = quoteTemplate(quoteTemplateKind(due), settings);
    return {
        subject: renderTemplate(tpl.subject, vars, QUOTE_OPTIONAL),
        body: `${renderTemplate(tpl.body, vars, QUOTE_OPTIONAL)}\n\n${signatureLines(profile)}`,
    };
};

/** « « A » », « « A » et « B » », « « A », « B » et « C » ». */
const joinLabels = (labels) => (labels.length <= 1 ? labels.join('')
    : `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`);

/**
 * Relance préparée à la main (suggestions du tableau de bord, centre de
 * relance) : même modèle que le pilote, pour l'étape choisie par l'artisan.
 * Plusieurs devis du même client → un seul mail qui les cite tous.
 */
export const buildManualQuoteFollowUp = (quotes, {
    stepIndex = 0, isLast = false, reopened = false, client, profile, settings, appUrl = '', now = new Date(),
} = {}) => {
    const list = (Array.isArray(quotes) ? quotes : [quotes]).filter(Boolean);
    const first = list[0];
    if (!first) return { subject: '', body: '' };
    const snoozed = dayNumber(first.relance_snoozed_until);
    const last = dayNumber(first.last_followup_at);
    const resumed = !reopened && Boolean(first.relance_postponed) && snoozed != null
        && snoozed <= dayNumber(now) && (last == null || last < snoozed);
    const due = { index: stepIndex, isLast: isLast && stepIndex > 0, reopened, resumed };
    const single = list.length === 1;
    const link = single && appUrl && first.public_token ? `${appUrl.replace(/\/$/, '')}/q/${first.public_token}` : '';
    const overrides = single ? {} : {
        devis: joinLabels(list.map(quoteLabel)),
        montant: formatPrice(list.reduce((sum, q) => sum + (Number(q.total_ttc) || 0), 0)),
        validite: '',
    };
    return buildQuoteFollowUpEmail(first, due, { client, profile, link, settings, now, overrides });
};

// ── 2. Rappel des factures impayées ──────────────────────────────────────────

/**
 * Rappel de paiement dû aujourd'hui, ou null. `needsArtisan` : rappel que
 * l'appli n'envoie pas seule (mise en demeure, retard très ancien).
 */
export const dueInvoiceReminder = (invoice, billedIds = new Set(), now = new Date()) => {
    if (!invoice || invoice.type !== 'invoice' || billedIds.has(invoice.id)) return null;
    const status = invoiceReminderStatus(invoice, now);
    if (!status?.dueNow) return null;
    const needsArtisan = status.level >= 2 || status.daysOverdue > MAX_AUTO_OVERDUE_DAYS;
    return { status, needsArtisan, nextCount: (invoice.follow_up_count || 0) + 1 };
};

// ── 3. Demande d'avis Google ─────────────────────────────────────────────────
//
// Le bon moment : le chantier terminé, quand l'artisan quitte les lieux, après
// avoir fermé son pointage s'il en avait ouvert un. L'appli envoie alors la
// demande tout de suite (planReviewNow, appelé par l'appli). Si le téléphone
// n'avait pas de réseau, l'envoi horaire rattrape la demande de 3 h à 7 jours
// après la fin du chantier. Pour un travail jamais marqué « terminé »
// (dépannage facturé directement), la facture payée sert de repère.

export const REVIEW_CATCH_UP_HOURS = 3;
export const REVIEW_CATCH_UP_DAYS = 7;
// Pas de mail au client en pleine nuit : hors de 8 h – 21 h, la demande
// immédiate est laissée au rattrapage du lendemain.
export const REVIEW_NOW_START_HOUR = 8;
export const REVIEW_NOW_END_HOUR = 21;

const PARTIAL_INVOICE_RE = /acompte|situation/i;
const HOUR_MS = 3600 * 1000;

/** Chantier marqué « terminé » par l'artisan. */
export const isChantierFinished = (doc) => doc?.work_stage === 'completed';

/** Rattrapage : chantier terminé depuis 3 h à 7 jours. */
export const dueReviewAfterWork = (doc, now = new Date()) => {
    if (!isChantierFinished(doc) || !doc.work_completed_at) return false;
    const hours = (now.getTime() - new Date(doc.work_completed_at).getTime()) / HOUR_MS;
    return hours >= REVIEW_CATCH_UP_HOURS && hours <= REVIEW_CATCH_UP_DAYS * 24;
};

/** Repère de secours : facture payée récemment (travail jamais marqué terminé). */
export const dueReviewRequest = (invoice, now = new Date()) => {
    if (!invoice || invoice.type !== 'invoice' || invoice.status !== 'paid' || !invoice.paid_at) return false;
    if (PARTIAL_INVOICE_RE.test(invoice.title || '')) return false; // chantier pas terminé
    const days = dayNumber(now) - dayNumber(invoice.paid_at);
    return days >= REVIEW_DELAY_DAYS && days <= REVIEW_MAX_DAYS;
};

/** La demande immédiate peut-elle partir à cette heure-ci ? */
export const isReviewNowHour = (now = new Date()) => {
    const { hour } = parisClock(now);
    return hour >= REVIEW_NOW_START_HOUR && hour < REVIEW_NOW_END_HOUR;
};

// Modèle de la demande d'avis, modifiable par l'artisan (réglages du pilote :
// review_subject / review_body). Repères remplacés à l'envoi :
//   {client}     → « Mme Lafitte » (formule de politesse de la fiche client)
//   {chantier}   → « Pose de prises extérieures » (intitulé du devis)
//   {lien}       → le lien d'avis Google de l'artisan
//   {entreprise} → le nom de l'entreprise
// La signature est ajoutée à la fin, comme pour tous les mails.
export const REVIEW_PLACEHOLDERS = ['{client}', '{chantier}', '{lien}', '{entreprise}'];

export const DEFAULT_REVIEW_SUBJECT = 'Merci pour votre confiance - {entreprise}';
export const DEFAULT_REVIEW_BODY = 'Bonjour {client},\n\n' +
    "Merci encore de m'avoir fait confiance pour {chantier}. J'espère que tout fonctionne parfaitement.\n\n" +
    "Si vous êtes satisfait, un avis Google m'aiderait beaucoup : pour un artisan, c'est le meilleur moyen de se faire connaître près de chez vous. " +
    "Cela prend moins d'une minute :\n{lien}\n\n" +
    "Et si quelque chose ne va pas, dites-le moi simplement en répondant à ce message : je reviens.";

export const buildReviewRequestEmail = (invoice, { client, profile, reviewUrl, settings } = {}) => {
    const cfg = readAutopilotSettings(settings);
    const vars = {
        client: clientGreetingName(client?.name, 'fr', client?.civility) || '',
        chantier: invoice.title ? `« ${invoice.title} »` : 'vos travaux',
        lien: reviewUrl || '',
        entreprise: profile?.company_name || profile?.full_name || 'votre artisan',
    };
    const subjectTpl = String(cfg.review_subject || '').trim() || DEFAULT_REVIEW_SUBJECT;
    let bodyTpl = String(cfg.review_body || '').trim() || DEFAULT_REVIEW_BODY;
    // Le lien est la raison d'être du mail : s'il a été effacé du modèle, on le remet.
    if (!bodyTpl.includes('{lien}')) bodyTpl += '\n\n{lien}';
    return {
        subject: renderTemplate(subjectTpl, vars),
        body: `${renderTemplate(bodyTpl, vars)}\n\n${signatureLines(profile)}`,
    };
};

// ── Plan d'une exécution ─────────────────────────────────────────────────────

/**
 * Retouches de l'artisan sur les mails prévus (table autopilot_drafts) :
 * texte modifié, ou mail retenu (« Ne pas envoyer »). Clé : action_key.
 */
const toDraftMap = (drafts) => {
    if (drafts instanceof Map) return drafts;
    return new Map((Array.isArray(drafts) ? drafts : []).filter((d) => d?.action_key).map((d) => [d.action_key, d]));
};

export const applyDraft = (action, drafts) => {
    const d = toDraftMap(drafts).get(action.key);
    if (!d) return action;
    const subject = String(d.subject || '').trim();
    const body = String(d.body || '').trim();
    return {
        ...action,
        subject: subject || action.subject,
        body: body || action.body,
        edited: Boolean(subject || body),
        skipped: Boolean(d.skipped),
    };
};

/** Clé d'unicité d'une action (une relance donnée n'est envoyée qu'une fois). */
export const actionKey = (kind, refId, step) => `${kind}:${refId}:${step}`;

/**
 * Liste des e-mails à envoyer maintenant pour un artisan.
 *
 * @param {object} p
 * @param {object} p.settings         réglages du pilote (readAutopilotSettings)
 * @param {object} p.profile          profil de l'artisan
 * @param {object[]} p.docs           devis et factures, avec `clients` joint
 * @param {object[]} [p.steps]        séquence de relance des devis
 * @param {Set<string>} [p.doneKeys]  actions déjà envoyées (ou échouées aujourd'hui)
 * @param {Set<*>} [p.contactedToday] clients déjà contactés aujourd'hui
 * @param {Set<*>} [p.reviewedClients] clients à qui un avis a déjà été demandé
 * @param {number} [p.sentToday]      e-mails déjà envoyés aujourd'hui
 * @param {string} [p.appUrl]         adresse de l'appli (liens de signature)
 * @param {Date} [p.now]
 * @param {boolean} [p.preview]       aperçu : ignore l'interrupteur et le plafond
 * @param {object[]|Map<string, object>} [p.drafts] retouches de l'artisan (autopilot_drafts)
 * @returns {{ actions: object[], needsArtisan: object[] }}
 */
export const planAutopilotRun = ({
    settings, profile, docs, steps, doneKeys = new Set(), contactedToday = new Set(),
    reviewedClients = new Set(), sentToday = 0, appUrl = '', now = new Date(), preview = false, drafts = [],
}) => {
    const cfg = readAutopilotSettings(settings);
    const actions = [];
    const needsArtisan = [];
    if (!cfg.enabled && !preview) return { actions, needsArtisan };

    const list = Array.isArray(docs) ? docs : [];
    const sequence = Array.isArray(steps) && steps.length > 0 ? steps : DEFAULT_FOLLOW_UP_STEPS;
    const billedIds = idsBilledByChildren(list);
    const contacted = new Set(contactedToday);
    const budget = preview ? Infinity : Math.max(0, MAX_EMAILS_PER_DAY - sentToday);
    const reviewUrl = String(profile?.google_review_url || '').trim();

    const reachable = (doc) => {
        const client = doc.clients;
        if (!client || client.autopilot_paused) return null;
        if (!isValidEmail(client.email)) return null;
        if (contacted.has(doc.client_id)) return null;
        return client;
    };
    const linkFor = (doc) => (appUrl && doc.public_token ? `${appUrl.replace(/\/$/, '')}/q/${doc.public_token}` : '');

    const draftByKey = toDraftMap(drafts);
    const push = (raw) => {
        if (actions.length >= budget) return;
        const action = applyDraft(raw, draftByKey);
        // Mail retenu par l'artisan : il ne part pas (l'aperçu le montre barré).
        if (action.skipped && !preview) return;
        actions.push(action);
        if (!action.skipped) contacted.add(action.client_id);
    };

    // L'argent dû d'abord, puis les devis, puis les avis.
    if (cfg.invoices) {
        for (const doc of list) {
            const due = dueInvoiceReminder(doc, billedIds, now);
            if (!due) continue;
            const key = actionKey('invoice_reminder', doc.id, due.nextCount);
            if (doneKeys.has(key) || doc.clients?.autopilot_paused) continue;
            if (due.needsArtisan) {
                needsArtisan.push({ kind: 'invoice_reminder', quote_id: doc.id, client_id: doc.client_id, amount: Number(doc.total_ttc) || 0, label: due.status.label, reference: invoiceReference(doc), daysOverdue: due.status.daysOverdue });
                continue;
            }
            const client = reachable(doc);
            if (!client) continue;
            const { subject, body } = buildInvoiceReminderEmail(doc, due.status, { client, profile, settings: cfg });
            push({ kind: 'invoice_reminder', key, quote_id: doc.id, client_id: doc.client_id, step: due.nextCount, to: client.email.trim(), subject, body, amount: Number(doc.total_ttc) || 0, label: due.status.label });
        }
    }

    if (cfg.quotes) {
        for (const doc of list) {
            const due = dueQuoteFollowUp(doc, sequence, now);
            if (!due) continue;
            const key = actionKey('quote_followup', doc.id, due.nextCount);
            if (doneKeys.has(key)) continue;
            const client = reachable(doc);
            if (!client) continue;
            const { subject, body } = buildQuoteFollowUpEmail(doc, due, { client, profile, link: linkFor(doc), settings: cfg, now });
            push({ kind: 'quote_followup', key, quote_id: doc.id, client_id: doc.client_id, step: due.nextCount, to: client.email.trim(), subject, body, amount: Number(doc.total_ttc) || 0, label: due.step?.label || `Relance ${due.nextCount}` });
        }
    }

    if (cfg.reviews && reviewUrl) {
        // Un chantier terminé décide seul de sa demande d'avis : sa facture
        // payée ne sert plus de repère (sinon, rattrapage manqué = demande
        // tardive au paiement).
        const finishedIds = new Set(list.filter(isChantierFinished).map((d) => d.id));
        const asked = new Set(reviewedClients);
        for (const doc of list) {
            const afterWork = dueReviewAfterWork(doc, now);
            const afterPayment = !afterWork && !isChantierFinished(doc) && !finishedIds.has(doc.parent_id) && dueReviewRequest(doc, now);
            if ((!afterWork && !afterPayment) || asked.has(doc.client_id)) continue;
            const key = actionKey('review_request', doc.id, 1);
            if (doneKeys.has(key)) continue;
            const client = reachable(doc);
            if (!client) continue;
            push(reviewAction(doc, { client, profile, reviewUrl, key, settings: cfg }));
            asked.add(doc.client_id);
        }
    }

    return { actions, needsArtisan };
};

const reviewAction = (doc, { client, profile, reviewUrl, key, settings }) => {
    const { subject, body } = buildReviewRequestEmail(doc, { client, profile, reviewUrl, settings });
    return { kind: 'review_request', key, quote_id: doc.id, client_id: doc.client_id, step: 1, to: client.email.trim(), subject, body, amount: Number(doc.total_ttc) || 0, label: "Demande d'avis" };
};

/**
 * Demande d'avis immédiate, au moment où l'artisan termine le chantier et
 * quitte les lieux. Renvoie l'e-mail à envoyer, ou la raison de ne pas le faire.
 * @param {{ settings: object, profile: object, doc: object, reviewedClients?: Set<*>, now?: Date, drafts?: object[]|Map<string, object> }} p
 * @returns {{ action: object } | { skipped: 'pilote_off'|'no_review_link'|'not_finished'|'already_asked'|'client_paused'|'no_email'|'night'|'held_by_artisan' }}
 */
export const planReviewNow = ({ settings, profile, doc, reviewedClients = new Set(), now = new Date(), drafts = [] }) => {
    const cfg = readAutopilotSettings(settings);
    if (!cfg.enabled || !cfg.reviews) return { skipped: 'pilote_off' };
    const reviewUrl = String(profile?.google_review_url || '').trim();
    if (!reviewUrl) return { skipped: 'no_review_link' };
    if (!isChantierFinished(doc)) return { skipped: 'not_finished' };
    if (reviewedClients.has(doc.client_id)) return { skipped: 'already_asked' };
    const client = doc.clients;
    if (client?.autopilot_paused) return { skipped: 'client_paused' };
    if (!client || !isValidEmail(client.email)) return { skipped: 'no_email' };
    if (!isReviewNowHour(now)) return { skipped: 'night' };
    const action = applyDraft(reviewAction(doc, { client, profile, reviewUrl, key: actionKey('review_request', doc.id, 1), settings: cfg }), drafts);
    if (action.skipped) return { skipped: 'held_by_artisan' };
    return { action };
};

// ── Résumés ──────────────────────────────────────────────────────────────────

const sum = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/**
 * Totaux par type d'action, pour les récapitulatifs (« 3 devis relancés,
 * 4 200 € »).
 */
export const summarizeActions = (rows = []) => {
    const of = (kind) => rows.filter((r) => r.kind === kind);
    const quotes = of('quote_followup');
    const invoices = of('invoice_reminder');
    const reviews = of('review_request');
    return {
        quotes: { count: quotes.length, amount: sum(quotes) },
        invoices: { count: invoices.length, amount: sum(invoices) },
        reviews: { count: reviews.length },
        total: quotes.length + invoices.length + reviews.length,
    };
};

/**
 * Notification du soir, en mots simples. null quand il n'y a rien à dire.
 * @param {{ sent?: object[], signed?: object[], paid?: object[], needsArtisan?: object[] }} day
 */
export const buildEveningSummary = ({ sent = [], signed = [], paid = [], needsArtisan = [] } = {}) => {
    const s = summarizeActions(sent);
    const lines = [];
    if (signed.length) lines.push(`✍️ ${plural(signed.length, 'devis signé', 'devis signés')} (${euros(sum(signed.map((d) => ({ amount: d.total_ttc }))))})`);
    if (paid.length) lines.push(`✅ ${plural(paid.length, 'facture payée', 'factures payées')} (${euros(sum(paid.map((d) => ({ amount: d.total_ttc }))))})`);
    if (s.quotes.count) lines.push(`📨 ${plural(s.quotes.count, 'devis relancé', 'devis relancés')} (${euros(s.quotes.amount)})`);
    if (s.invoices.count) lines.push(`💶 ${plural(s.invoices.count, 'rappel de facture envoyé', 'rappels de facture envoyés')} (${euros(s.invoices.amount)})`);
    if (s.reviews.count) lines.push(`⭐ ${plural(s.reviews.count, "demande d'avis envoyée", "demandes d'avis envoyées")}`);
    if (needsArtisan.length) lines.push(`⚠️ ${plural(needsArtisan.length, 'facture très en retard attend', 'factures très en retard attendent')} votre décision`);
    if (lines.length === 0) return null;

    const worked = s.total > 0;
    return {
        title: worked ? `Aujourd'hui, l'appli a travaillé pour vous` : 'Votre journée',
        body: lines.join('\n'),
    };
};
