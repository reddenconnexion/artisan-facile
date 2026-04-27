/**
 * Edge Function : pdp-webhook
 *
 * Reçoit les callbacks de statut envoyés par la PA/PDP/PPF après transmission
 * d'une facture Factur-X. Met à jour transmission_status dans la table quotes
 * et envoie une notification email à l'artisan si la facture est accusée.
 *
 * Endpoint public (pas de JWT Supabase) — sécurisé par signature HMAC-SHA256.
 * URL à déclarer auprès de votre PA :
 *   https://<project>.supabase.co/functions/v1/pdp-webhook
 *
 * Variables d'environnement requises :
 *   - PDP_WEBHOOK_SECRET     : secret HMAC pour les PDP génériques
 *   - B2BROUTER_WEBHOOK_SECRET : secret HMAC pour B2BRouter
 *   - RESEND_API_KEY         : (optionnel) pour les notifications email
 *   - EMAIL_FROM             : expéditeur des emails
 *
 * Formats supportés :
 *
 *   B2BRouter — header : X-B2Brouter-Signature: t=<timestamp>,s=<hmac_hex>
 *   Payload signé : "<timestamp>.<rawBody>"
 *   Champs payload : { id, state, ... }
 *   États : sent | delivered | acknowledged | registered | accepted | refused | error | invalid
 *
 *   Générique PDP — header : X-PDP-Signature | X-Webhook-Signature | X-Signature (hex brut)
 *   Payload signé : rawBody
 *   Champs payload : { invoiceReference, depositId, status, ... }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Normalisation des statuts PDP → statut interne
// ---------------------------------------------------------------------------

/**
 * Chaque PDP utilise ses propres codes de statut.
 * Ce tableau centralise tous les alias connus vers nos 4 valeurs internes :
 *   sent | acknowledged | rejected | (inchangé)
 */
const STATUS_MAP: Record<string, string> = {
  // Statuts "reçu / en traitement"
  RECEIVED: 'sent',
  DEPOSITED: 'sent',
  PROCESSING: 'sent',
  EN_COURS: 'sent',
  RECU: 'sent',
  SENT: 'sent',        // B2BRouter : envoyé à la PA destinataire

  // Statuts "accusé de réception / validé"
  ACKNOWLEDGED: 'acknowledged',
  VALIDATED: 'acknowledged',
  ACCEPTED: 'acknowledged',
  INTEGRE: 'acknowledged',
  VALIDE: 'acknowledged',
  TRAITE: 'acknowledged',
  CHORUS_INTEGRE: 'acknowledged',
  DELIVERED: 'acknowledged',    // B2BRouter : livré au destinataire
  REGISTERED: 'acknowledged',   // B2BRouter : enregistré côté acheteur
  APPROVED: 'acknowledged',

  // Statuts "rejeté / erreur"
  REJECTED: 'rejected',
  REFUSED: 'rejected',
  ERROR: 'rejected',
  INVALID: 'rejected',
  REJETE: 'rejected',
  REFUSE: 'rejected',
  ERREUR: 'rejected',
};

const normalizeStatus = (raw: string): string | null => {
  if (!raw) return null;
  return STATUS_MAP[raw.toUpperCase().replace(/[-\s]/g, '_')] ?? null;
};

// ---------------------------------------------------------------------------
// Vérification signature HMAC-SHA256
// ---------------------------------------------------------------------------

const hmacHex = async (secret: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Vérifie la signature HMAC-SHA256.
 *
 * B2BRouter  → header X-B2Brouter-Signature: t=<ts>,s=<hex>
 *              message signé = "<ts>.<rawBody>", secret = B2BROUTER_WEBHOOK_SECRET
 *
 * Générique → header X-PDP-Signature | X-Webhook-Signature | X-Signature (hex brut)
 *              message signé = rawBody, secret = PDP_WEBHOOK_SECRET
 */
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const b2bHeader = req.headers.get('x-b2brouter-signature');

  if (b2bHeader) {
    // Format B2BRouter : "t=<timestamp>,s=<hmac_hex>"
    const secret = Deno.env.get('B2BROUTER_WEBHOOK_SECRET');
    if (!secret) {
      console.warn('[pdp-webhook] B2BROUTER_WEBHOOK_SECRET non configuré — signature non vérifiée');
      return true;
    }
    const parts = Object.fromEntries(b2bHeader.split(',').map((p) => p.split('=')));
    const timestamp = parts['t'];
    const receivedSig = parts['s'];
    if (!timestamp || !receivedSig) {
      console.error('[pdp-webhook] Header X-B2Brouter-Signature malformé');
      return false;
    }
    const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
    return timingSafeEqual(expected, receivedSig);
  }

  // Format PDP générique
  const secret = Deno.env.get('PDP_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('[pdp-webhook] PDP_WEBHOOK_SECRET non configuré — signature non vérifiée');
    return true;
  }

  const receivedSig =
    req.headers.get('x-pdp-signature') ||
    req.headers.get('x-webhook-signature') ||
    req.headers.get('x-signature') ||
    '';

  if (!receivedSig) {
    console.error('[pdp-webhook] Aucun header de signature trouvé');
    return false;
  }

  const expected = await hmacHex(secret, rawBody);
  return timingSafeEqual(expected, receivedSig.replace(/^sha256=/, ''));
}

