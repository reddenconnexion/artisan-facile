import { supabase } from './supabase';

/**
 * Validates and retrieves the follow-up settings for a user.
 * Falls back to default if not configured.
 * @param {string} userId 
 * @returns {Promise<object>} Settings object { steps: [...] }
 */
export const getFollowUpSettings = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('follow_up_settings')
            .eq('id', userId)
            .single();

        if (error) throw error;

        if (data?.follow_up_settings?.steps?.length > 0) {
            return data.follow_up_settings;
        }

        // Aucune configuration sauvegardée : initialiser avec les 4 étapes par défaut
        const defaultSettings = {
            steps: [
                { delay: 3, label: "Première relance", context: "Vérifier que le devis a bien été reçu et proposer de répondre à toute question immédiate." },
                { delay: 7, label: "Deuxième relance", context: "Apporter de la valeur : partager un cas client similaire, une précision technique ou un comparatif pour aider à la décision." },
                { delay: 7, label: "Troisième relance", context: "Proposer un appel téléphonique ou un contact via un autre canal (LinkedIn) pour lever les derniers freins." },
                { delay: 13, label: "Message de clôture", context: "Informer que le devis va être archivé sous peu et proposer un recontact futur si le projet se concrétise." }
            ]
        };

        // Sauvegarder automatiquement pour que l'utilisateur les voie dans la config
        await supabase
            .from('profiles')
            .update({ follow_up_settings: defaultSettings })
            .eq('id', userId);

        return defaultSettings;

    } catch (error) {
        console.error("Error fetching follow-up settings:", error);
        return { steps: [] };
    }
};

/**
 * Saves the follow-up settings for a user.
 * @param {string} userId 
 * @param {object} settings 
 */
export const saveFollowUpSettings = async (userId, settings) => {
    const { error } = await supabase
        .from('profiles')
        .update({ follow_up_settings: settings })
        .eq('id', userId);

    if (error) throw error;
};

/**
 * Analyzes quotes to find those requiring a follow-up.
 * @param {string} userId 
 * @returns {Promise<Array>} List of quotes with added 'next_step' info
 */
export const getDueFollowUps = async (userId) => {
    const settings = await getFollowUpSettings(userId);
    const steps = settings.steps || [];

    if (steps.length === 0) return [];

    // Fetch candidate quotes: Sent, not yet accepted/paid/refused, not archived.
    const { data: quotes, error } = await supabase
        .from('quotes')
        .select(`
            *,
            clients (name, email, phone)
        `)
        // Filter by status 'sent' (envoyé) which means we are waiting for response.
        // Note: 'draft' is too early. 'accepted' is too late.
        .eq('status', 'sent')
        .is('archived_at', null)
        .order('date', { ascending: false });

    if (error) {
        console.error("Error fetching quotes for analysis:", error);
        return [];
    }

    const today = new Date();
    const dueQuotes = [];

    quotes.forEach(quote => {
        // "Reporter" : un devis explicitement reporté est masqué jusqu'à sa date
        // de snooze. La colonne peut être absente sur d'anciennes bases (avant
        // migration) → `undefined`, traité comme non reporté.
        const snoozedUntil = quote.relance_snoozed_until ? new Date(quote.relance_snoozed_until) : null;
        if (snoozedUntil && snoozedUntil > today) return;

        // Determine reference date: last follow-up OR created_at (date)
        const lastFollowUp = quote.last_followup_at ? new Date(quote.last_followup_at) : null;
        const quoteDate = new Date(quote.date); // Issue date

        // Determine which step is next
        // follow_up_count starts at 0.
        // If 0, we look at step 0 (1st follow up).
        // If 1, we look at step 1 (2nd follow up).
        const nextStepIndex = quote.follow_up_count || 0;

        if (nextStepIndex >= steps.length) {
            // Sequence finished, no more auto-suggestions (unless we want to show 'Overdue' manually)
            return;
        }

        const nextStep = steps[nextStepIndex];
        const delayDays = nextStep.delay;

        // Reference date for calculation
        // If it's the first follow-up, use Quote Date.
        // If it's subsequent, use Last Follow-Up Date.
        let referenceDate = lastFollowUp;
        if (nextStepIndex === 0 || !referenceDate) {
            referenceDate = quoteDate;
        }

        // Calculate Due Date
        const dueDate = new Date(referenceDate);
        dueDate.setDate(dueDate.getDate() + delayDays);

        // If Due Date is today or in the past, it's DUE.
        if (dueDate <= today) {
            dueQuotes.push({
                ...quote,
                next_step: {
                    index: nextStepIndex,
                    ...nextStep,
                    due_date: dueDate
                }
            });
        }
    });

    return dueQuotes;
};

