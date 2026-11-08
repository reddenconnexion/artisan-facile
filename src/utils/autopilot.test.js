import { describe, it, expect } from 'vitest';
import {
    parisClock, isSendingWindow, isSummaryHour, dueQuoteFollowUp, buildQuoteFollowUpEmail,
    dueInvoiceReminder, dueReviewRequest, buildReviewRequestEmail, planAutopilotRun,
    dueReviewAfterWork, planReviewNow, renderTemplate, quoteTemplateKind, DEFAULT_QUOTE_TEMPLATES,
    buildManualQuoteFollowUp, computeAutopilotGains, nextSendTime, sendTimeLabel, applyDraft,
    buildEveningSummary, summarizeActions, readAutopilotSettings, actionKey,
    DEFAULT_FOLLOW_UP_STEPS, MAX_EMAILS_PER_DAY,
} from './autopilot';

// Mardi 10 novembre 2026, 10 h à Paris (9 h UTC).
const NOW = new Date('2026-11-10T09:00:00Z');
const profile = { full_name: 'Denis Meriot', company_name: 'Red Den Connexion', phone: '06 00 00 00 00', google_review_url: 'https://g.page/r/abc/review' };
const client = (id, extra = {}) => ({ id, name: 'Mme LAFITTE', email: `client${id}@exemple.fr`, ...extra });

const quote = (extra = {}) => ({
    id: 1, type: 'quote', status: 'sent', date: '2026-11-02', client_id: 10, total_ttc: 1800,
    title: 'Mise aux normes tableau', public_token: 'tok', follow_up_count: 0, clients: client(10), ...extra,
});
const invoice = (extra = {}) => ({
    id: 50, type: 'invoice', status: 'sent', date: '2026-10-01', valid_until: '2026-10-31', client_id: 20,
    total_ttc: 650, invoice_number: 'F-2026-012', follow_up_count: 0, clients: client(20), ...extra,
});

describe('horloge de Paris', () => {
    it('donne la date et l\'heure locales', () => {
        expect(parisClock(NOW)).toEqual({ dateKey: '2026-11-10', hour: 10, weekday: 2 });
        // 23 h 30 UTC le 10 = 0 h 30 le 11 à Paris
        expect(parisClock(new Date('2026-11-10T23:30:00Z')).dateKey).toBe('2026-11-11');
    });

    it('n\'envoie qu\'en semaine, aux heures de bureau', () => {
        expect(isSendingWindow(NOW)).toBe(true);
        expect(isSendingWindow(new Date('2026-11-10T06:00:00Z'))).toBe(false); // 7 h
        expect(isSendingWindow(new Date('2026-11-10T17:00:00Z'))).toBe(false); // 18 h
        expect(isSendingWindow(new Date('2026-11-08T10:00:00Z'))).toBe(false); // dimanche
    });

    it('résumé à 18 h', () => {
        expect(isSummaryHour(new Date('2026-11-10T17:10:00Z'))).toBe(true);
        expect(isSummaryHour(NOW)).toBe(false);
    });
});

