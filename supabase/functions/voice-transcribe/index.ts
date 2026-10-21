import { enforceRateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { readSecret } from '../_shared/vault.ts';
import { corsHeaders, corsPreflight, json, requireUser } from '../_shared/http.ts';

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

// Situer la conversation aide le modèle à reconnaître le vocabulaire du
// métier au lieu de le déformer (« cour-jus » pour court-jus…).
const VISIT_CONTEXT = "Contexte : visite de chantier. Un artisan du bâtiment (souvent électricien) parle avec son client en parcourant le logement. "
  + 'Vocabulaire fréquent : tableau électrique, disjoncteur, différentiel 30 mA, fusible, interrupteur, va-et-vient, prise 2P+T, terre, Linky, GTL, '
  + 'goulotte, moulure, boîte de dérivation, douille, court-jus, spot, plafonnier, applique, lustre, réglette LED, VMC, chauffe-eau, placo, saignée.';

const VERBATIM_PROMPT = `${VISIT_CONTEXT}\n\nTranscris cet enregistrement audio en français, mot pour mot. Retourne uniquement la transcription, sans commentaires ni formatage. Si l'enregistrement ne contient aucune parole audible, retourne une chaîne vide.`;

// Consigne de secours : une sortie différente (tours de parole) suffit à
// passer le filtre anti-citation qui bloque parfois la version mot pour mot.
const DIALOGUE_PROMPT = `${VISIT_CONTEXT}\n\nÉcris la transcription intégrale de cette conversation en français. Commence chaque prise de parole par « Artisan : » ou « Client : » quand on peut le déduire, sinon par « — ». Garde tout ce qui est dit sur les pièces, les travaux, les quantités et les constats. Aucun commentaire. Si personne ne parle, retourne une chaîne vide.`;

// Dictée : l'artisan décrit seul une pièce ou un poste, au calme. Des chiffres
// plutôt que des mots, pour que les quantités se lisent sans ambiguïté.
const DICTATION_CONTEXT = VISIT_CONTEXT.replace(
  'Un artisan du bâtiment (souvent électricien) parle avec son client en parcourant le logement.',
  "Un artisan du bâtiment (souvent électricien) dicte son relevé, pièce par pièce : l'existant, les travaux, les quantités, la fourniture.",
);
const DICTATION_PROMPT = `${DICTATION_CONTEXT}\n\nTranscris cette dictée en français, mot pour mot, en écrivant les quantités en chiffres (« 3 prises », « 2 x 1,5 mm² »). Retourne uniquement la transcription, sans commentaires ni formatage. Si l'enregistrement ne contient aucune parole audible, retourne une chaîne vide.`;
const DICTATION_RETRY_PROMPT = `${DICTATION_CONTEXT}\n\nÉcris ce que dit l'artisan dans cette dictée, en français, phrase par phrase, quantités en chiffres. Garde tout : pièces, travaux, quantités, constats. Aucun commentaire. Si personne ne parle, retourne une chaîne vide.`;

type GeminiAttempt = { model: string; temperature: number; prompt: string };
const GEMINI_ATTEMPTS: GeminiAttempt[] = [
  { model: 'gemini-2.5-flash', temperature: 0, prompt: VERBATIM_PROMPT },
  { model: 'gemini-2.5-flash', temperature: 0.4, prompt: DIALOGUE_PROMPT },
  { model: 'gemini-2.5-pro', temperature: 0.4, prompt: DIALOGUE_PROMPT },
];
const DICTATION_ATTEMPTS: GeminiAttempt[] = [
  { model: 'gemini-2.5-flash', temperature: 0, prompt: DICTATION_PROMPT },
  { model: 'gemini-2.5-flash', temperature: 0.4, prompt: DICTATION_RETRY_PROMPT },
  { model: 'gemini-2.5-pro', temperature: 0.4, prompt: DICTATION_RETRY_PROMPT },
];

// La passerelle Supabase coupe à 150 s : toutes les tentatives tiennent dans
// ce budget, et une tentative qui traîne ne mange pas celui des suivantes.
const TRANSCRIBE_BUDGET_MS = 135_000;
const MAX_ATTEMPT_MS = 70_000;
const MIN_ATTEMPT_MS = 15_000;

type GeminiOutcome = {
  transcript: string;
  finishReason?: string;
  blockReason?: string;
  httpError?: { status: number; message: string };
};

async function geminiTranscribe(
  apiKey: string,
  attempt: GeminiAttempt,
  mimeType: string,
  audioBase64: string,
  timeoutMs: number,
): Promise<GeminiOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${attempt.model}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              { text: attempt.prompt },
            ],
          }],
          generationConfig: { temperature: attempt.temperature },
        }),
      },
    );
    if (!response.ok) {
      const message = await readErrorMessage(response, `Erreur Gemini (${response.status})`);
      return { transcript: '', httpError: { status: response.status, message } };
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    // Le texte peut être réparti sur plusieurs parties : on les assemble
    // toutes au lieu de ne lire que la première.
    const transcript = (candidate?.content?.parts || [])
      .filter((p: { thought?: boolean }) => !p?.thought)
      .map((p: { text?: string }) => p?.text || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { transcript, finishReason: candidate?.finishReason, blockReason: data.promptFeedback?.blockReason };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

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
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const { user } = auth;
    supabase = auth.supabase;
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
    const userApiKey = await readSecret(profile.ai_preferences?.openai_api_key_secret_id);

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
    const { audioBase64, mimeType, kind } = body;
    const isDictation = kind === 'dictation';
    memoId = body.memoId;

    if (!audioBase64) return json({ error: 'Audio manquant' }, 400);

    // Update memo status to transcribing
    await markMemo({ status: 'transcribing' });

    const audioMimeType = bareMimeType(String(mimeType || 'audio/webm'));
    const audioBytes = Math.round(audioBase64.length * 3 / 4);
    const logPrefix = `[voice-transcribe] user=${user.id.slice(0, 8)} provider=${aiProvider} mime=${audioMimeType} bytes=${audioBytes}${isDictation ? ' kind=dictation' : ''}`;
    let transcript = '';
    let emptyReason = '';

    if (aiProvider === 'gemini') {
      // Plusieurs tentatives : Gemini renvoie parfois une transcription vide
      // sur un enregistrement parfaitement audible — coupée par son filtre
      // anti-citation (finishReason RECITATION, systématique à consigne
      // égale : la relance côté client échouait à l'identique) ou sans raison
      // (STOP vide, qui passe à la tentative suivante). Une visite perdait
      // ainsi 8 minutes de conversation.
      let silentAnswers = 0;
      const attempts = isDictation ? DICTATION_ATTEMPTS : GEMINI_ATTEMPTS;
      for (let i = 0; i < attempts.length; i += 1) {
        const remaining = TRANSCRIBE_BUDGET_MS - (Date.now() - startedAt);
        if (i > 0 && remaining < MIN_ATTEMPT_MS) break;
        const attempt = attempts[i];
        let outcome: GeminiOutcome;
        try {
          outcome = await geminiTranscribe(apiKey, attempt, audioMimeType, audioBase64, Math.min(remaining, MAX_ATTEMPT_MS));
        } catch (err) {
          const timedOut = (err as Error).name === 'AbortError';
          emptyReason = timedOut ? 'La transcription a pris trop de temps.' : `Erreur Gemini : ${(err as Error).message}`;
          console.warn(`${logPrefix} gemini attempt=${i + 1} model=${attempt.model} ${timedOut ? 'timeout' : `error=${(err as Error).message}`}`);
          continue;
        }

        if (outcome.httpError) {
          const { status, message } = outcome.httpError;
          console.error(`${logPrefix} gemini attempt=${i + 1} model=${attempt.model} status=${status} error=${message}`);
          // Clé refusée, fichier invalide… : une autre tentative n'y changera rien.
          if (status !== 429 && status < 500) {
            await markMemo({ status: 'error' });
            return json({ error: message }, 502);
          }
          emptyReason = message;
          continue;
        }

        if (outcome.transcript) {
          transcript = outcome.transcript;
          if (i > 0) console.log(`${logPrefix} gemini rattrapé attempt=${i + 1} model=${attempt.model}`);
          break;
        }

        const { finishReason, blockReason } = outcome;
        console.warn(`${logPrefix} gemini empty attempt=${i + 1} model=${attempt.model} finish=${finishReason ?? '-'} block=${blockReason ?? '-'}`);
        if (!blockReason && (!finishReason || finishReason === 'STOP')) {
          // Deux réponses « rien d'audible » d'affilée : c'est un vrai silence.
          silentAnswers += 1;
          emptyReason = '';
          if (silentAnswers >= 2) break;
        } else {
          emptyReason = blockReason
            ? `Gemini a refusé l'enregistrement (${blockReason}).`
            : `Gemini n'a pas terminé la transcription (${finishReason}).`;
        }
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
      // Whisper s'appuie sur ce texte pour l'orthographe des termes du métier.
      formData.append('prompt', isDictation ? DICTATION_CONTEXT : VISIT_CONTEXT);

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
