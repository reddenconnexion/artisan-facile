/**
 * Edge Function : received-invoice-action
 *
 * Actions de l'artisan sur une facture fournisseur reçue via B2BRouter :
 *
 *   accept     → statut « approuvée » renvoyé au fournisseur via la plateforme
 *   refuse     → statut « refusée » + motif (obligatoire) renvoyé au fournisseur
 *   fetch_pdf  → (re)télécharge le PDF chez B2BRouter et le range dans le bucket privé
 *
 * Sans identifiant B2BRouter (facture de test, import manuel) ou sans clé API
 * configurée, accept/refuse ne font qu'un marquage local, signalé par
 * `local: true` dans la réponse.
 *
 * Body : { id: <uuid received_invoices>, action: 'accept' | 'refuse' | 'fetch_pdf', reason?: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import {
  getB2BRouterConfig,
  switchInvoiceState,
  storeReceivedInvoicePdf,
  describeApiError,
  isUsableReference,
  type LifecycleAction,
} from '../_shared/b2brouter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ACTIONS = ['accept', 'refuse', 'fetch_pdf'] as const;
type Action = (typeof ACTIONS)[number];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Non autorisé' }, 401);

    const rl = await enforceRateLimit('received-invoice-action', user.id, 60, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { id, action, reason } = await req.json().catch(() => ({}));
    if (!id || !ACTIONS.includes(action as Action)) {
      return json({ error: 'Paramètres invalides : id et action (accept | refuse | fetch_pdf) requis' }, 400);
    }
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (action === 'refuse' && trimmedReason.length < 3) {
      return json({ error: 'Un motif de refus est obligatoire : il est transmis au fournisseur.' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: row, error: rowError } = await supabaseAdmin
      .from('received_invoices')
      .select('id, user_id, b2brouter_id, status, pdf_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (rowError) return json({ error: `Erreur base de données : ${rowError.message}` }, 500);
    if (!row) return json({ error: 'Facture reçue introuvable' }, 404);

    const cfg = getB2BRouterConfig();
    const hasPlatformRef = isUsableReference(row.b2brouter_id);

    // ── Récupération du PDF ───────────────────────────────────────────────
    if (action === 'fetch_pdf') {
      if (!cfg || !hasPlatformRef) {
        return json({ error: "Cette facture n'est pas rattachée à B2BRouter : aucun PDF à récupérer." }, 422);
      }
      const path = await storeReceivedInvoicePdf(supabaseAdmin, cfg, {
        id: row.id, user_id: row.user_id, b2brouter_id: row.b2brouter_id,
      });
      if (!path) return json({ error: 'PDF indisponible chez B2BRouter pour cette facture.' }, 422);
      return json({ success: true, pdf_path: path });
    }

    // ── Cycle de vie : approuvée / refusée ────────────────────────────────
    const newStatus = action === 'accept' ? 'acknowledged' : 'rejected';
    const update: Record<string, unknown> = {
      status: newStatus,
      refusal_reason: action === 'refuse' ? trimmedReason : null,
      lifecycle_error: null,
    };

    let local = true;
    if (cfg && hasPlatformRef) {
      const result = await switchInvoiceState(cfg, row.b2brouter_id as string, action as LifecycleAction, { reason: trimmedReason || undefined });
      if (!result.ok) {
        const message = describeApiError(result);
        await supabaseAdmin.from('received_invoices').update({ lifecycle_error: message }).eq('id', row.id);
        return json({ error: `Statut non transmis au fournisseur — ${message}` }, 422);
      }
      update.lifecycle_sent_at = new Date().toISOString();
      local = false;
    }

    const { error: updError } = await supabaseAdmin.from('received_invoices').update(update).eq('id', row.id);
    if (updError) return json({ error: `Erreur base de données : ${updError.message}` }, 500);

    console.log(`[received-invoice-action] ${row.id} ${row.status} → ${newStatus} (${local ? 'local' : 'transmis'})`);
    return json({ success: true, status: newStatus, local, lifecycle_sent_at: update.lifecycle_sent_at ?? null });
  } catch (err) {
    console.error('[received-invoice-action] Erreur inattendue:', err);
    return json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, 500);
  }
});