describe('relance des devis', () => {
    it('séquence par défaut : J+7, J+14, J+21, clôture à J+34', () => {
        expect(DEFAULT_FOLLOW_UP_STEPS.map(s => s.delay)).toEqual([7, 7, 7, 13]);
    });

    it('première relance 7 jours après l\'envoi', () => {
        expect(dueQuoteFollowUp(quote({ date: '2026-11-04' }), DEFAULT_FOLLOW_UP_STEPS, NOW)).toBeNull();
        expect(dueQuoteFollowUp(quote({ date: '2026-11-03' }), DEFAULT_FOLLOW_UP_STEPS, NOW))
            .toMatchObject({ index: 0, nextCount: 1, isLast: false });
    });

    it('étapes suivantes comptées depuis la dernière relance', () => {
        const q = quote({ date: '2026-10-20', follow_up_count: 1, last_followup_at: '2026-11-05T10:00:00Z' });
        expect(dueQuoteFollowUp(q, DEFAULT_FOLLOW_UP_STEPS, NOW)).toBeNull();
        expect(dueQuoteFollowUp({ ...q, last_followup_at: '2026-11-03T10:00:00Z' }, DEFAULT_FOLLOW_UP_STEPS, NOW))
            .toMatchObject({ index: 1, nextCount: 2 });
    });

    it('ne relance pas ce qui ne doit pas l\'être', () => {
        const due = (extra) => dueQuoteFollowUp(quote({ date: '2026-11-01', ...extra }), DEFAULT_FOLLOW_UP_STEPS, NOW);
        expect(due({ status: 'accepted' })).toBeNull();
        expect(due({ status: 'draft' })).toBeNull();
        expect(due({ archived_at: '2026-11-02' })).toBeNull();
        expect(due({ signed_at: '2026-11-02' })).toBeNull();
        expect(due({ type: 'invoice' })).toBeNull();
        expect(due({ valid_until: '2026-11-09' })).toBeNull(); // expiré
        expect(due({ relance_snoozed_until: '2026-11-12' })).toBeNull();
        expect(due({ follow_up_count: 4 })).toBeNull(); // séquence terminée
        expect(due({ date: '2026-08-01' })).toBeNull(); // trop ancien
    });

    it('rédige selon l\'étape, avec le lien de signature', () => {
        const q = quote();
        const first = buildQuoteFollowUpEmail(q, { index: 0, isLast: false }, { client: q.clients, profile, link: 'https://app/q/tok' });
        expect(first.subject).toBe('Votre devis « Mise aux normes tableau »');
        expect(first.body).toMatch(/^Bonjour Mme Lafitte,/);
        expect(first.body).toMatch(/1\s800,00\s€ TTC/);
        expect(first.body).toContain('https://app/q/tok');
        expect(first.body).toContain('\n\n-- \nRed Den Connexion');

        const last = buildQuoteFollowUpEmail(q, { index: 3, isLast: true }, { client: q.clients, profile });
        expect(last.body).toContain('classer ce dossier');
        const middle = buildQuoteFollowUpEmail(q, { index: 1, isLast: false }, { client: q.clients, profile });
        expect(middle.body).toContain('adapter la proposition');
    });
});

describe('rappel des factures', () => {
    it('rappel amiable 3 jours après l\'échéance', () => {
        const due = dueInvoiceReminder(invoice(), new Set(), NOW);
        expect(due).toMatchObject({ needsArtisan: false, nextCount: 1 });
        expect(dueInvoiceReminder(invoice({ valid_until: '2026-11-09' }), new Set(), NOW)).toBeNull();
    });

    it('la mise en demeure attend l\'artisan', () => {
        const inv = invoice({ follow_up_count: 2, last_followup_at: '2026-10-25T10:00:00Z' });
        expect(dueInvoiceReminder(inv, new Set(), NOW)).toMatchObject({ needsArtisan: true });
    });

    it('un très vieux retard est signalé, pas rappelé', () => {
        const inv = invoice({ date: '2026-06-01', valid_until: '2026-07-01' });
        expect(dueInvoiceReminder(inv, new Set(), NOW)).toMatchObject({ needsArtisan: true });
    });

    it('ignore payées et factures remplacées par une facture fille', () => {
        expect(dueInvoiceReminder(invoice({ status: 'paid' }), new Set(), NOW)).toBeNull();
        expect(dueInvoiceReminder(invoice(), new Set([50]), NOW)).toBeNull();
    });
});

