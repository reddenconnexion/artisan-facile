// weekly-feedback-report
// ─────────────────────────────────────────────────────────────────────────────
// Agrège les retours artisans de la semaine écoulée, demande à l'IA une synthèse
// + un plan d'amélioration priorisé, stocke le rapport dans `feedback_reports`
// puis l'envoie par email à l'administrateur (Resend).
//
// Deux modes d'appel :
//   • Planifié (pg_cron) : header `x-cron-secret: <CRON_SECRET>` — pas de JWT.
//   • Manuel (bouton admin) : `Authorization: Bearer <JWT>` d'un compte admin.
//
// verify_jwt est désactivé dans config.toml : l'authentification est gérée
// manuellement ci-dessous (secret cron OU allowlist email), comme stripe-webhook.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Doit rester synchronisé avec src/constants/admin.js et les fonctions SQL.
const ADMIN_EMAILS = ['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  ux: 'Ergonomie',
  feature: 'Idée / fonctionnalité',
  other: 'Autre',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fmtDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Extrait un objet JSON d'une réponse IA qui peut être entourée de ```json … ```
function parseAiJson(raw: string): any {
  let txt = (raw || '').trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const first = txt.indexOf('{');
  const last = txt.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    txt = txt.slice(first, last + 1);
  }
  return JSON.parse(txt);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // ── Authentification : secret cron OU JWT admin ──────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    let authorized = false;

    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      authorized = true; // appel planifié
    } else {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const authClient = createClient(
          supabaseUrl,
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await authClient.auth.getUser();
        const email = user?.email?.toLowerCase();
        if (email && ADMIN_EMAILS.includes(email)) authorized = true;
      }
    }

    if (!authorized) {
      return json({ error: 'Non autorisé' }, 401);
    }

    // Service role : lecture des retours (bypass RLS) + écriture du rapport.
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Période analysée (7 jours par défaut) ────────────────────────────────
    let periodDays = 7;
    try {
      const body = await req.json();
      if (body && Number.isFinite(body.period_days) && body.period_days > 0) {
        periodDays = Math.min(90, Math.floor(body.period_days));
      }
    } catch {
      // pas de corps → valeurs par défaut
    }

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // ── Récupération des retours de la période ───────────────────────────────
    const { data: feedback, error: fbError } = await admin
      .from('feedback')
      .select('category, message, rating, page, created_at')
      .gte('created_at', periodStart.toISOString())
      .lt('created_at', periodEnd.toISOString())
      .order('created_at', { ascending: true });

    if (fbError) {
      return json({ error: `Lecture des retours impossible : ${fbError.message}` }, 500);
    }

    const items = feedback ?? [];
    const count = items.length;

    // Statistiques calculées côté serveur (fiables, fournies à l'IA en contexte).
    const byCategory: Record<string, number> = {};
    let ratingSum = 0;
    let ratedCount = 0;
    for (const f of items) {
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
      if (typeof f.rating === 'number' && f.rating > 0) {
        ratingSum += f.rating;
        ratedCount += 1;
      }
    }
    const avgRating = ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null;

    const periodLabel = `${fmtDateFr(periodStart)} → ${fmtDateFr(periodEnd)}`;

    let analysis: any;
    let summary: string;
    let model: string | null = null;

    if (count === 0) {
      // Semaine calme : pas d'appel IA, rapport minimal.
      summary = `Aucun nouveau retour artisan sur la période (${periodLabel}).`;
      analysis = {
        summary,
        satisfaction: { avg_rating: null, rated_count: 0, comment: 'Pas de note sur la période.' },
        themes: [],
        action_plan: [],
        quick_wins: [],
        period_label: periodLabel,
        stats: { total: 0, by_category: {} },
      };
    } else {
      // ── Construction du contexte pour l'IA ─────────────────────────────────
      const feedbackBlock = items
        .map((f, i) => {
          const cat = CATEGORY_LABELS[f.category] || f.category;
          const note = f.rating ? ` | note ${f.rating}/5` : '';
          const page = f.page ? ` | écran ${f.page}` : '';
          const msg = (f.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
          return `${i + 1}. [${cat}${note}${page}] ${msg}`;
        })
        .join('\n');

      const statsBlock = [
        `Total retours : ${count}`,
        `Répartition : ${Object.entries(byCategory).map(([k, v]) => `${CATEGORY_LABELS[k] || k}=${v}`).join(', ')}`,
        avgRating != null ? `Note moyenne : ${avgRating}/5 (${ratedCount} notes)` : 'Aucune note de satisfaction',
      ].join('\n');

      const systemPrompt = `Tu es product manager senior d'une application SaaS française destinée aux artisans du bâtiment (devis, factures, clients, comptabilité). On te fournit les retours envoyés par les artisans cette semaine. Ton rôle : produire une analyse synthétique et un plan d'amélioration ACTIONNABLE et PRIORISÉ.

Règles :
- Réponds en français, ton professionnel et concret, orienté décision.
- Regroupe les retours similaires en thèmes (ne liste pas chaque retour un par un).
- Priorise le plan d'action par valeur (impact utilisateur fort + effort raisonnable d'abord). Les bugs bloquants passent avant les idées de confort.
- Sois honnête sur le faible volume : n'invente pas de tendance s'il y a peu de retours.

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte autour), au format exact :
{
  "summary": "1 à 2 phrases résumant la semaine",
  "satisfaction": { "avg_rating": ${avgRating ?? 'null'}, "rated_count": ${ratedCount}, "comment": "courte lecture de la satisfaction" },
  "themes": [
    { "title": "titre court", "category": "bug|ux|feature|other", "mentions": 1, "sentiment": "negative|neutral|positive", "insight": "ce que ça révèle" }
  ],
  "action_plan": [
    { "priority": 1, "title": "action concrète", "rationale": "pourquoi", "impact": "high|medium|low", "effort": "high|medium|low", "category": "bug|ux|feature|other" }
  ],
  "quick_wins": ["amélioration rapide à fort ratio valeur/effort"]
}`;

      const userMessage = `Période analysée : ${periodLabel}

STATISTIQUES :
${statsBlock}

RETOURS BRUTS :
${feedbackBlock}`;

      // ── Appel Gemini (clé serveur) ─────────────────────────────────────────
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) {
        return json({ error: 'GEMINI_API_KEY non configurée côté serveur.' }, 503);
      }

      model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const aiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.4,
            // Désactive la réflexion étendue pour rester sous le délai de la fonction.
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!aiRes.ok) {
        const errData = await aiRes.json().catch(() => ({}));
        return json({ error: `Erreur Gemini (${aiRes.status}): ${errData.error?.message || aiRes.statusText}` }, 502);
      }

      const aiData = await aiRes.json();
      const rawResponse = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawResponse) {
        return json({ error: 'Réponse IA vide.' }, 502);
      }

      try {
        analysis = parseAiJson(rawResponse);
      } catch (_e) {
        return json({ error: 'Analyse IA illisible (JSON invalide).' }, 502);
      }

      // Garde-fous : on fige les stats fiables côté serveur.
      analysis.period_label = periodLabel;
      analysis.stats = { total: count, by_category: byCategory };
      if (analysis.satisfaction) {
        analysis.satisfaction.avg_rating = avgRating;
        analysis.satisfaction.rated_count = ratedCount;
      } else {
        analysis.satisfaction = { avg_rating: avgRating, rated_count: ratedCount, comment: '' };
      }
      summary = typeof analysis.summary === 'string' && analysis.summary.trim()
        ? analysis.summary.trim()
        : `${count} retour(s) analysé(s) sur la période (${periodLabel}).`;
    }

    // ── Enregistrement du rapport ────────────────────────────────────────────
    const { data: inserted, error: insertError } = await admin
      .from('feedback_reports')
      .insert({
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        feedback_count: count,
        summary,
        analysis,
        model,
      })
      .select('id')
      .single();

    if (insertError) {
      return json({ error: `Enregistrement du rapport impossible : ${insertError.message}` }, 500);
    }

    const reportId = inserted.id;

    // ── Envoi de l'email ─────────────────────────────────────────────────────
    const recipients = (Deno.env.get('REPORT_RECIPIENTS') || ADMIN_EMAILS.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    let emailSent = false;
    let emailError: string | null = null;

    if (!resendApiKey) {
      emailError = 'RESEND_API_KEY non configurée';
      console.log(`[DEV] Rapport hebdo #${reportId} généré (${count} retours). Email non envoyé : ${emailError}`);
    } else if (recipients.length === 0) {
      emailError = 'Aucun destinataire';
    } else {
      const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Artisan Facile <noreply@artisanfacile.fr>';
      const html = buildEmailHtml({ analysis, summary, count, periodLabel, avgRating });
      const text = buildEmailText({ analysis, summary, count, periodLabel });

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: emailFrom,
          to: recipients,
          subject: `📊 Retours artisans — semaine du ${fmtDateFr(periodStart)} (${count} retour${count > 1 ? 's' : ''})`,
          text,
          html,
        }),
      });

      emailSent = emailRes.ok;
      if (!emailRes.ok) {
        emailError = await emailRes.text().catch(() => 'Erreur Resend');
        console.error('Resend error:', emailError);
      }
    }

    await admin
      .from('feedback_reports')
      .update({
        email_sent: emailSent,
        email_sent_at: emailSent ? new Date().toISOString() : null,
        email_error: emailError,
      })
      .eq('id', reportId);

    return json({
      success: true,
      report_id: reportId,
      feedback_count: count,
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (error) {
    console.error('weekly-feedback-report error:', error);
    return json({ error: (error as Error).message }, 500);
  }
});

