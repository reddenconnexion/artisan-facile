/**
 * Analyzes natural language input to determine intent and extract structured data using Gemini.
 * @param {string} userText - The user's spoken or typed command.
 * @param {object} context - Context (apiKey, current date, etc.)
 * @returns {Promise<object>} - Structured intent: { intent: 'calendar'|'client'|'email'|'unknown', data: object, response: string }
 */
export const processAssistantIntent = async (userText, context = {}) => {
    // Priority: Context > LocalStorage (fallback)
    const apiKey = context.apiKey || localStorage.getItem('openai_api_key');
    const provider = context.provider || localStorage.getItem('ai_provider') || 'gemini';

    if (!apiKey) {
        throw new Error("Clé API manquante. Veuillez la configurer dans votre profil.");
    }

    // Default to Gemini Flash instructions
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const systemPrompt = `
    Tu es l'assistant intelligent d'un artisan. Ta mission est d'analyser la demande vocale de l'utilisateur et d'extraire des actions structurées.
    
    INFORMATIONS CONTEXTUELLES :
    - Date d'aujourd'hui : ${today}
    - Heure actuelle : ${currentTime}
    
    INTENTIONS POSSIBLES (Choisis-en une seule) :
    1. 'calendar' : Pour planifier un rendez-vous, une réunion, un chantier.
    2. 'client' : Pour créer ou mettre à jour une fiche client.
    3. 'email' : Pour envoyer un email, une relance, un message.
    4. 'navigation' : Pour aller sur une page spécifique (Clients, Devis, Agenda, Réglages).
    5. 'unknown' : Si la demande n'est pas claire.

    FORMAT DE RÉPONSE ATTENDU (JSON pur) :
    {
        "intent": "calendar" | "client" | "email" | "navigation" | "unknown",
        "data": { ...champs spécifiques selon l'intention... },
        "response": "Court message de confirmation à lire à l'utilisateur (ex: 'C'est noté, je prépare le mail')."
    }

    DÉTAILS DES CHAMPS 'data' PAR INTENTION :

    Pour 'calendar' :
    - title: "Rendez-vous avec M. Martin" (Génère un titre clair)
    - start_date: "YYYY-MM-DDTHH:MM:00" (Date ISO déduite. Si 'demain', calcule la date. Si pas d'heure, mets 09:00 par défaut)
    - duration: 60 (Durée en minutes, 60 par défaut)
    - description: "Détails..."

    Pour 'client' :
    - name: "Nom Prénom"
    - email: "email@exemple.com" (si détecté)
    - phone: "06..." (si détecté)
    - address: "Adresse complète" (si détectée)
    - notes: "Autres infos"

    Pour 'email' :
    - recipient_name: "Nom du destinataire"
    - subject: "Objet du mail"
    - body: "Corps du mail complet et poli"

    Pour 'navigation' :
    - page: "/app/clients" | "/app/devis" | "/app/agenda" | "/app/settings"
    `;

    try {
        let jsonResponse = "";

        if (provider === 'gemini') {
            // Using gemini-1.5-flash (Fast & Efficient)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${systemPrompt}\n\nDEMANDE UTILISATEUR: "${userText}"`
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(`Erreur Gemini: ${err.error?.message || response.statusText}`);
            }

            const data = await response.json();
            jsonResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        } else {
            // Fallback OpenAI if configured
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    temperature: 0.3
                })
            });
            const data = await response.json();
            jsonResponse = data.choices[0].message.content;
        }

        // Clean JSON
        let cleanJson = jsonResponse.trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleanJson = jsonMatch[0];

        // Ensure quotes inside strings are escaped properly if manual parsing failed, 
        // but JSON.parse expects valid JSON. Gemini usually does well.

        return JSON.parse(cleanJson);

    } catch (e) {
        console.error("Assistant Intent Error:", e);
        throw e;
    }
};