describe('demande d\'avis', () => {
    const paid = (extra) => invoice({ status: 'paid', paid_at: '2026-11-07T15:00:00Z', ...extra });
    it('entre 2 et 30 jours après le paiement', () => {
        expect(dueReviewRequest(paid(), NOW)).toBe(true);
        expect(dueReviewRequest(paid({ paid_at: '2026-11-09T15:00:00Z' }), NOW)).toBe(false);
        expect(dueReviewRequest(paid({ paid_at: '2026-09-01T15:00:00Z' }), NOW)).toBe(false);
    });
    it('pas pour un acompte ou une situation', () => {
        expect(dueReviewRequest(paid({ title: 'Acompte 30 %' }), NOW)).toBe(false);
        expect(dueReviewRequest(paid({ title: 'Situation n°2' }), NOW)).toBe(false);
    });
    it('contient le lien d\'avis', () => {
        const { body } = buildReviewRequestEmail(paid(), { client: client(20), profile, reviewUrl: profile.google_review_url });
        expect(body).toContain(profile.google_review_url);
    });
});

describe('projet reporté par le client', () => {
    // Devis envoyé en septembre, valable 1 mois, client : « ce sera pour novembre ».
    const later = (extra) => quote({ date: '2026-09-10', valid_until: '2026-10-10', relance_postponed: true, relance_snoozed_until: '2026-11-10T06:00:00Z', ...extra });

    it('rien avant la date de reprise', () => {
        expect(dueQuoteFollowUp(later({ relance_snoozed_until: '2026-11-20T06:00:00Z' }), DEFAULT_FOLLOW_UP_STEPS, NOW)).toBeNull();
    });

    it('à la date de reprise : mail de reprise, malgré l\'âge et l\'expiration du devis', () => {
        const due = dueQuoteFollowUp(later(), DEFAULT_FOLLOW_UP_STEPS, NOW);
        expect(due).toMatchObject({ resumed: true, nextCount: 1 });
        const { body } = buildQuoteFollowUpEmail(later(), due, { client: client(10), profile });
        expect(body).toContain('Comme convenu');
        expect(body).toContain('mettre le devis à jour');
    });

    it('après le mail de reprise, la séquence normale reprend', () => {
        // Devis de septembre, expiré : la séquence continue quand même après la reprise.
        const q = later({ follow_up_count: 1, last_followup_at: '2026-11-10T08:05:00Z' });
        expect(dueQuoteFollowUp(q, DEFAULT_FOLLOW_UP_STEPS, NOW)).toBeNull(); // 2e étape à J+7 de la reprise
        const next = dueQuoteFollowUp(q, DEFAULT_FOLLOW_UP_STEPS, new Date('2026-11-17T09:00:00Z'));
        expect(next).toMatchObject({ index: 1, nextCount: 2 });
        expect(next.resumed).toBeUndefined();
    });

    it('un report court (sans « projet reporté ») ne change pas le texte', () => {
        const q = quote({ date: '2026-11-01', relance_snoozed_until: '2026-11-09T06:00:00Z' });
        expect(dueQuoteFollowUp(q, DEFAULT_FOLLOW_UP_STEPS, NOW)).toMatchObject({ index: 0 });
        expect(dueQuoteFollowUp(q, DEFAULT_FOLLOW_UP_STEPS, NOW).resumed).toBeUndefined();
    });
});

