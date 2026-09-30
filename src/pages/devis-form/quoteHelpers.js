import { supabase } from '../../utils/supabase';

// Agrandit un textarea à la hauteur de son contenu pour qu'une longue
// description s'affiche en entier sans scroll interne. Plafonné pour ne pas
// qu'une ligne très longue prenne tout l'écran.
export const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
};

/** Ligne vide du formulaire (celle posée par défaut) : rien à préserver. */
export const isBlankItem = (item) => !String(item?.description || '').trim()
    && !Number(item?.price) && !Number(item?.buying_price);

/** État initial du formulaire d'un nouveau document (dates calculées à l'appel). */
export const createInitialFormData = () => ({
    client_id: '',
    title: '',
    work_object: '',
    public_token: '',
    // Lien public suspendu : le client peut avoir reçu le lien et ne doit
    // plus pouvoir signer tant que l'artisan ne le rouvre pas. C'est
    // `signature_suspended_at` qui l'atteste — `token_revoked` est aussi
    // levé par le ménage nocturne des liens expirés.
    token_revoked: false,
    signature_suspended_at: null,
    date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [
        { id: 1, description: '', quantity: 1, price: 0, buying_price: 0, type: 'service' }
    ],
    notes: '',
    status: 'draft',
    urgency: 'normal', // 'normal' | 'urgent' | 'critique' — pour prioriser la préparation/planification une fois accepté
    type: 'quote', // 'quote' or 'invoice'
    client_display_mode: 'detailed', // 'detailed' | 'grouped' (présentation PDF/lien public)
    include_tva: true,
    original_pdf_url: null,
    is_external: false,
    manual_total_ht: 0,
    manual_total_tva: 0,
    manual_total_ttc: 0,
    operation_category: 'service',
    vat_on_debits: false,
    has_material_deposit: true,
    deposit_percentage: 0,
    intervention_address: '',
    intervention_postal_code: '',
    intervention_city: '',
    payment_method: '',
    paid_at: '',
    require_otp: false,
    transmission_status: null,
    transmission_ref: null,
    transmitted_at: null,
    transmission_error: null,
    transmission_service: null,
});

/** Ligne `quotes` (base) → état du formulaire. */
export const quoteRowToFormData = (data) => ({
    client_id: data.client_id || '',
    title: data.title || '',
    work_object: data.work_object || '',
    public_token: data.public_token || '',
    token_revoked: data.token_revoked === true,
    signature_suspended_at: data.signature_suspended_at || null,
    date: data.date,
    valid_until: data.valid_until || '',
    items: (data.items || []).map(i => ({ ...i, buying_price: i.buying_price || 0, type: i.type || 'service' })) || [],
    notes: data.notes || '',
    content_en: data.content_en || null,
    status: data.status || 'draft',
    urgency: data.urgency || 'normal',
    type: data.type || 'quote',
    client_display_mode: data.client_display_mode || 'detailed',
    include_tva: typeof data.include_tva === 'boolean'
        ? data.include_tva
        : (data.total_tva > 0 || (data.total_ht === 0 && data.total_tva === 0)),
    original_pdf_url: data.original_pdf_url || null,
    is_external: data.is_external || false,
    manual_total_ht: data.is_external ? data.total_ht : 0,
    manual_total_tva: data.is_external ? data.total_tva : 0,
    manual_total_ttc: data.is_external ? data.total_ttc : 0,
    operation_category: data.operation_category || 'service',
    vat_on_debits: data.vat_on_debits === true,
    last_followup_at: data.last_followup_at || null,
    follow_up_count: data.follow_up_count || 0,
    updated_at: data.updated_at || null,
    has_material_deposit: data.has_material_deposit !== false,
    deposit_percentage: data.deposit_percentage || 0,
    intervention_address: data.intervention_address || '',
    intervention_postal_code: data.intervention_postal_code || '',
    intervention_city: data.intervention_city || '',
    amendment_details: data.amendment_details || {},
    parent_quote_id: data.parent_quote_id || null,
    parent_id: data.parent_id ?? null,
    payment_method: data.payment_method || '',
    paid_at: data.paid_at ? data.paid_at.split('T')[0] : '',
    report_pdf_url: data.report_pdf_url || null,
    require_otp: data.require_otp === true,
    quote_number: data.quote_number || null,
    invoice_number: data.invoice_number || null,
    transmission_status: data.transmission_status ?? null,
    transmission_ref: data.transmission_ref ?? null,
    transmitted_at: data.transmitted_at ?? null,
    transmission_error: data.transmission_error ?? null,
    transmission_service: data.transmission_service ?? null,
});

// Helper to auto-update CRM status
export const updateClientCRMStatus = async (clientId, quoteStatus) => {
    if (!clientId) return;

    let newStatus = null;
    if (quoteStatus === 'sent') newStatus = 'proposal';
    else if (['accepted', 'signed', 'billed', 'paid'].includes(quoteStatus)) newStatus = 'signed';
    else if (quoteStatus === 'refused') newStatus = 'lost';
    else if (quoteStatus === 'draft') newStatus = 'contacted'; // Working on it

    if (newStatus) {
        try {
            await supabase.from('clients').update({ status: newStatus }).eq('id', clientId);
            // removing toast to avoid noise, silent update is better for "magic" feel
        } catch (err) {
            console.error("Auto-update CRM error", err);
        }
    }
};