// ── Rendu email ────────────────────────────────────────────────────────────
const IMPACT_LABEL: Record<string, string> = { high: 'Fort', medium: 'Moyen', low: 'Faible' };

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEmailText(p: { analysis: any; summary: string; count: number; periodLabel: string }): string {
  const lines: string[] = [];
  lines.push(`Rapport hebdomadaire des retours artisans`);
  lines.push(`Période : ${p.periodLabel}`);
  lines.push('');
  lines.push(p.summary);
  lines.push('');
  const plan = Array.isArray(p.analysis?.action_plan) ? p.analysis.action_plan : [];
  if (plan.length) {
    lines.push('PLAN D\'AMÉLIORATION PRIORISÉ :');
    plan.forEach((a: any, i: number) => {
      lines.push(`${a.priority ?? i + 1}. ${a.title} (impact ${a.impact || '?'}, effort ${a.effort || '?'})`);
      if (a.rationale) lines.push(`   → ${a.rationale}`);
    });
    lines.push('');
  }
  lines.push('Détail complet : https://app.artisanfacile.fr/app/admin/reports');
  return lines.join('\n');
}

function buildEmailHtml(p: { analysis: any; summary: string; count: number; periodLabel: string; avgRating: number | null }): string {
  const themes = Array.isArray(p.analysis?.themes) ? p.analysis.themes : [];
  const plan = Array.isArray(p.analysis?.action_plan) ? p.analysis.action_plan : [];
  const quickWins = Array.isArray(p.analysis?.quick_wins) ? p.analysis.quick_wins : [];
  const satComment = p.analysis?.satisfaction?.comment || '';

  const themesHtml = themes.length
    ? themes.map((t: any) => `
        <li style="margin:0 0 10px;">
          <strong style="color:#111827;">${esc(t.title)}</strong>
          <span style="font-size:12px;color:#6b7280;">(${esc(CATEGORY_LABELS[t.category] || t.category)}${t.mentions ? ` · ${esc(t.mentions)} mention(s)` : ''})</span><br>
          <span style="color:#374151;font-size:14px;">${esc(t.insight)}</span>
        </li>`).join('')
    : '<li style="color:#6b7280;">Aucun thème particulier cette semaine.</li>';

  const planHtml = plan.length
    ? plan.map((a: any, i: number) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;width:28px;">
            <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:#2563eb;color:#fff;border-radius:50%;font-size:13px;font-weight:700;">${esc(a.priority ?? i + 1)}</span>
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
            <strong style="color:#111827;font-size:14px;">${esc(a.title)}</strong><br>
            <span style="color:#4b5563;font-size:13px;">${esc(a.rationale)}</span><br>
            <span style="font-size:11px;color:#6b7280;">Impact : ${esc(IMPACT_LABEL[a.impact] || a.impact || '—')} · Effort : ${esc(IMPACT_LABEL[a.effort] || a.effort || '—')} · ${esc(CATEGORY_LABELS[a.category] || a.category || '')}</span>
          </td>
        </tr>`).join('')
    : '<tr><td style="padding:10px 8px;color:#6b7280;">Aucune action requise cette semaine 🎉</td></tr>';

  const quickWinsHtml = quickWins.length
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:0 0 24px;">
         <p style="margin:0 0 8px;font-weight:700;color:#166534;font-size:13px;">⚡ Quick wins</p>
         <ul style="margin:0;padding-left:18px;color:#166534;font-size:13px;">
           ${quickWins.map((q: any) => `<li style="margin:0 0 4px;">${esc(q)}</li>`).join('')}
         </ul>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
    <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 32px;color:#fff;">
      <div style="font-size:34px;">📊</div>
      <h1 style="margin:8px 0 4px;font-size:20px;">Retours artisans — rapport hebdo</h1>
      <p style="margin:0;font-size:13px;opacity:0.85;">${esc(p.periodLabel)}</p>
    </div>
    <div style="padding:28px 32px;">
      <div style="display:flex;gap:12px;margin:0 0 22px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:10px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#111827;">${esc(p.count)}</div>
          <div style="font-size:12px;color:#6b7280;">retours reçus</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:10px;padding:14px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#111827;">${p.avgRating != null ? esc(p.avgRating) + '/5' : '—'}</div>
          <div style="font-size:12px;color:#6b7280;">satisfaction</div>
        </div>
      </div>

      <p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.5;">${esc(p.summary)}</p>
      ${satComment ? `<p style="margin:-12px 0 22px;color:#6b7280;font-size:13px;font-style:italic;">${esc(satComment)}</p>` : ''}

      <h2 style="font-size:15px;color:#111827;margin:0 0 12px;border-bottom:2px solid #eef2ff;padding-bottom:6px;">🧭 Thèmes de la semaine</h2>
      <ul style="margin:0 0 24px;padding-left:18px;">${themesHtml}</ul>

      <h2 style="font-size:15px;color:#111827;margin:0 0 12px;border-bottom:2px solid #eef2ff;padding-bottom:6px;">✅ Plan d'amélioration priorisé</h2>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${planHtml}</table>

      ${quickWinsHtml}

      <a href="https://app.artisanfacile.fr/app/admin/reports"
         style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Voir l'historique des rapports →
      </a>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
        Artisan Facile · Rapport généré automatiquement chaque lundi
      </p>
    </div>
  </div>
</body>
</html>`;
}