describe('avis Google à la fin du chantier', () => {
    const done = (extra) => quote({ status: 'accepted', work_stage: 'completed', work_completed_at: '2026-11-10T04:00:00Z', ...extra });

    it('rattrapage de 3 h à 7 jours après la fin du chantier', () => {
        expect(dueReviewAfterWork(done(), NOW)).toBe(true); // 5 h
        expect(dueReviewAfterWork(done({ work_completed_at: '2026-11-10T07:30:00Z' }), NOW)).toBe(false); // 1 h 30
        expect(dueReviewAfterWork(done({ work_completed_at: '2026-11-01T07:30:00Z' }), NOW)).toBe(false); // 9 jours
        expect(dueReviewAfterWork(done({ work_completed_at: null }), NOW)).toBe(false); // terminé avant la fonction
        expect(dueReviewAfterWork(done({ work_stage: 'in_progress' }), NOW)).toBe(false);
    });

    it('le pilote rattrape le chantier terminé ; sa facture payée ne relance pas une 2e demande', () => {
        const docs = [
            done({ id: 1 }),
            invoice({ id: 2, parent_id: 1, status: 'paid', paid_at: '2026-11-06T10:00:00Z', client_id: 10, clients: client(10) }),
        ];
        const { actions } = planAutopilotRun({ settings: { enabled: true, quotes: false, invoices: false }, profile, docs, now: NOW });
        expect(actions.map(a => [a.kind, a.quote_id])).toEqual([['review_request', 1]]);

        const late = [done({ id: 1, work_completed_at: '2026-10-01T10:00:00Z' }), docs[1]];
        expect(planAutopilotRun({ settings: { enabled: true, quotes: false, invoices: false }, profile, docs: late, now: NOW }).actions).toEqual([]);
    });

    it('demande immédiate en quittant le chantier', () => {
        const base = { settings: { enabled: true }, profile, doc: done(), now: NOW };
        const { action } = planReviewNow(base);
        expect(action).toMatchObject({ kind: 'review_request', quote_id: 1, key: 'review_request:1:1', to: 'client10@exemple.fr' });
        expect(action.body).toContain(profile.google_review_url);

        expect(planReviewNow({ ...base, settings: {} })).toEqual({ skipped: 'pilote_off' });
        expect(planReviewNow({ ...base, settings: { enabled: true, reviews: false } })).toEqual({ skipped: 'pilote_off' });
        expect(planReviewNow({ ...base, profile: { ...profile, google_review_url: '' } })).toEqual({ skipped: 'no_review_link' });
        expect(planReviewNow({ ...base, doc: done({ work_stage: 'in_progress' }) })).toEqual({ skipped: 'not_finished' });
        expect(planReviewNow({ ...base, reviewedClients: new Set([10]) })).toEqual({ skipped: 'already_asked' });
        expect(planReviewNow({ ...base, doc: done({ clients: client(10, { autopilot_paused: true }) }) })).toEqual({ skipped: 'client_paused' });
        expect(planReviewNow({ ...base, doc: done({ clients: client(10, { email: '' }) }) })).toEqual({ skipped: 'no_email' });
        expect(planReviewNow({ ...base, now: new Date('2026-11-10T21:30:00Z') })).toEqual({ skipped: 'night' }); // 22 h 30
    });
});

