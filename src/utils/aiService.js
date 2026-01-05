
/**
 * Stores the OpenAI API Key in local storage (or user metadata if you prefer robust sync).
 * For this version, we use localStorage for simplicity and privacy, 
 * but we can sync to profile settings if requested.
 */
export const saveApiKey = (apiKey) => {
    localStorage.setItem('openai_api_key', apiKey);
};

export const getProvider = () => {
    return localStorage.getItem('ai_provider') || 'openai';
};

export const getApiKey = () => {
    return localStorage.getItem('openai_api_key');
};

/**
 * Generates quote items based on a natural language description.
 * @param {string} userDescription - The user's description of work (e.g., "Rénovation sdb 5m2")
 * @returns {Promise<Array>} - Array of items { description, quantity, price, type, unit }
 */
export const generateQuoteItems = async (userDescription) => {
    const apiKey = getApiKey();
    const provider = getProvider();

    if (!apiKey) {
        throw new Error("Clé API manquante. Veuillez la configurer dans votre profil.");
    }

    const systemPrompt = `
    Tu es un expert artisan du bâtiment (plomberie, électricité, peinture, etc.).
    Ton rôle est de convertir une description de travaux en une liste détaillée d'articles pour un devis.
    
    RÈGLES :
    1. Analyse la demande et déduis les matériaux nécessaires, la main d'oeuvre, et les consommables.
    2. Estime des prix réalistes du marché français (en Euros HT).
    3. Pour chaque ligne, détermine le type: 'service' (Main d'oeuvre) ou 'material' (Matériel).
    4. Sois précis mais concis dans les descriptions.
    
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
            // Using gemini-1.5-flash-latest for best compatibility
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
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
