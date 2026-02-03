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

        if (data?.follow_up_settings) {
            return data.follow_up_settings;
        }

        // Default settings
        return {
            steps: [
                { delay: 3, label: "Relance douce", context: "Rappel amical, demander s'ils ont des questions." },
                { delay: 7, label: "Relance standard", context: "Souligner la disponibilité et la validité du devis." },
                { delay: 14, label: "Dernière relance", context: "Demander courtoisement une décision finale." }
            ]
        };

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

    // Fetch candidate quotes: Sent, not yet accepted/paid/refused
    // effectively 'sent' status.
    const { data: quotes, error } = await supabase
        .from('quotes')
        .select(`
            *,
            clients (name, email, phone)
        `)
        // Filter by status 'sent' (envoyé) which means we are waiting for response. 
        // Note: 'draft' is too early. 'accepted' is too late.
        .eq('status', 'sent')
        .order('date', { ascending: false });

    if (error) {
        console.error("Error fetching quotes for analysis:", error);
        return [];
    }

    const today = new Date();
    const dueQuotes = [];

    quotes.forEach(quote => {
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
 */
export const recordFollowUp = async (quote, userId, content, method = 'email') => {
    const now = new Date().toISOString();
    const newCount = (quote.follow_up_count || 0) + 1;

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
export const sendInstallmentReminder = async (installment, userId) => {
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

    // Open mail client
    window.location.href = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

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