describe('modèles de relance de devis', () => {
    const q = quote();

    it('une ligne au repère facultatif vide disparaît entière', () => {
        const out = renderTemplate('Bonjour {client},\n\nMon numéro : {telephone}\n\nMerci.', { client: '', telephone: '' }, ['telephone']);
        expect(out).toBe('Bonjour,\n\nMerci.');
    });

    it('repère vide en milieu de phrase : seul le repère disparaît', () => {
        const vars = { lien: '', validite: '' };
        expect(renderTemplate('Alors, ça vous va ? {lien}\nMerci.', vars, ['lien'])).toBe('Alors, ça vous va ?\nMerci.');
        expect(renderTemplate('Le voici : {lien}\nMerci.', vars, ['lien'])).toBe('Merci.');
        expect(renderTemplate("Valable jusqu'au {validite}.\nMerci.", vars, ['validite'])).toBe('Merci.');
        expect(renderTemplate('{lien}\nMerci.', vars, ['lien'])).toBe('Merci.');
    });

    it('le bon modèle à chaque moment', () => {
        expect(quoteTemplateKind({ index: 0 })).toBe('first');
        expect(quoteTemplateKind({ index: 1, isLast: false })).toBe('middle');
        expect(quoteTemplateKind({ index: 3, isLast: true })).toBe('last');
        expect(quoteTemplateKind({ index: 0, resumed: true })).toBe('resume');
    });

    it('sans lien ni téléphone, ni validité : pas de ligne orpheline', () => {
        const { body } = buildQuoteFollowUpEmail(q, { index: 1 }, { client: q.clients, profile: { full_name: 'Denis' } });
        expect(body).not.toContain('Mon numéro');
        expect(body).not.toContain('en ligne ici');
        expect(body).not.toContain('valable');
        expect(body).toContain('adapter la proposition');
    });

    it('le modèle de l\'artisan remplace celui de l\'appli, pour ce moment seulement', () => {
        const settings = { quote_templates: { first: { subject: 'Alors, {client} ?', body: 'Bonjour {client}, vous avez vu mon devis {devis} de {montant} ? {lien}' } } };
        const first = buildQuoteFollowUpEmail(q, { index: 0 }, { client: q.clients, profile, link: 'https://x/q/1', settings });
        expect(first.subject).toBe('Alors, Mme Lafitte ?');
        expect(first.body).toMatch(/^Bonjour Mme Lafitte, vous avez vu mon devis « Mise aux normes tableau » de 1\s800,00\s€ \? https:\/\/x\/q\/1/);
        expect(first.body).toContain('\n\n-- \nRed Den Connexion');
        const middle = buildQuoteFollowUpEmail(q, { index: 1 }, { client: q.clients, profile, settings });
        expect(middle.body).toContain('adapter la proposition');
    });

    it('le pilote utilise les modèles de l\'artisan', () => {
        const settings = { enabled: true, quote_templates: { first: { body: 'Mon texte pour {devis}' } } };
        const { actions } = planAutopilotRun({ settings, profile, docs: [quote()], now: NOW });
        expect(actions[0].body).toMatch(/^Mon texte pour « Mise aux normes tableau »/);
        expect(actions[0].subject).toBe('Votre devis « Mise aux normes tableau »'); // objet de l'appli conservé
    });

    it('tous les modèles par défaut n\'utilisent que des repères connus', () => {
        for (const { subject, body } of Object.values(DEFAULT_QUOTE_TEMPLATES)) {
            const tags = `${subject} ${body}`.match(/\{(\w+)\}/g) || [];
            tags.forEach((t) => expect(['{client}', '{devis}', '{montant}', '{date}', '{lien}', '{telephone}', '{validite}', '{entreprise}']).toContain(t));
        }
    });
});

describe('relances préparées à la main', () => {
    const settings = { quote_templates: { middle: { body: 'Bonjour {client}, alors pour {devis} ({montant}) ? {lien}' } } };

    it('utilisent le modèle de l\'artisan pour l\'étape choisie', () => {
        const { body } = buildManualQuoteFollowUp([quote()], { stepIndex: 1, client: client(10), profile, settings, appUrl: 'https://app/', now: NOW });
        expect(body).toMatch(/^Bonjour Mme Lafitte, alors pour « Mise aux normes tableau » \(1\s800,00\s€\) \? https:\/\/app\/q\/tok/);
    });

    it('plusieurs devis du même client : un seul mail qui les cite tous, sans lien', () => {
        const quotes = [quote({ id: 1, title: 'Tableau', total_ttc: 1000 }), quote({ id: 2, title: 'Prises', total_ttc: 500 }), quote({ id: 3, title: 'Éclairage', total_ttc: 250 })];
        const { body } = buildManualQuoteFollowUp(quotes, { stepIndex: 1, client: client(10), profile, settings, appUrl: 'https://app', now: NOW });
        expect(body).toMatch(/^Bonjour Mme Lafitte, alors pour « Tableau », « Prises » et « Éclairage » \(1\s750,00\s€\) \?$/m);
        expect(body).not.toContain('/q/');
    });

    it('dernière étape, devis rouvert, projet reporté : le bon modèle', () => {
        const last = buildManualQuoteFollowUp([quote()], { stepIndex: 3, isLast: true, client: client(10), profile, now: NOW });
        expect(last.body).toContain('classer ce dossier');
        const reopened = buildManualQuoteFollowUp([quote()], { stepIndex: 0, reopened: true, client: client(10), profile, now: NOW });
        expect(reopened.body).toContain('adapter la proposition');
        const resumed = buildManualQuoteFollowUp([quote({ relance_postponed: true, relance_snoozed_until: '2026-11-09T06:00:00Z' })], { stepIndex: 0, client: client(10), profile, now: NOW });
        expect(resumed.body).toContain('Comme convenu');
    });
});