/**
 * Records a follow-up action.
 * @param {object} quote
 * @param {string} userId
 * @param {string} content
 * @param {string} method
 * @param {number|null} forcedCount - Override the computed follow_up_count (for manual step selection)
 */
export const recordFollowUp = async (quote, userId, content, method = 'email', forcedCount = null) => {
    const now = new Date().toISOString();
    const newCount = forcedCount ?? (quote.follow_up_count || 0) + 1;

    // 1. Insert interaction
    const { error: insertError } = await supabase
        .from('quote_follow_ups')
        .insert({
            quote_id: quote.id,
            user_id: userId,
            follow_up_number: newCount,
            content,
            method
        });

    if (insertError) throw insertError;

    // 2. Update Quote (last_followup_at, follow_up_count)
    const { error: updateError } = await supabase
        .from('quotes')
        .update({
            last_followup_at: now,
            follow_up_count: newCount
        })
        .eq('id', quote.id);

    if (updateError) throw updateError;

    // 3. Log into client interactions (CRM history)
    if (quote.client_id) {
        await supabase.from('client_interactions').insert([{
            user_id: userId,
            client_id: quote.client_id,
            type: method,
            date: now,
            details: `Relance devis #${quote.id} (Niveau ${newCount})`
        }]);
    }
};

/**
 * "Reporter" une relance : repousse l'apparition du devis dans les relances dues
 * d'un certain nombre de jours. Utilisé par les suggestions quotidiennes.
 * @param {number|string} quoteId
 * @param {string} userId
 * @param {number} days - Nombre de jours de report (défaut 3)
 * @returns {Promise<Date>} La date jusqu'à laquelle la relance est reportée
 */
export const snoozeRelance = async (quoteId, userId, days = 3) => {
    const until = new Date();
    until.setHours(0, 0, 0, 0);
    until.setDate(until.getDate() + days);
    const { error } = await supabase
        .from('quotes')
        .update({ relance_snoozed_until: until.toISOString() })
        .eq('id', quoteId)
        .eq('user_id', userId);
    if (error) throw error;
    return until;
};

const daysBetween = (from, to) =>
    Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

/**
 * Rassemble le contexte utile pour personnaliser une relance : historique du
 * client (fidélité, devis signés/refusés passés, dernière interaction),
 * engagement e-mail (le client a-t-il ouvert le devis / les relances ?) et
 * contexte du devis (ancienneté, validité, montant, relances déjà faites).
 *
 * Le résultat est passé à `generateFollowUpEmail` pour que l'IA adapte le ton
 * et les leviers. Toutes les requêtes sont défensives : en cas d'erreur ou de
 * données manquantes, on renvoie un contexte partiel plutôt que d'échouer.
 *
 * @param {object} quote - Le devis (de référence) à relancer
 * @param {string} userId
 * @returns {Promise<object>} { quote, client, engagement }
 */
