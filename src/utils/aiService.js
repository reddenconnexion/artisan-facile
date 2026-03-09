import { supabase } from './supabase';

/**
 * Calls the ai-proxy Edge Function which securely retrieves the API key
 * from the database and proxies the request server-side.
 */
const callAiProxy = async (systemPrompt, userMessage) => {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: { systemPrompt, userMessage }
    });

    if (error) throw new Error(error.message || 'Erreur du proxy IA');
    if (data?.error) throw new Error(data.error);

    return data.rawResponse;
};

/**
 * Generates quote items based on a natural language description.
 * @param {string} userDescription - The user's description of work
 * @param {object} context - Optional context (hourlyRate, instructions, etc.)
 * @returns {Promise<Array>} - Array of items
 */
export const generateQuoteItems = async (userDescription, context = {}) => {
    const hourlyRate = context.hourlyRate || context.hourly_rate || context.ai_hourly_rate;
    const instructions = context.instructions || context.ai_instructions;

    let constraints = "";
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

    const rawResponse = await callAiProxy(systemPrompt, `DESCRIPTION UTILISATEUR: "${userDescription}"`);

    let jsonString = rawResponse.trim();
    const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        jsonString = jsonMatch[0];
    } else {
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    try {
        return JSON.parse(jsonString);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
};

/**
 * Analyzes natural language input to determine intent and extract structured data.
 * @param {string} userText - The user's spoken or typed command.
 * @returns {Promise<object>} - Structured intent
 */
export const processAssistantIntent = async (userText) => {
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
        "response": "Court message de confirmation à lire à l'utilisateur."
    }

    DÉTAILS DES CHAMPS 'data' PAR INTENTION :

    Pour 'calendar' :
    - title: "Rendez-vous avec M. Martin"
    - start_date: "YYYY-MM-DDTHH:MM:00"
    - duration: 60
    - description: "Détails..."

    Pour 'client' :
    - name: "Nom Prénom"
    - email: "email@exemple.com"
    - phone: "06..."
    - address: "Adresse complète"
    - notes: "Autres infos"

    Pour 'email' :
    - recipient_name: "Nom du destinataire"
    - subject: "Objet du mail"
    - body: "Corps du mail complet et poli"

    Pour 'navigation' :
    - page: "/app/clients" | "/app/devis" | "/app/agenda" | "/app/settings"
    `;

    const rawResponse = await callAiProxy(systemPrompt, `DEMANDE UTILISATEUR: "${userText}"`);

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    return JSON.parse(cleanJson);
};

/**
 * Generates a follow-up email content using AI.
 * @param {object} quote - The quote object
 * @param {object} client - The client object
 * @param {object} step - The step configuration (label, context)
 * @param {object} context - User settings/context
 * @returns {Promise<object>} { subject, body }
 */
export const generateFollowUpEmail = async (quote, client, step, context = {}) => {
    const companyName = context.companyName || "Votre Artisan";
    const userName = context.userName || "";

    const systemPrompt = `
    Tu es un assistant professionnel pour un artisan du bâtiment.
    Rédige un e-mail de relance pour un devis envoyé.

    CONTEXTE :
    - Artisan : ${companyName} ${userName ? `(${userName})` : ''}
    - Client : ${client.name || 'Client'}
    - Projet : ${quote.title || 'Travaux'}
    - Devis N° : ${quote.id}
    - Date du devis : ${new Date(quote.date).toLocaleDateString('fr-FR')}
    - Montant : ${quote.total_ttc ? quote.total_ttc + '€' : 'N/A'}

    OBJECTIF DE LA RELANCE : ${step.label}
    TON/INSTRUCTIONS SPÉCIFIQUES : ${step.context || "Ton professionnel, courtois et direct."}

    RÈGLES DE MISE EN FORME (texte brut, pas de HTML ni Markdown) :
    - Commence par "Bonjour [Nom],"
    - Sépare les paragraphes par une ligne vide (\\n\\n)
    - Un seul point central par paragraphe, phrases courtes
    - Termine par "Bien cordialement," suivi du nom de l'artisan
    - Pas de tirets, pas d'astérisques, pas de crochets

    FORMAT JSON ATTENDU :
    {
        "subject": "Objet du mail...",
        "body": "Corps du mail..."
    }
    `;

    const rawResponse = await callAiProxy(systemPrompt, 'Génère l\'email de relance.');

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    return JSON.parse(cleanJson);
};
