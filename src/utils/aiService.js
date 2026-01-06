/**
 * Stores the OpenAI API Key in local storage (or user metadata if you prefer robust sync).
 * For this version, we use localStorage for simplicity and privacy, 
 * but we can sync to profile settings if requested.
 */
export const saveApiKey = (apiKey) => {
    localStorage.setItem('openai_api_key', apiKey);
};

export const getProvider = () => {
    return localStorage.getItem('ai_provider') || 'gemini';
};

export const getApiKey = () => {
    return localStorage.getItem('openai_api_key');
};

/**
 * Generates quote items based on a natural language description.
 * @param {string} userDescription - The user's description of work (e.g., "Rénovation sdb 5m2")
 * @param {object} context - Optional context (apiKey, provider, hourlyRate, instructions, etc.)
 * @returns {Promise<Array>} - Array of items { description, quantity, price, type, unit }
 */
export const generateQuoteItems = async (userDescription, context = {}) => {
    // Priority: Context > LocalStorage (fallback)
    const apiKey = context.apiKey || localStorage.getItem('openai_api_key');
    const provider = context.provider || localStorage.getItem('ai_provider') || 'gemini';

    if (!apiKey) {
        throw new Error("Clé API manquante. Veuillez la configurer dans votre profil.");
    }

    let constraints = "";
    // Handle both snake_case (DB) and camelCase (JS)
    const hourlyRate = context.hourlyRate || context.hourly_rate || context.ai_hourly_rate;
    const instructions = context.instructions || context.ai_instructions;

    // Note: Travel fee is now handled by zones in handleClientChange, 
    // so we don't explicitly ask AI to add it to avoid duplicates,
    // unless explicitly requested in instructions.

    if (hourlyRate) constraints += `- Utilise un taux horaire de main d'oeuvre de ${hourlyRate}€/h.\n`;
    if (instructions) constraints += `- RESPECTE CES INSTRUCTIONS SPÉCIALES : ${instructions}\n`;

    const systemPrompt = `
    Tu es un expert artisan du bâtiment (plomberie, électricité, peinture, etc.).
    Ton rôle est de convertir une description de travaux en une liste détaillée d'articles pour un devis.
    
    RÈGLES :
    1. Analyse la demande et déduis les matériaux nécessaires, la main d'oeuvre, et les consommables.
    2. Estime des prix réalistes du marché français (en Euros HT).
    3. Pour chaque ligne, détermine le type: 'service' (Main d'oeuvre) ou 'material' (Matériel).
    4. Sois précis mais concis dans les descriptions.
    
    ${constraints}
    
    FORMAT DE RÉPONSE ATTENDU (JSON pur, sans markdown):
    [
        {
            "description": "Désignation de l'article",
            "quantity": 1,
            "unit": "u" | "m2" | "ml" | "h" | "forfait",
            "price": 0.00,
            "type": "service" | "material"
        }
    ]
    `;

    try {
        let responseData;

        if (provider === 'gemini') {
            // Using gemini-1.5-flash-001 (Stable)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${systemPrompt}\n\nDESCRIPTION UTILISATEUR: "${userDescription}"`
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error("Gemini API Error Details:", errData);
                throw new Error(`Erreur Gemini (${response.status}): ${errData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const textRef = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textRef) throw new Error("Réponse Gemini vide");
            responseData = textRef;

        } else {
            // --- OPENAI API (Default) ---
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
                        { role: "user", content: `Génère le devis pour : "${userDescription}"` }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || "Erreur OpenAI API");
            }

            const data = await response.json();
            responseData = data.choices[0].message.content;
        }

        // Robust JSON extraction
        let jsonString = responseData.trim();
        const jsonMatch = jsonString.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            jsonString = jsonMatch[0];
        } else {
            // Fallback cleanup if no array brackets found (unlikely for a list)
            jsonString = jsonString
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
        }

        // Attempt to parse
        try {
            return JSON.parse(jsonString);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Raw:", jsonString);
            throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
        }

    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};

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
            // Using gemini-1.5-flash-001 (Stable)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${apiKey}`;
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
