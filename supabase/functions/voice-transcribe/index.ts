import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user profile for plan, provider and API key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ai_preferences, plan')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profil introuvable' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      return new Response(
        JSON.stringify({
          error: isPrivileged
            ? 'Service de transcription temporairement indisponible.'
            : `Clé API ${providerLabel} non configurée. Ajoutez-la dans votre profil pour utiliser la transcription vocale.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { audioBase64, mimeType, memoId } = body;

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: 'Audio manquant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update memo status to transcribing
    if (memoId) {
      await supabase
        .from('voice_memos')
        .update({ status: 'transcribing' })
        .eq('id', memoId)
        .eq('user_id', user.id);
    }

    const audioMimeType = mimeType || 'audio/webm';
    let transcript = '';

    if (aiProvider === 'gemini') {
      // Gemini audio transcription via inlineData
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
                  text: 'Transcris cet enregistrement audio en français. Retourne uniquement la transcription, sans commentaires ni formatage.'
                }
              ]
            }]
          })
        }
      );

      if (!geminiResponse.ok) {
        const errData = await geminiResponse.json();
        const errMsg = errData?.error?.message || `Erreur Gemini (${geminiResponse.status})`;

        if (memoId) {
          await supabase
            .from('voice_memos')
            .update({ status: 'error' })
            .eq('id', memoId)
            .eq('user_id', user.id);
        }

        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const geminiData = await geminiResponse.json();
      transcript = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

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
        const errData = await whisperResponse.json();
        const errMsg = errData?.error?.message || `Erreur Whisper (${whisperResponse.status})`;

        if (memoId) {
          await supabase
            .from('voice_memos')
            .update({ status: 'error' })
            .eq('id', memoId)
            .eq('user_id', user.id);
        }

        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const whisperData = await whisperResponse.json();
      transcript = whisperData.text?.trim() || '';
    }

    // Update memo with transcript and status
    if (memoId) {
      await supabase
        .from('voice_memos')
        .update({ transcript, status: 'processing' })
        .eq('id', memoId)
        .eq('user_id', user.id);
    }

    // Increment usage tracking
    const currentMonth = new Date().toISOString().slice(0, 7);
    await supabase.rpc('increment_voice_memo_usage', {
      p_user_id: user.id,
      p_month: currentMonth
    }).maybeSingle();

    return new Response(
      JSON.stringify({ transcript, memoId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
