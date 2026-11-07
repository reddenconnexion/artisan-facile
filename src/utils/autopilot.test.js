import { describe, it, expect } from 'vitest';
import {
    parisClock, isSendingWindow, isSummaryHour, dueQuoteFollowUp, buildQuoteFollowUpEmail,
    dueInvoiceReminder, dueReviewRequest, buildReviewRequestEmail, planAutopilotRun,
    dueReviewAfterWork, planReviewNow, nextSendTime, sendTimeLabel, applyDraft,
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
