import { supabase } from './supabase';

/**
 * Executes the actions detected by the AI intent classifier.
 * Returns a summary of what was created/modified so it can be shown in a cancel toast.
 */
export const executePipelineActions = async (intentResult, userId) => {
    const { intent, data } = intentResult;
    const actionsTaken = [];
    const recordIds = {};

    try {
        switch (intent) {
            case 'create_client':
                await executeCreateClient(data, userId, actionsTaken, recordIds);
                break;

            case 'create_quote':
                await executeCreateQuote(data, userId, actionsTaken, recordIds);
                break;

            case 'create_invoice':
                await executeCreateInvoice(data, userId, actionsTaken, recordIds);
                break;

            case 'send_invoice':
                await executeSendInvoice(data, userId, actionsTaken, recordIds);
                break;

            case 'create_intervention_report':
                await executeCreateInterventionReport(data, userId, actionsTaken, recordIds);
                break;

            case 'schedule_appointment':
            case 'calendar':
                await executeScheduleAppointment(data, userId, actionsTaken, recordIds);
                break;

            default:
                // No automatic action for unknown/navigation/email
                break;
        }
    } catch (err) {
        console.error('Pipeline execution error:', err);
        throw err;
    }

    return { actionsTaken, recordIds };
};

/**
 * Rolls back all actions taken by the pipeline (used for the 30s cancel window).
 */
export const cancelPipelineActions = async (recordIds, userId) => {
    const results = [];

    if (recordIds.client_id) {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', recordIds.client_id)
            .eq('user_id', userId);
        results.push({ type: 'client', success: !error });
    }

    if (recordIds.quote_id) {
        const { error } = await supabase
            .from('quotes')
            .delete()
            .eq('id', recordIds.quote_id)
            .eq('user_id', userId);
        results.push({ type: 'quote', success: !error });
    }

    if (recordIds.intervention_report_id) {
        const { error } = await supabase
            .from('intervention_reports')
            .delete()
            .eq('id', recordIds.intervention_report_id)
            .eq('user_id', userId);
        results.push({ type: 'intervention_report', success: !error });
    }

    if (recordIds.event_id) {
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', recordIds.event_id)
            .eq('user_id', userId);
        results.push({ type: 'event', success: !error });
    }

    return results;
};

// --- Private action handlers ---

async function executeCreateClient(data, userId, actionsTaken, recordIds) {
    const clientData = {
        user_id: userId,
        name: data.name || 'Nouveau client',
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
    };

    const { data: created, error } = await supabase
        .from('clients')
        .insert(clientData)
        .select('id, name')
        .single();

    if (error) throw new Error(`Erreur création client : ${error.message}`);

    recordIds.client_id = created.id;
    actionsTaken.push({
        type: 'create_client',
        label: `Client créé : ${created.name}`,
        id: created.id,
        link: `/app/clients/${created.id}`,
    });
}

async function executeCreateQuote(data, userId, actionsTaken, recordIds) {
    // Try to find existing client by name if provided
    let clientId = null;
    if (data.client_name) {
        const { data: clients } = await supabase
            .from('clients')
            .select('id, name')
            .eq('user_id', userId)
            .ilike('name', `%${data.client_name}%`)
            .limit(1);
        if (clients && clients.length > 0) {
            clientId = clients[0].id;
        }
    }

    const today = new Date().toISOString().split('T')[0];
    const quoteData = {
        user_id: userId,
        client_id: clientId,
        title: data.title || data.description?.slice(0, 80) || 'Devis vocal',
        status: 'draft',
        date: today,
        items: data.description ? [{
            description: data.description,
            quantity: 1,
            unit: 'forfait',
            price: 0,
            type: 'service',
        }] : [],
        notes: data.description || null,
    };

    const { data: created, error } = await supabase
        .from('quotes')
        .insert(quoteData)
        .select('id, title')
        .single();

    if (error) throw new Error(`Erreur création devis : ${error.message}`);

    recordIds.quote_id = created.id;
    actionsTaken.push({
        type: 'create_quote',
        label: `Devis créé : ${created.title}`,
        id: created.id,
        link: `/app/devis/${created.id}`,
    });
}