describe('message de demande d\'avis modifiable', () => {
    const inv = invoice({ status: 'paid', paid_at: '2026-11-07T15:00:00Z', title: 'Pose de prises extérieures' });

    it('par défaut : le texte de l\'appli, repères remplis', () => {
        const { subject, body } = buildReviewRequestEmail(inv, { client: client(20), profile, reviewUrl: profile.google_review_url });
        expect(subject).toBe('Merci pour votre confiance - Red Den Connexion');
        expect(body).toMatch(/^Bonjour Mme Lafitte,/);
        expect(body).toContain('pour « Pose de prises extérieures »');
        expect(body).toContain(profile.google_review_url);
        expect(body).not.toMatch(/\{\w+\}/);
    });

    it('le message de l\'artisan remplace celui de l\'appli', () => {
        const settings = { review_subject: 'Votre avis, {client} ?', review_body: 'Salut {client} !\nUn petit avis pour {chantier} ? {lien}\nDenis' };
        const { subject, body } = buildReviewRequestEmail(inv, { client: client(20), profile, reviewUrl: 'https://g/r', settings });
        expect(subject).toBe('Votre avis, Mme Lafitte ?');
        expect(body).toMatch(/^Salut Mme Lafitte !\nUn petit avis pour « Pose de prises extérieures » \? https:\/\/g\/r\nDenis/);
        expect(body).toContain('\n\n-- \nRed Den Connexion'); // signature toujours ajoutée
    });

    it('lien effacé du modèle : remis à la fin ; client sans nom : pas de « Bonjour , »', () => {
        const settings = { review_body: 'Bonjour {client}, merci !' };
        const { body } = buildReviewRequestEmail(inv, { client: { email: 'x@y.fr' }, profile, reviewUrl: 'https://g/r', settings });
        expect(body).toMatch(/^Bonjour, merci !\n\nhttps:\/\/g\/r/);
    });

    it('utilisé par le pilote et par la demande en fin de chantier', () => {
        const settings = { enabled: true, review_body: 'Mon texte {lien}' };
        const doc = quote({ status: 'accepted', work_stage: 'completed' });
        expect(planReviewNow({ settings, profile, doc, now: NOW }).action.body).toMatch(/^Mon texte https/);
    });
});

