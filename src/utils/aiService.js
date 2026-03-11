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
    Ton rôle est de convertir une description de travaux en une liste détaillée d'articles pour un devis,
    ET de fournir des conseils enrichis pour ne rien oublier.

    RÈGLES :
    1. Analyse la demande et déduis les matériaux nécessaires, la main d'oeuvre, et les consommables.
    2. Estime des prix réalistes du marché français (en Euros HT).
    3. Pour chaque ligne, détermine le type: 'service' (Main d'oeuvre) ou 'material' (Matériel).
    4. Sois précis mais concis dans les descriptions.
    5. Identifie les postes souvent oubliés pour ce type de travaux (protection, évacuation déchets, etc.).
    6. Estime la durée totale du chantier (ex: "1 jour", "2-3 jours", "1 semaine").

    ${constraints}

    FORMAT DE RÉPONSE ATTENDU (JSON pur, sans markdown):
    {
        "items": [
            {
                "description": "Désignation de l'article",
                "quantity": 1,
                "unit": "u" | "m2" | "ml" | "h" | "forfait",
                "price": 0.00,
                "type": "service" | "material"
            }
        ],
        "suggestions": [
            "Protection des sols et meubles",
            "Évacuation et tri des déchets de chantier"
        ],
        "estimated_duration": "2-3 jours"
    }
    `;

    const rawResponse = await callAiProxy(systemPrompt, `DESCRIPTION UTILISATEUR: "${userDescription}"`);

    let jsonString = rawResponse.trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonString = jsonMatch[0];
    } else {
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    try {
        const parsed = JSON.parse(jsonString);
        // Support both new enriched format and legacy array format
        if (Array.isArray(parsed)) {
            return { items: parsed, suggestions: [], estimated_duration: null };
        }
        return {
            items: parsed.items || [],
            suggestions: parsed.suggestions || [],
            estimated_duration: parsed.estimated_duration || null
        };
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
 * @param {object|object[]} quotes - A single quote or array of quotes (for grouped relances)
 * @param {object} client - The client object
 * @param {object} step - The step configuration (label, context)
 * @param {object} context - User settings/context
 * @returns {Promise<object>} { subject, body }
 */
export const generateFollowUpEmail = async (quotes, client, step, context = {}) => {
    // Accept both single quote and array of quotes
    if (!Array.isArray(quotes)) quotes = [quotes];

    const companyName = context.companyName || "Votre Artisan";
    const userName = context.userName || "";
    const artisanSignature = userName ? `${userName} — ${companyName}` : companyName;

    const stepIndex = step.index ?? 0;
    const isGrouped = quotes.length > 1;

    const quoteDate = quotes[0]?.date
        ? new Date(quotes[0].date).toLocaleDateString('fr-FR')
        : null;

    // Build the list of quotes for the prompt
    const quotesLines = quotes.map(q => {
        const montant = q.total_ttc
            ? Number(q.total_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
            : 'montant non précisé';
        return `  • ${q.title || 'Travaux'} : ${montant}`;
    }).join('\n');

    const stepGuides = [
        // Étape 0 — Première relance (J+3)
        `Message court et naturel (3-4 phrases). S'assurer que le${isGrouped ? 's devis sont' : ' devis est'} bien arrivé${isGrouped ? 's' : ''} et proposer de répondre à d'éventuelles questions. Aucune pression, ton humain.`,
        // Étape 1 — Deuxième relance (J+10)
        `Message de valeur (4-5 phrases). Souligner un point fort ${isGrouped ? 'des projets' : 'du projet'} ou apporter une précision technique utile. Rappeler la disponibilité pour en parler, de préférence par téléphone.`,
        // Étape 2 — Troisième relance (J+17)
        `Message direct et orienté action (4-5 phrases). Proposer explicitement un appel téléphonique pour lever les derniers doutes — c'est souvent plus simple qu'un échange d'emails.`,
        // Étape 3 — Message de clôture (J+30)
        `Message de clôture respectueux (4-5 phrases). Informer que le${isGrouped ? 's devis vont être archivés' : ' devis va être archivé'} prochainement. Laisser une porte ouverte pour un recontact futur, sans aucune pression. Ton chaleureux.`,
    ];

    const guide = stepGuides[stepIndex] || stepGuides[stepGuides.length - 1];

    const systemPrompt = `Tu es un assistant professionnel pour un artisan du bâtiment.
Rédige un e-mail de relance pour ${isGrouped ? `${quotes.length} devis envoyés` : 'un devis envoyé'} à un client.

ARTISAN : ${artisanSignature}
CLIENT : ${client.name || 'Client'}
${quoteDate ? `DATE D'ENVOI DES DEVIS : ${quoteDate}` : ''}
DEVIS À RELANCER :
${quotesLines}

ÉTAPE DE RELANCE : ${step.label} (étape ${stepIndex + 1})
OBJECTIF : ${step.context || "Ton professionnel, courtois et direct."}
GUIDE : ${guide}

EXEMPLE DE STYLE À SUIVRE (adapte-le au contexte ci-dessus) :
---
Bonjour Frédéric,

Je me permets de revenir vers vous concernant les trois devis que je vous ai transmis le 19 février :

• Devis atelier — Tableau divisionnaire + câblage 16mm² : 2 117,87 €
• Devis climatisation — Ligne dédiée groupe extérieur : 294,77 €
• Devis logement annexe — Mise en conformité électrique : 670,00 €

Avez-vous eu l'occasion d'en prendre connaissance ? Ces trois projets peuvent tout à fait être réalisés de manière indépendante, selon vos priorités et votre calendrier — ou regroupés pour optimiser le déplacement et la coordination.

Si vous avez des questions sur un point technique ou si vous souhaitez ajuster quoi que ce soit, je suis disponible pour en parler directement par téléphone. C'est souvent plus simple qu'un échange d'emails.

Bien cordialement,
Denis Meriot — Red Den Connexion
---

RÈGLES POUR L'OBJET DU MAIL :
- Ne jamais mentionner "relance" ni son numéro
- L'objet doit être naturel, centré sur le projet ou le client

RÈGLES DE MISE EN FORME (texte brut, pas de HTML ni Markdown) :
- Commence par "Bonjour [Prénom]," — utilise le prénom si tu peux le déduire du nom complet, sinon le nom entier
- Sépare les paragraphes par une ligne vide (\\n\\n)
- ${isGrouped ? 'Liste les devis sous forme de puces (•) avec titre et montant, précédés d\'une ligne vide' : 'Mentionne le projet et le montant clairement'}
- Phrases courtes, ton humain et direct — pas de jargon ni de formules creuses
- ${stepIndex >= 2 ? 'Propose explicitement un échange téléphonique' : 'Propose un échange téléphonique si pertinent'}
- Pas d'emojis
- Termine par "Bien cordialement,\\n${artisanSignature}"

FORMAT JSON ATTENDU :
{
    "subject": "Objet du mail...",
    "body": "Corps du mail..."
}`;

    const rawResponse = await callAiProxy(systemPrompt, 'Génère l\'email de relance.');

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    return JSON.parse(cleanJson);
};
