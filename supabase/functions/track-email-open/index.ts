// Edge Function `track-email-open`
//
// Endpoint public appelé par le pixel transparent 1x1 inséré dans les
// emails. Enregistre un événement d'ouverture dans `email_opens` et
// renvoie une image PNG transparente. Aucune authentification requise.
//
// URL appelée : .../functions/v1/track-email-open?t=<tracking_token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// PNG 1x1 transparent (43 octets) — généré une fois et inliné.
const TRANSPARENT_PNG = Uint8Array.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

const pixelHeaders = {
    'Content-Type': 'image/png',
    'Content-Length': String(TRANSPARENT_PNG.byteLength),
    // Empêcher la mise en cache pour qu'une réouverture déclenche un
    // nouveau hit (utile pour le compteur).
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
};

function pixelResponse() {
    return new Response(TRANSPARENT_PNG, { status: 200, headers: pixelHeaders });
}

// ── Détection des ouvertures automatiques (non humaines) ────────────────────
// Le pixel est massivement déclenché par des agents qui chargent les images
// sans action du destinataire : proxy Gmail (GoogleImageProxy/ggpht),
// passerelles de sécurité (Proofpoint, Mimecast, Barracuda…), bots de
// prévisualisation de lien (Outlook SafeLinks "Edge/12.246", facebookexternalhit,
// Slackbot…). On les marque `is_bot` pour qu'ils n'inflatent pas le compteur.
const BOT_UA_RE =
    /googleimageproxy|ggpht\.com|yahoo(mail)?proxy|mailproxy|bingpreview|facebookexternalhit|facebot|slackbot|slack-imgproxy|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|skypeuripreview|microsoft office|msoffice|microsoft-webdav|office365|proofpoint|mimecast|barracuda|ironport|forcepoint|fireeye|trustwave|cloudmark|messagelabs|symantec|crawler|spider|\bbot\b|bot\/|curl\/|wget|python-requests|go-http-client|java\/|okhttp|node-fetch|axios|headlesschrome|phantomjs|edge\/12\.246/i;

// Une ouverture survenue dans les 10 s suivant l'envoi provient quasi-
// systématiquement d'une passerelle de sécurité qui scanne le mail à la
// livraison, pas du destinataire.
const PREFETCH_WINDOW_MS = 10_000;

function isBotOpen(userAgent: string | null, sentAt: string | null): boolean {
    if (!userAgent || userAgent.trim() === '') return true;
    if (BOT_UA_RE.test(userAgent)) return true;
    if (sentAt) {
        const delta = Date.now() - new Date(sentAt).getTime();
        if (delta >= 0 && delta <= PREFETCH_WINDOW_MS) return true;
    }
    return false;
}

Deno.serve(async (req) => {
    // Quel que soit le résultat de l'enregistrement, on renvoie toujours le
    // pixel — on ne veut surtout pas casser l'affichage du mail côté client.
    try {
        const url = new URL(req.url);
        const token = url.searchParams.get('t');

        if (!token) return pixelResponse();

        // Validation simple du format UUID pour éviter les requêtes inutiles
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
            return pixelResponse();
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const { data: send } = await supabase
            .from('email_sends')
            .select('id, sent_at')
            .eq('tracking_token', token)
            .maybeSingle();

        if (send?.id) {
            const userAgent = req.headers.get('user-agent');
            // Forwarded-For renvoie souvent une chaîne "client, proxy1, proxy2"
            const fwd = req.headers.get('x-forwarded-for') || '';
            const ip = fwd.split(',')[0].trim() || null;

            await supabase.from('email_opens').insert({
                email_send_id: send.id,
                user_agent: userAgent,
                ip_address: ip,
                is_bot: isBotOpen(userAgent, send.sent_at ?? null),
            });
        }
    } catch (err) {
        console.error('track-email-open error:', err);
    }

    return pixelResponse();
});