export const getRelanceContext = async (quote, userId) => {
    const today = new Date();
    const issueDate = quote?.date ? new Date(quote.date) : null;
    const lastFollowUp = quote?.last_followup_at ? new Date(quote.last_followup_at) : null;
    const validUntil = quote?.valid_until ? new Date(quote.valid_until) : null;

    const items = Array.isArray(quote?.items) ? quote.items : [];
    const ctx = {
        quote: {
            title: quote?.title || null,
            amount: quote?.total_ttc != null ? Number(quote.total_ttc) : null,
            ageDays: issueDate ? Math.max(0, daysBetween(issueDate, today)) : null,
            followUpCount: quote?.follow_up_count || 0,
            daysSinceLastFollowUp: lastFollowUp ? Math.max(0, daysBetween(lastFollowUp, today)) : null,
            validUntil: validUntil ? validUntil.toLocaleDateString('fr-FR') : null,
            daysUntilExpiry: validUntil ? daysBetween(today, validUntil) : null,
            expired: validUntil ? validUntil < today : false,
            itemCount: items.length,
            hasMaterials: items.some(i => i?.type === 'material'),
        },
        client: {
            totalPastQuotes: 0,
            signedCount: 0,
            rejectedCount: 0,
            pendingCount: 0,
            isReturningClient: false,
            relationshipMonths: null,
            lastInteraction: null, // { type, daysAgo }
            interactionCount: 0,
        },
        engagement: {
            quoteOpened: false,    // le client a ouvert un e-mail lié à ce devis
            openCount: 0,
            lastOpenedDaysAgo: null,
        },
    };

    if (!quote?.client_id) return ctx;

    try {
        // ── Historique des devis du client (fidélité, signatures, refus) ──
        const { data: clientQuotes } = await supabase
            .from('quotes')
            .select('id, status, signed_at, total_ttc, date')
            .eq('user_id', userId)
            .eq('client_id', quote.client_id);

        const past = (clientQuotes || []).filter(q => q.id !== quote.id && (q.type || 'quote') !== 'invoice');
        const isSigned = (q) =>
            ['accepted', 'paid', 'billed'].includes((q.status || '').toLowerCase()) || !!q.signed_at;

        ctx.client.totalPastQuotes = past.length;
        ctx.client.signedCount = past.filter(isSigned).length;
        ctx.client.rejectedCount = past.filter(q => (q.status || '').toLowerCase() === 'rejected').length;
        ctx.client.pendingCount = past.filter(q => (q.status || '').toLowerCase() === 'sent').length;
        ctx.client.isReturningClient = ctx.client.signedCount > 0;

        const allDates = (clientQuotes || [])
            .map(q => (q.date ? new Date(q.date) : null))
            .filter(Boolean);
        if (allDates.length > 0) {
            const earliest = new Date(Math.min(...allDates.map(d => d.getTime())));
            ctx.client.relationshipMonths = Math.max(0, Math.round(daysBetween(earliest, today) / 30));
        }
    } catch (e) {
        console.warn('getRelanceContext: client quotes lookup failed', e);
    }

    try {
        // ── Dernière interaction CRM ──
        const { data: interactions } = await supabase
            .from('client_interactions')
            .select('type, date')
            .eq('user_id', userId)
            .eq('client_id', quote.client_id)
            .order('date', { ascending: false })
            .limit(50);
        if (interactions && interactions.length > 0) {
            ctx.client.interactionCount = interactions.length;
            const last = interactions[0];
            ctx.client.lastInteraction = {
                type: last.type,
                daysAgo: last.date ? Math.max(0, daysBetween(new Date(last.date), today)) : null,
            };
        }
    } catch (e) {
        console.warn('getRelanceContext: interactions lookup failed', e);
    }

    try {
        // ── Engagement e-mail : le client a-t-il ouvert le devis / les relances ? ──
        const { data: sends } = await supabase
            .from('email_send_stats')
            .select('open_count, last_opened_at')
            .eq('quote_id', quote.id);
        if (sends && sends.length > 0) {
            const openCount = sends.reduce((sum, s) => sum + (s.open_count || 0), 0);
            ctx.engagement.openCount = openCount;
            ctx.engagement.quoteOpened = openCount > 0;
            const lastOpen = sends
                .map(s => (s.last_opened_at ? new Date(s.last_opened_at) : null))
                .filter(Boolean)
                .sort((a, b) => b - a)[0];
            if (lastOpen) ctx.engagement.lastOpenedDaysAgo = Math.max(0, daysBetween(lastOpen, today));
        }
    } catch (e) {
        console.warn('getRelanceContext: engagement lookup failed', e);
    }

    return ctx;
};

/**
 * Archives a quote. Soft delete: hides it from dashboard counters and the
 * follow-up center but keeps the record for later restore.
 * @param {number|string} quoteId
 * @param {string} userId
 */
export const archiveQuote = async (quoteId, userId) => {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('quotes')
        .update({ archived_at: now })
        .eq('id', quoteId)
        .eq('user_id', userId);
    if (error) throw error;
};

/**
 * Restores a previously archived quote.
 * @param {number|string} quoteId
 * @param {string} userId
 */