describe('plan d\'une exécution', () => {
    const settings = { enabled: true };
    const base = { settings, profile, now: NOW, appUrl: 'https://app.artisanfacile.fr/' };

    it('rien tant que le pilote n\'est pas activé', () => {
        expect(planAutopilotRun({ ...base, settings: {}, docs: [quote()] }).actions).toEqual([]);
        expect(readAutopilotSettings(null).enabled).toBe(false);
    });

    it('factures, puis devis, puis avis ; un seul mail par client et par jour', () => {
        const docs = [
            quote({ id: 1, client_id: 10, clients: client(10) }),
            quote({ id: 2, client_id: 10, clients: client(10) }),
            invoice({ id: 50, client_id: 20, clients: client(20) }),
            invoice({ id: 60, status: 'paid', paid_at: '2026-11-06T10:00:00Z', client_id: 30, clients: client(30) }),
        ];
        const { actions } = planAutopilotRun({ ...base, docs });
        expect(actions.map(a => [a.kind, a.quote_id])).toEqual([
            ['invoice_reminder', 50], ['quote_followup', 1], ['review_request', 60],
        ]);
        expect(actions[1].body).toContain('https://app.artisanfacile.fr/q/tok');
        expect(actions[1].key).toBe(actionKey('quote_followup', 1, 1));
    });

    it('respecte les déjà faits, les clients en pause et sans e-mail', () => {
        const docs = [
            quote({ id: 1 }),
            quote({ id: 2, client_id: 11, clients: client(11, { autopilot_paused: true }) }),
            quote({ id: 3, client_id: 12, clients: client(12, { email: '' }) }),
            quote({ id: 4, client_id: 13, clients: client(13) }),
        ];
        const { actions } = planAutopilotRun({
            ...base, docs, doneKeys: new Set([actionKey('quote_followup', 1, 1)]), contactedToday: new Set([13]),
        });
        expect(actions).toEqual([]);
    });

    it('un avis par client, jamais deux', () => {
        const docs = [invoice({ id: 60, status: 'paid', paid_at: '2026-11-06T10:00:00Z' })];
        expect(planAutopilotRun({ ...base, docs, reviewedClients: new Set([20]) }).actions).toEqual([]);
        expect(planAutopilotRun({ ...base, docs, profile: { ...profile, google_review_url: '' } }).actions).toEqual([]);
    });

    it('plafond quotidien, levé en aperçu', () => {
        const docs = Array.from({ length: 30 }, (_, i) => quote({ id: i + 1, client_id: 100 + i, clients: client(100 + i) }));
        expect(planAutopilotRun({ ...base, docs }).actions).toHaveLength(MAX_EMAILS_PER_DAY);
        expect(planAutopilotRun({ ...base, docs, sentToday: MAX_EMAILS_PER_DAY - 2 }).actions).toHaveLength(2);
        expect(planAutopilotRun({ ...base, settings: {}, docs, preview: true }).actions).toHaveLength(30);
    });

    it('chaque type se coupe séparément', () => {
        const docs = [quote(), invoice()];
        const { actions } = planAutopilotRun({ ...base, settings: { enabled: true, invoices: false }, docs });
        expect(actions.map(a => a.kind)).toEqual(['quote_followup']);
    });

    it('remonte les mises en demeure à valider', () => {
        const docs = [invoice({ follow_up_count: 2, last_followup_at: '2026-10-25T10:00:00Z' })];
        const { actions, needsArtisan } = planAutopilotRun({ ...base, docs });
        expect(actions).toEqual([]);
        expect(needsArtisan).toHaveLength(1);
    });
});

describe('mails prévus : retouches de l\'artisan', () => {
    const base = { settings: { enabled: true }, profile, now: NOW, docs: [quote()] };
    const key = actionKey('quote_followup', 1, 1);

    it('texte modifié : c\'est lui qui part', () => {
        const { actions } = planAutopilotRun({ ...base, drafts: [{ action_key: key, subject: 'Mon sujet', body: 'Mon texte' }] });
        expect(actions[0]).toMatchObject({ subject: 'Mon sujet', body: 'Mon texte', edited: true });
    });

    it('champ vidé : on garde le texte de l\'appli', () => {
        const a = applyDraft({ key, subject: 'S', body: 'B' }, [{ action_key: key, subject: '  ', body: 'Nouveau' }]);
        expect(a).toMatchObject({ subject: 'S', body: 'Nouveau' });
    });

    it('mail retenu : ne part pas, mais reste visible (barré) dans l\'aperçu', () => {
        const drafts = [{ action_key: key, skipped: true }];
        expect(planAutopilotRun({ ...base, drafts }).actions).toEqual([]);
        expect(planAutopilotRun({ ...base, drafts, preview: true }).actions[0]).toMatchObject({ skipped: true });
    });

    it('demande d\'avis retenue', () => {
        const doc = quote({ status: 'accepted', work_stage: 'completed' });
        const drafts = [{ action_key: actionKey('review_request', 1, 1), skipped: true }];
        expect(planReviewNow({ settings: { enabled: true }, profile, doc, now: NOW, drafts })).toEqual({ skipped: 'held_by_artisan' });
    });
});

