import { supabase } from './supabase';
import { classifyEmailSendResponse, EMAIL_SEND_CLOCK_MARGIN_MS } from './emailSendOutcome';

/**
 * Envoi d'un mail depuis l'adresse pro de l'artisan (Edge Function
 * `send-document-email`).
 *
 * Une connexion coupée après la demande ne veut pas dire que le mail n'est pas
 * parti (cas du 18/10/2026 : devis reçu par la cliente, erreur affichée et
 * messagerie rouverte pour un second envoi). Sans réponse exploitable, on
 * cherche donc la trace que le serveur enregistre juste avant de confier le
 * mail au SMTP (`email_sends`) :
 *
 *   - 'sent'          : le serveur confirme ;
 *   - 'probably_sent' : pas de confirmation, mais le serveur a pris la demande
 *                       en charge — ne pas rouvrir la messagerie ;
 *   - 'failed'        : le mail n'est pas parti (`error` explique pourquoi
 *                       quand le serveur l'a dit).
 *
 * @param {{ to: string, subject: string, text: string, html?: string, quote_id?: number|string|null, client_id?: number|string|null, attachments?: object[] }} payload
 * @returns {Promise<{ status: 'sent' | 'probably_sent' | 'failed', error: string | null }>}
 */
export const sendDocumentEmail = async (payload) => {
    const startedAt = Date.now();
    let outcome = 'unknown';
    let error = null;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/send-document-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => null);
        outcome = classifyEmailSendResponse({ ok: res.ok, result });
        if (outcome === 'failed') error = result.error;
        if (outcome === 'unknown') console.error('send-document-email: réponse illisible', res.status);
    } catch (err) {
        console.error('send-document-email: connexion interrompue', err);
        outcome = classifyEmailSendResponse({ networkError: true });
    }

    if (outcome === 'sent') return { status: 'sent', error: null };
    if (outcome === 'failed') return { status: 'failed', error };

    try {
        const recipient = String(payload.to || '').split(',')[0].trim();
        let query = supabase
            .from('email_sends')
            .select('id')
            .eq('recipient_email', recipient)
            .gte('sent_at', new Date(startedAt - EMAIL_SEND_CLOCK_MARGIN_MS).toISOString())
            .limit(1);
        if (payload.quote_id) query = query.eq('quote_id', payload.quote_id);
        const { data: trace } = await query;
        if (trace?.length) return { status: 'probably_sent', error: null };
    } catch (err) {
        console.error('send-document-email: vérification impossible', err);
    }
    return { status: 'failed', error: null };
};

export const probablySentMessage = (to) =>
    `La connexion a été coupée pendant l'envoi, mais le mail à ${to} est très probablement parti. Vérifiez vos messages envoyés avant de le renvoyer.`;
