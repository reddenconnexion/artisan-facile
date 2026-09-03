import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Les fournisseurs attendent un type MIME nu : « audio/webm;codecs=opus »
// (ce que produit MediaRecorder) devient « audio/webm ».
const bareMimeType = (mimeType: string) => mimeType.split(';')[0].trim().toLowerCase() || 'audio/webm';

// Corps d'erreur d'un fournisseur : JSON si possible, sinon le texte brut,
// pour ne jamais masquer la vraie cause derrière une erreur de parsing.
const readErrorMessage = async (response: Response, fallback: string) => {
  const raw = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.error || fallback;
  } catch {
    return raw ? `${fallback} — ${raw.slice(0, 200)}` : fallback;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let memoId: string | undefined;
  // deno-lint-ignore no-explicit-any
  let supabase: any = null;
  let userId = '';

  const markMemo = async (patch: Record<string, unknown>) => {
    if (!memoId || !supabase) return;
    await supabase.from('voice_memos').update(patch).eq('id', memoId).eq('user_id', userId);
  };

  try {
    // Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Non autorisé' }, 401);
    userId = user.id;

    // Rate limit : 60 transcriptions / heure / utilisateur.
    // Une visite prédevis enregistrée en continu est découpée en segments
    // (un par pièce, 8 min maximum) : une visite d'une heure représente à
    // elle seule une dizaine d'appels, là où l'ancienne limite de 10 était
    // dimensionnée pour des mémos vocaux isolés.
    const rl = await enforceRateLimit('voice-transcribe', user.id, 60, 3600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    // Fetch user profile for plan, provider and API key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ai_preferences, plan')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return json({ error: 'Profil introuvable' }, 404);

    // Determine provider and API key
    const userPlan = profile.plan || 'free';
    const isPrivileged = userPlan === 'pro' || userPlan === 'owner';
    const aiProvider = profile.ai_preferences?.ai_provider || 'openai';
    const userApiKey = profile.ai_preferences?.openai_api_key;

    let apiKey = null;
    if (isPrivileged) {
      if (aiProvider === 'gemini') {
        apiKey = Deno.env.get('GEMINI_API_KEY') || userApiKey;
      } else {
        apiKey = Deno.env.get('OPENAI_API_KEY') || userApiKey;
      }
    } else {
      apiKey = userApiKey;
    }

    if (!apiKey) {
      const providerLabel = aiProvider === 'gemini' ? 'Gemini' : 'OpenAI';
      return json({
        error: isPrivileged
          ? 'Service de transcription temporairement indisponible.'
          : `Clé API ${providerLabel} non configurée. Ajoutez-la dans votre profil pour utiliser la transcription vocale.`
      }, 400);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Enregistrement illisible (corps de requête invalide ou trop volumineux).' }, 400);
    }
    const { audioBase64, mimeType } = body;
    memoId = body.memoId;

    if (!audioBase64) return json({ error: 'Audio manquant' }, 400);

    // Update memo status to transcribing
    await markMemo({ status: 'transcribing' });

    const audioMimeType = bareMimeType(String(mimeType || 'audio/webm'));
    const audioBytes = Math.round(audioBase64.length * 3 / 4);
    const logPrefix = `[voice-transcribe] user=${user.id.slice(0, 8)} provider=${aiProvider} mime=${audioMimeType} bytes=${audioBytes}`;
    let transcript = '';
    let emptyReason = '';

    if (aiProvider === 'gemini') {
      // Gemini audio transcription via inlineData
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType: audioMimeType,
                    data: audioBase64
                  }
                },
                {
                  text: "Transcris cet enregistrement audio en français, mot pour mot. Retourne uniquement la transcription, sans commentaires ni formatage. Si l'enregistrement ne contient aucune parole audible, retourne une chaîne vide."
                }
              ]
            }],
            generationConfig: { temperature: 0 },
          })
        }
      );

      if (!geminiResponse.ok) {
        const errMsg = await readErrorMessage(geminiResponse, `Erreur Gemini (${geminiResponse.status})`);
        console.error(`${logPrefix} gemini status=${geminiResponse.status} error=${errMsg}`);
        await markMemo({ status: 'error' });
        return json({ error: errMsg }, 502);
      }

      const geminiData = await geminiResponse.json();
      const candidate = geminiData.candidates?.[0];
      // Le texte peut être réparti sur plusieurs parties : on les assemble
      // toutes au lieu de ne lire que la première.
      transcript = (candidate?.content?.parts || [])
        .map((p: { text?: string }) => p?.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const finishReason = candidate?.finishReason;
      const blockReason = geminiData.promptFeedback?.blockReason;
      if (!transcript) {
        emptyReason = blockReason
          ? `Gemini a refusé l'enregistrement (${blockReason}).`
          : finishReason && finishReason !== 'STOP'
            ? `Gemini n'a pas terminé la transcription (${finishReason}).`
            : '';
        console.warn(`${logPrefix} gemini empty finish=${finishReason ?? '-'} block=${blockReason ?? '-'}`);
      }

    } else {
      // OpenAI Whisper transcription
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const extension = audioMimeType.includes('ogg') ? 'ogg' : audioMimeType.includes('mp4') ? 'mp4' : 'webm';
      const formData = new FormData();
      formData.append('file', new Blob([bytes], { type: audioMimeType }), `audio.${extension}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'fr');
      formData.append('response_format', 'json');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        const errMsg = await readErrorMessage(whisperResponse, `Erreur Whisper (${whisperResponse.status})`);
        console.error(`${logPrefix} whisper status=${whisperResponse.status} error=${errMsg}`);
        await markMemo({ status: 'error' });
        return json({ error: errMsg }, 502);
      }

      const whisperData = await whisperResponse.json();
      transcript = whisperData.text?.trim() || '';
    }

    // Un fournisseur qui n'a pas pu traiter l'audio est une erreur : le
    // client doit pouvoir réessayer au lieu de croire à un silence.
    if (!transcript && emptyReason) {
      await markMemo({ status: 'error' });
      return json({ error: emptyReason }, 502);
    }

    console.log(`${logPrefix} ok chars=${transcript.length} ms=${Date.now() - startedAt}`);

    // Update memo with transcript and status
    await markMemo({ transcript, status: 'processing' });

    // Increment usage tracking
    const currentMonth = new Date().toISOString().slice(0, 7);
    await supabase.rpc('increment_voice_memo_usage', {
      p_user_id: user.id,
      p_month: currentMonth
    }).maybeSingle();

    // `empty: true` distingue un enregistrement sans parole audible d'un
    // échec : le client le range comme transcrit, sans le réessayer.
    return json({ transcript, memoId, empty: transcript === '' });

  } catch (error) {
    console.error(`[voice-transcribe] failure ms=${Date.now() - startedAt}`, error);
    await markMemo({ status: 'error' }).catch(() => {});
    return json({ error: (error as Error)?.message || 'Erreur interne' }, 500);
  }
});