describe('heure du prochain envoi', () => {
    it('dans la plage : prochain passage à h05', () => {
        expect(nextSendTime(new Date('2026-11-10T09:00:00Z')).toISOString()).toBe('2026-11-10T09:05:00.000Z'); // 10 h → 10 h 05
        expect(nextSendTime(new Date('2026-11-10T09:30:00Z')).toISOString()).toBe('2026-11-10T10:05:00.000Z');
    });
    it('hors plage : prochain jour ouvré à 9 h 05', () => {
        expect(nextSendTime(new Date('2026-11-10T17:30:00Z')).toISOString()).toBe('2026-11-11T08:05:00.000Z'); // mardi 18 h 30 → mercredi 9 h 05
        expect(nextSendTime(new Date('2026-11-07T10:00:00Z')).toISOString()).toBe('2026-11-09T08:05:00.000Z'); // samedi → lundi
    });
    it('en clair', () => {
        expect(sendTimeLabel(new Date('2026-11-10T09:05:00Z'), NOW)).toBe("aujourd'hui vers 10 h 05");
        expect(sendTimeLabel(new Date('2026-11-11T08:05:00Z'), NOW)).toBe('demain vers 9 h 05');
        expect(sendTimeLabel(new Date('2026-11-09T08:05:00Z'), new Date('2026-11-07T10:00:00Z'))).toBe('lundi vers 9 h 05');
    });
});

describe('ce que le pilote a rapporté', () => {
    const actions = [
        { kind: 'quote_followup', quote_id: 1, created_at: '2026-11-02T08:05:00Z' },
        { kind: 'quote_followup', quote_id: 1, created_at: '2026-11-09T08:05:00Z' }, // 2e relance, même devis
        { kind: 'quote_followup', quote_id: 2, created_at: '2026-11-05T08:05:00Z' },
        { kind: 'invoice_reminder', quote_id: 50, created_at: '2026-11-03T08:05:00Z' },
        { kind: 'invoice_reminder', quote_id: 51, created_at: '2026-11-03T08:05:00Z', status: 'failed' },
        { kind: 'review_request', quote_id: 60, created_at: '2026-11-04T16:00:00Z' },
        { kind: 'summary', quote_id: null, created_at: '2026-11-04T17:05:00Z' },
    ];
    const docs = [
        { id: 1, signed_at: '2026-11-06T18:00:00Z', total_ttc: 4200 },  // signé après la relance
        { id: 2, signed_at: '2026-11-01T18:00:00Z', total_ttc: 900 },   // signé AVANT : ne compte pas
        { id: 50, status: 'paid', paid_at: '2026-11-03', total_ttc: 650 }, // payé le jour du rappel : compte
        { id: 51, status: 'paid', paid_at: '2026-11-08', total_ttc: 300 }, // rappel raté : ne compte pas
    ];

    it('compte ce qui suit un envoi du pilote, une fois par document', () => {
        expect(computeAutopilotGains(actions, docs)).toEqual({
            signed: { count: 1, amount: 4200 },
            paid: { count: 1, amount: 650 },
            reviews: 1,
            mails: 5,
            total: 4850,
        });
    });

    it('rien d\'envoyé : rien à montrer', () => {
        expect(computeAutopilotGains([], docs).total).toBe(0);
    });
});

describe('résumés', () => {
    it('totaux par type', () => {
        const s = summarizeActions([
            { kind: 'quote_followup', amount: 1000 }, { kind: 'quote_followup', amount: 500 },
            { kind: 'invoice_reminder', amount: 650 }, { kind: 'review_request', amount: 0 },
        ]);
        expect(s).toEqual({ quotes: { count: 2, amount: 1500 }, invoices: { count: 1, amount: 650 }, reviews: { count: 1 }, total: 4 });
    });

    it('notification du soir en mots simples', () => {
        const summary = buildEveningSummary({
            sent: [{ kind: 'quote_followup', amount: 4200 }, { kind: 'quote_followup', amount: 0 }],
            signed: [{ total_ttc: 2100 }],
        });
        expect(summary.title).toBe("Aujourd'hui, l'appli a travaillé pour vous");
        expect(summary.body).toContain('1 devis signé');
        expect(summary.body).toContain('2 devis relancés');
        expect(summary.body).toMatch(/4\s200 €/);
        expect(buildEveningSummary({})).toBeNull();
    });
});