// ---------------------------------------------------------------------------
// Notification email artisan
// ---------------------------------------------------------------------------

async function sendAcknowledgedEmail(
  artisanEmail: string,
  artisanName: string,
  quoteNumber: string | null,
  pdpService: string | null,
  pdpRef: string | null,
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log(
      `[DEV] Email accusé de réception : ${artisanEmail} — facture ${quoteNumber} accusée par ${pdpService}`,
    );
    return;
  }

  const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <facture@artisanfacile.fr>';
  const serviceLabel = (pdpService ?? 'PDP/PPF').replace('_', ' ').toUpperCase();
  const invoiceLabel = quoteNumber ? `Facture n° ${quoteNumber}` : 'Votre facture';
  const refLine = pdpRef
    ? `<p style="margin:0 0 8px;color:#374151;font-size:15px;">Référence ${serviceLabel} : <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${pdpRef}</code></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Facture accusée de réception</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">📨</span>
    </div>
    <h2 style="margin:0 0 8px;color:#1e40af;font-size:20px;">Facture accusée de réception</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">
      Bonjour ${artisanName},<br><br>
      La plateforme <strong>${serviceLabel}</strong> a bien reçu et validé votre facture électronique.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;color:#374151;font-size:15px;font-weight:600;">${invoiceLabel}</p>
      ${refLine}
      <p style="margin:0;color:#6b7280;font-size:13px;">Transmise et accusée avec succès</p>
    </div>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Votre facture est maintenant enregistrée dans le circuit de facturation électronique.
      Conservez la référence ${serviceLabel} pour vos archives.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Bonjour ${artisanName},`,
    '',
    `La plateforme ${serviceLabel} a bien reçu et validé votre facture électronique.`,
    '',
    invoiceLabel,
    ...(pdpRef ? [`Référence ${serviceLabel} : ${pdpRef}`] : []),
    'Transmise et accusée avec succès.',
    '',
    `Votre facture est maintenant enregistrée dans le circuit de facturation électronique. Conservez la référence ${serviceLabel} pour vos archives.`,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailFrom,
      to: artisanEmail,
      subject: `${invoiceLabel} — Accusée de réception ${serviceLabel}`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[pdp-webhook] Resend error:', res.status, detail);
  }
}

// ---------------------------------------------------------------------------
// Réception de facture fournisseur (ReceivedInvoice B2BRouter)
// ---------------------------------------------------------------------------