export const unarchiveQuote = async (quoteId, userId) => {
    const { error } = await supabase
        .from('quotes')
        .update({ archived_at: null })
        .eq('id', quoteId)
        .eq('user_id', userId);
    if (error) throw error;
};

/**
 * Returns the recommended next send window for follow-up emails.
 * Avoids late evenings (after 19h), early mornings (before 8h), and weekends.
 * @param {Date} [now]
 * @returns {{ isOptimal: boolean, label: string, suggestion: string|null }}
 */
export const getOptimalSendWindow = (now = new Date()) => {
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();
    const isWeekend = day === 0 || day === 6;
    const isBusinessHours = hour >= 8 && hour < 19;
    const isPrimeWindow = !isWeekend && (hour >= 9 && hour <= 11);

    if (isPrimeWindow) {
        return { isOptimal: true, label: 'Moment idéal pour relancer', suggestion: null };
    }

    if (!isWeekend && isBusinessHours) {
        return { isOptimal: true, label: 'Bon moment pour relancer', suggestion: null };
    }

    // Compute next prime window (next weekday at 9h)
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    if (isWeekend || hour >= 19) {
        // Move to next weekday morning
        do {
            next.setDate(next.getDate() + 1);
        } while (next.getDay() === 0 || next.getDay() === 6);
        next.setHours(9);
    } else {
        // Before 8h same day
        next.setHours(9);
    }

    const sameDay = next.toDateString() === now.toDateString();
    const dayLabel = sameDay
        ? "aujourd'hui"
        : next.toLocaleDateString('fr-FR', { weekday: 'long' });
    return {
        isOptimal: false,
        label: isWeekend ? 'Week-end — réponse peu probable' : (hour >= 19 ? 'Soirée — risque d\'être ignoré' : 'Trop tôt — patientez'),
        suggestion: `Envoi recommandé ${dayLabel} matin (~9h)`
    };
};

/**
 * Retrieves overdue installments for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export const getOverdueInstallments = async (userId) => {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('invoice_installments')
        .select(`
            *,
            quotes!inner (
                id,
                client_id,
                title,
                clients (name, email)
            )
        `)
        .eq('quotes.user_id', userId)
        .lt('due_date', today)
        .neq('status', 'paid');

    if (error) {
        console.error("Error fetching overdue installments:", error);
        return [];
    }
    return data;
};

/**
 * Sends a reminder for a specific installment.
 * @param {object} installment 
 * @param {string} userId 
 */
export const sendInstallmentReminder = async (installment, userId, captureEmail = null) => {
    if (!installment.quotes?.clients?.email) {
        throw new Error("Email du client introuvable");
    }

    const client = installment.quotes.clients;
    const invoice = installment.quotes;

    // Check if installment is actually late or just due
    const isLate = new Date(installment.due_date) < new Date();

    const subject = `Rappel de paiement : Échéance du ${new Date(installment.due_date).toLocaleDateString()} - ${invoice.title}`;
    const body = `Bonjour ${client.name},\n\n` +
        `Sauf erreur de notre part, nous n'avons pas reçu le règlement de l'échéance suivante concernant la facture n°${invoice.id} :\n\n` +
        `- Date d'échéance : ${new Date(installment.due_date).toLocaleDateString()}\n` +
        `- Montant attendu : ${installment.amount.toFixed(2)} €\n` +
        `- Montant restant : ${(installment.amount - (installment.amount_paid || 0)).toFixed(2)} €\n\n` +
        `Merci de régulariser cette situation dès que possible.\n\n` +
        `Cordialement,`;

    // Open mail client (or capture in test mode)
    if (typeof captureEmail === 'function') {
        captureEmail({ email: client.email, subject, body });
    } else {
        window.location.href = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    // Update reminded count
    await supabase
        .from('invoice_installments')
        .update({
            reminded_count: (installment.reminded_count || 0) + 1,
            status: 'late' // Mark as explicitly late if not already
        })
        .eq('id', installment.id);

    // Log interaction
    await supabase.from('client_interactions').insert([{
        user_id: userId,
        client_id: invoice.client_id,
        type: 'email',
        date: new Date(),
        details: `Rappel échéance ${installment.amount.toFixed(2)}€ (Date: ${installment.due_date})`
    }]);

    return true;
};