async function executeCreateInvoice(data, userId, actionsTaken, recordIds) {
    // Find existing client by name
    let clientId = null;
    if (data.client_name) {
        const { data: clients } = await supabase
            .from('clients')
            .select('id, name')
            .eq('user_id', userId)
            .ilike('name', `%${data.client_name}%`)
            .limit(1);
        if (clients && clients.length > 0) {
            clientId = clients[0].id;
        }
    }

    const today = new Date().toISOString().split('T')[0];
    const invoiceData = {
        user_id: userId,
        client_id: clientId,
        title: data.description?.slice(0, 80) || 'Facture vocale',
        status: 'draft',
        type: 'invoice',
        date: today,
        items: data.description ? [{
            description: data.description,
            quantity: 1,
            unit: 'forfait',
            price: data.amount || 0,
            type: 'service',
        }] : [],
    };

    const { data: created, error } = await supabase
        .from('quotes')
        .insert(invoiceData)
        .select('id, title')
        .single();

    if (error) throw new Error(`Erreur création facture : ${error.message}`);

    recordIds.quote_id = created.id;
    actionsTaken.push({
        type: 'create_invoice',
        label: `Facture créée : ${created.title}`,
        id: created.id,
        link: `/app/devis/${created.id}`,
    });
}

async function executeSendInvoice(data, userId, actionsTaken, recordIds) {
    // Find the most recent unpaid invoice for this client
    let query = supabase
        .from('quotes')
        .select('id, title, client_id, clients(name, email)')
        .eq('user_id', userId)
        .in('status', ['draft', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1);

    if (data.client_name) {
        // Find client first
        const { data: clients } = await supabase
            .from('clients')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${data.client_name}%`)
            .limit(1);

        if (clients && clients.length > 0) {
            query = query.eq('client_id', clients[0].id);
        }
    }

    const { data: invoices } = await query;
    if (invoices && invoices.length > 0) {
        const invoice = invoices[0];
        const clientEmail = invoice.clients?.email;

        if (clientEmail) {
            // Mark as sent
            await supabase
                .from('quotes')
                .update({ status: 'sent' })
                .eq('id', invoice.id)
                .eq('user_id', userId);

            recordIds.quote_id = invoice.id;
            actionsTaken.push({
                type: 'send_invoice',
                label: `Facture marquée comme envoyée : ${invoice.title}`,
                id: invoice.id,
                link: `/app/devis/${invoice.id}`,
                note: `Email à envoyer manuellement à ${clientEmail}`,
            });
        } else {
            actionsTaken.push({
                type: 'send_invoice',
                label: `Facture trouvée (email client manquant) : ${invoice.title}`,
                id: invoice.id,
                link: `/app/devis/${invoice.id}`,
            });
        }
    } else {
        actionsTaken.push({
            type: 'send_invoice_not_found',
            label: 'Aucune facture en attente trouvée',
            link: '/app/devis',
        });
    }
}

async function executeCreateInterventionReport(data, userId, actionsTaken, recordIds) {
    // Try to find existing client
    let clientId = null;
    if (data.client_name) {
        const { data: clients } = await supabase
            .from('clients')
            .select('id, name')
            .eq('user_id', userId)
            .ilike('name', `%${data.client_name}%`)
            .limit(1);
        if (clients && clients.length > 0) {
            clientId = clients[0].id;
        }
    }

    const reportData = {
        user_id: userId,
        client_id: clientId,
        title: data.title || 'Rapport d\'intervention vocal',
        intervention_date: data.date || new Date().toISOString().split('T')[0],
        description: data.description || null,
        work_performed: data.work_done || data.description || null,
        status: 'draft',
    };

    const { data: created, error } = await supabase
        .from('intervention_reports')
        .insert(reportData)
        .select('id, title')
        .single();

    if (error) throw new Error(`Erreur création rapport : ${error.message}`);

    recordIds.intervention_report_id = created.id;
    actionsTaken.push({
        type: 'create_intervention_report',
        label: `Rapport créé : ${created.title}`,
        id: created.id,
        link: `/app/interventions/${created.id}`,
    });
}

async function executeScheduleAppointment(data, userId, actionsTaken, recordIds) {
    const startDate = data.start_date || new Date().toISOString();
    const eventData = {
        user_id: userId,
        title: data.title || 'Rendez-vous',
        start_date: startDate,
        end_date: new Date(new Date(startDate).getTime() + (data.duration || 60) * 60000).toISOString(),
        description: data.description || (data.client_name ? `Client : ${data.client_name}` : null),
        type: 'rdv',
    };

    const { data: created, error } = await supabase
        .from('events')
        .insert(eventData)
        .select('id, title')
        .single();

    if (error) throw new Error(`Erreur création événement : ${error.message}`);

    recordIds.event_id = created.id;
    actionsTaken.push({
        type: 'schedule_appointment',
        label: `RDV planifié : ${created.title}`,
        id: created.id,
        link: `/app/agenda`,
    });
}