async function handleReceivedInvoice(
  invoice: Record<string, unknown>,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  const contact = (invoice.contact as Record<string, unknown>) ?? {};
  const company = (invoice.company as Record<string, unknown>) ?? {};
  const buyerSiren = (contact.cin_value as string) ?? null;
  const b2brouterId = invoice.id != null ? String(invoice.id) : null;

  // Retrouver l'artisan par SIREN/SIRET de l'acheteur
  let userId: string | null = null;
  if (buyerSiren) {
    const { data: byExact } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('siret', buyerSiren)
      .maybeSingle();
    userId = byExact?.id ?? null;

    if (!userId) {
      // SIRET = SIREN + NIC (5 chiffres) — essai préfixe
      const { data: byPrefix } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .like('siret', `${buyerSiren}%`)
        .maybeSingle();
      userId = byPrefix?.id ?? null;
    }
  }

  if (!userId) {
    console.warn(`[pdp-webhook] ReceivedInvoice #${b2brouterId} : artisan introuvable pour SIREN=${buyerSiren} — stockage ignoré`);
    return;
  }

  const record = {
    user_id: userId,
    b2brouter_id: b2brouterId,
    supplier_name: (company.name as string) ?? null,
    supplier_siren: (company.cin_value as string) ?? null,
    supplier_tin: (company.tin_value as string) ?? null,
    invoice_number: (invoice.number as string) ?? null,
    invoice_date: (invoice.date as string) ?? null,
    due_date: (invoice.due_date as string) ?? null,
    total_ht: invoice.total_before_tax != null ? Number(invoice.total_before_tax) : null,
    total_ttc: invoice.total != null ? Number(invoice.total) : null,
    currency: (invoice.currency as string) ?? 'EUR',
    status: (invoice.state as string) ?? 'new',
    raw_payload: rawPayload,
  };

  const { error } = await supabaseAdmin
    .from('received_invoices')
    .upsert(record, { onConflict: 'b2brouter_id' });

  if (error) {
    console.error('[pdp-webhook] Erreur insertion received_invoices:', error.message);
  } else {
    console.log(`[pdp-webhook] ReceivedInvoice #${b2brouterId} stockée pour user=${userId}`);
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req) => {
  // La PDP envoie toujours POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Lire le body brut (nécessaire pour la vérification HMAC)
  const rawBody = await req.text();

  // Vérifier la signature HMAC
  const sigValid = await verifySignature(req, rawBody);
  if (!sigValid) {
    console.error('[pdp-webhook] Signature invalide — requête rejetée');
    return new Response(JSON.stringify({ error: 'Signature invalide' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parser le JSON
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------------------------------
  // Détection facture reçue (ReceivedInvoice) — à traiter avant la logique émission
  // ---------------------------------------------------------------------------
  const invoiceData = (payload.invoice as Record<string, unknown>) ?? payload;
  const invoiceType = String(invoiceData.type ?? payload.type ?? '');

  if (invoiceType === 'ReceivedInvoice') {
    await handleReceivedInvoice(invoiceData, payload);
    return new Response(JSON.stringify({ received: true, type: 'ReceivedInvoice' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extraire les champs (support multi-format PA/PDP)
  // B2BRouter utilise "state" ; les autres PA utilisent "status" / "statut"
  const rawStatus =
    (payload.state as string) ||
    (payload.status as string) ||
    (payload.statut as string) ||
    (payload.invoiceStatus as string) ||
    '';

  // Référence PA : B2BRouter = payload.id ; autres PDP = depositId / invoiceReference / …
  const pdpRef =
    (payload.id != null ? String(payload.id) : null) ||
    (payload.depositId as string) ||
    (payload.invoiceReference as string) ||
    (payload.identifiantDePieceJointePDP as string) ||
    (payload.reference as string) ||
    null;

  const rejectionReason =
    (payload.rejectionReason as string) ||
    (payload.motifRejet as string) ||
    (payload.message as string) ||
    null;

  const newStatus = normalizeStatus(rawStatus);

  if (!newStatus) {
    console.warn(`[pdp-webhook] Statut inconnu : "${rawStatus}" — ignoré`);
    // On répond 200 pour éviter les relivraisons en boucle
    return new Response(JSON.stringify({ received: true, skipped: true, reason: `Statut non géré: ${rawStatus}` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!pdpRef) {
    console.error('[pdp-webhook] Aucune référence PDP trouvée dans le payload');
    return new Response(JSON.stringify({ error: 'Référence facture manquante dans le payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Retrouver la facture via transmission_ref
  const { data: quote, error: quoteError } = await supabaseAdmin
    .from('quotes')
    .select('id, user_id, quote_number, transmission_status, transmission_service')
    .eq('transmission_ref', pdpRef)
    .maybeSingle();

  if (quoteError || !quote) {
    // Tentative de fallback sur quote_number (certaines PDP renvoient notre numéro)
    const { data: quoteByNumber } = await supabaseAdmin
      .from('quotes')
      .select('id, user_id, quote_number, transmission_status, transmission_service')
      .eq('quote_number', pdpRef)
      .maybeSingle();

    if (!quoteByNumber) {
      console.error(`[pdp-webhook] Facture introuvable pour ref="${pdpRef}"`);
      // On répond 200 pour éviter les relivraisons (la PDP ne peut pas corriger ça)
      return new Response(JSON.stringify({ received: true, warning: 'Facture introuvable' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    Object.assign(quote ?? {}, quoteByNumber);
  }

  // Éviter les régressions de statut (acknowledged → sent n'a pas de sens)
  const STATUS_RANK: Record<string, number> = { sent: 1, acknowledged: 2, rejected: 2 };
  const currentRank = STATUS_RANK[quote!.transmission_status ?? ''] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;

  if (newRank < currentRank) {
    console.log(`[pdp-webhook] Statut ignoré (régression) : ${quote!.transmission_status} → ${newStatus}`);
    return new Response(JSON.stringify({ received: true, skipped: true, reason: 'Régression de statut ignorée' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mettre à jour le statut en base
  const updatePayload: Record<string, unknown> = {
    transmission_status: newStatus,
  };
  if (newStatus === 'rejected' && rejectionReason) {
    updatePayload.transmission_error = rejectionReason;
  }
  if (newStatus === 'acknowledged') {
    updatePayload.transmission_error = null;
  }

  await supabaseAdmin.from('quotes').update(updatePayload).eq('id', quote!.id);

  console.log(
    `[pdp-webhook] quote=${quote!.id} ref=${pdpRef} ${quote!.transmission_status} → ${newStatus}`,
  );

  // Envoyer une notification email si la facture est accusée de réception
  if (newStatus === 'acknowledged') {
    try {
      // Récupérer email + nom de l'artisan
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(quote!.user_id);
      const artisanEmail = authUser?.user?.email;

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, company_name, email')
        .eq('id', quote!.user_id)
        .single();

      const email = profile?.email || artisanEmail;
      const name = profile?.company_name || profile?.full_name || 'Artisan';

      if (email) {
        await sendAcknowledgedEmail(
          email,
          name,
          quote!.quote_number?.toString() ?? null,
          quote!.transmission_service,
          pdpRef,
        );
      }
    } catch (emailErr) {
      // L'email est non bloquant : on log mais on répond 200
      console.error('[pdp-webhook] Erreur notification email:', emailErr);
    }
  }

  return new Response(JSON.stringify({ received: true, status: newStatus }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
