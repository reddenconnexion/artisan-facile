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
 * Prompt système par défaut pour la génération de devis.
 * Exporté pour permettre l'affichage et la personnalisation dans l'interface.
 */
export const DEFAULT_QUOTE_PROMPT = `Tu es un expert artisan du bâtiment français. Génère un devis précis à partir de la description des travaux.

RÈGLES DE TARIFICATION:
- Matériaux électriques: prix catalogue TTC 123elec.com × 1.25 (= prix client HT si TVA applicable, sinon prix TTC direct)
- Autres matériaux/fournitures: prix négoce français + marge 20-30% selon la filière
- Main d'œuvre: taux horaire marché selon la spécialité (électricien, plombier, peintre…)

RÈGLES GÉNÉRALES:
- type "service" = main d'œuvre/prestation | type "material" = fourniture/matériau
- Unités: u | m2 | ml | h | forfait
- Inclure consommables, protections sols/meubles, évacuation déchets si pertinent
- Descriptions courtes et précises (max 8 mots)
- Prix HT réalistes, compétitifs mais rentables

JSON UNIQUEMENT — pas de markdown, pas de texte avant/après:
{"items":[{"description":"...","quantity":1,"unit":"u","price":0.00,"type":"service"}],"suggestions":["..."],"estimated_duration":"X jours"}`;

/**
 * Parses the raw JSON response from the AI proxy.
 */
function parseQuoteResponse(raw) {
    let s = raw.trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0]; else s = s.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return { items: p, suggestions: [], estimated_duration: null };
        return { items: p.items || [], suggestions: p.suggestions || [], estimated_duration: p.estimated_duration || null };
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
}

/**
 * Generates quote items based on a natural language description.
 * @param {string} userDescription - The user's description of work
 * @param {object} context - Optional context (hourlyRate, instructions, customSystemPrompt, etc.)
 * @returns {Promise<{items, suggestions, estimated_duration}>}
 */
export const generateQuoteItems = async (userDescription, context = {}) => {
    const hourlyRate = context.hourlyRate || context.hourly_rate || context.ai_hourly_rate;
    const instructions = context.instructions || context.ai_instructions;
    const basePrompt = context.customSystemPrompt || DEFAULT_QUOTE_PROMPT;

    let extras = '';
    if (hourlyRate) extras += `\nTaux horaire MO imposé: ${hourlyRate}€/h.`;
    if (instructions) extras += `\nINSTRUCTIONS SPÉCIALES: ${instructions}`;

    const systemPrompt = basePrompt + extras;
    const rawResponse = await callAiProxy(systemPrompt, `TRAVAUX: "${userDescription}"`);
    return parseQuoteResponse(rawResponse);
};

/**
 * Analyzes natural language input to determine intent and extract structured data.
 * Supports both simple assistant commands and full voice pipeline intents.
 * @param {string} userText - The user's spoken or typed command.
 * @param {boolean} [fullPipeline=false] - If true, includes pipeline-specific intents.
 * @returns {Promise<object>} - Structured intent
 */
export const processAssistantIntent = async (userText, fullPipeline = false) => {
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const pipelineIntents = fullPipeline ? `
    6. 'create_client' : Créer une fiche client (nom, téléphone, email, adresse).
    7. 'create_quote' : Créer un devis pour un client avec description des travaux.
    8. 'create_invoice' : Transformer un devis accepté en facture, ou créer une facture directe.
    9. 'send_invoice' : Envoyer une facture existante par email au client.
    10. 'create_intervention_report' : Créer un rapport d'intervention (compte-rendu de chantier).
    11. 'schedule_appointment' : Planifier un rendez-vous client ou chantier.` : '';

    const pipelineDataFormats = fullPipeline ? `
    Pour 'create_client' :
    - name: "Nom Prénom" (obligatoire)
    - phone: "06..." (si mentionné)
    - email: "email@exemple.com" (si mentionné)
    - address: "Adresse complète" (si mentionnée)
    - notes: "Autres infos"

    Pour 'create_quote' :
    - client_name: "Nom du client" (si mentionné, sinon null)
    - title: "Titre du devis" (déduit des travaux)
    - description: "Description complète des travaux"
    - urgency: "normal" | "urgent" (si mentionné)

    Pour 'create_invoice' :
    - client_name: "Nom du client"
    - amount: 0.00 (montant si mentionné, sinon null)
    - description: "Description de la prestation"

    Pour 'send_invoice' :
    - client_name: "Nom du client"
    - description: "Contexte de la facture à envoyer"

    Pour 'create_intervention_report' :
    - client_name: "Nom du client" (si mentionné)
    - date: "${today}" (ou date mentionnée au format YYYY-MM-DD)
    - title: "Titre de l'intervention"
    - description: "Description des travaux effectués"
    - work_done: "Résumé du travail réalisé"

    Pour 'schedule_appointment' :
    - title: "Rendez-vous / Visite chantier..."
    - client_name: "Nom du client" (si mentionné)
    - start_date: "YYYY-MM-DDTHH:MM:00"
    - duration: 60 (durée en minutes)
    - description: "Détails"` : '';

    const systemPrompt = `
    Tu es l'assistant intelligent d'un artisan. Ta mission est d'analyser la demande vocale de l'utilisateur et d'extraire des actions structurées.

    INFORMATIONS CONTEXTUELLES :
    - Date d'aujourd'hui : ${today}
    - Heure actuelle : ${currentTime}

    INTENTIONS POSSIBLES (Choisis-en une seule) :
    1. 'calendar' : Pour planifier un rendez-vous, une réunion, un chantier.
    2. 'client' : Pour mettre à jour ou consulter une fiche client existante.
    3. 'email' : Pour envoyer un email, une relance, un message.
    4. 'navigation' : Pour aller sur une page spécifique (Clients, Devis, Agenda, Réglages).
    5. 'unknown' : Si la demande n'est pas claire.${pipelineIntents}

    FORMAT DE RÉPONSE ATTENDU (JSON pur, sans markdown) :
    {
        "intent": "calendar" | "client" | "email" | "navigation" | "unknown"${fullPipeline ? ' | "create_client" | "create_quote" | "create_invoice" | "send_invoice" | "create_intervention_report" | "schedule_appointment"' : ''},
        "data": { ...champs spécifiques selon l'intention... },
        "response": "Court message de confirmation à lire à l'utilisateur.",
        "confidence": 0.0 à 1.0
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
    ${pipelineDataFormats}
    `;

    const rawResponse = await callAiProxy(systemPrompt, `DEMANDE UTILISATEUR: "${userText}"`);

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    return JSON.parse(cleanJson);
};

/**
 * Generates a structured intervention report summary from a voice transcript.
 * @param {string} transcript - The voice transcription text
 * @returns {Promise<object>} { title, description, work_done, notes }
 */
export const generateInterventionSummary = async (transcript) => {
    const systemPrompt = `Tu es un assistant pour artisan du bâtiment.
Analyse la transcription vocale d'un artisan décrivant une intervention et génère un rapport structuré.

RÈGLES :
- "title" : Titre court et précis de l'intervention (10 mots max).
- "description" : Problème constaté ou demande initiale du client (ce qui était cassé, la demande).
- "work_done" : Travaux effectivement réalisés, pièces remplacées, réglages effectués (le détail de ce qui a été fait).
- "notes" : Observations internes, remarques techniques ou recommandations pour le suivi (laisser vide si rien de notable).

FORMAT JSON pur (sans markdown) :
{
    "title": "...",
    "description": "...",
    "work_done": "...",
    "notes": "..."
}`;

    const rawResponse = await callAiProxy(systemPrompt, `TRANSCRIPTION VOCALE : "${transcript}"`);

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    try {
        return JSON.parse(cleanJson);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
};

/**
 * Generates a quote from a site visit (voice notes + photos).
 * @param {string[]} voiceTranscripts - Transcriptions of voice notes
 * @param {string[]} photoAnalyses - Descriptions of photos from vision AI
 * @param {object} context - Optional context (hourlyRate, instructions)
 * @returns {Promise<object>} { title, items, suggestions, estimated_duration, price_range, confidence }
 */
export const generateQuoteFromSiteVisit = async (voiceTranscripts = [], photoAnalyses = [], context = {}) => {
    const parts = [];
    if (voiceTranscripts.length > 0) {
        parts.push('NOTES VOCALES:\n' + voiceTranscripts.map((t, i) => `${i + 1}. ${t}`).join('\n'));
    }
    if (photoAnalyses.length > 0) {
        parts.push('PHOTOS:\n' + photoAnalyses.map((a, i) => `Photo ${i + 1}: ${a}`).join('\n'));
    }
    const combined = parts.join('\n\n');

    const hourlyRate = context.hourlyRate || context.hourly_rate || context.ai_hourly_rate;
    const instructions = context.instructions || context.ai_instructions;
    const basePrompt = context.customSystemPrompt || DEFAULT_QUOTE_PROMPT;

    let extras = '\n\nMODE VISITE CHANTIER — retourne aussi title, price_range et confidence:';
    extras += '\n{"title":"...","items":[...],"suggestions":[...],"estimated_duration":"...","price_range":{"min":0,"max":0},"confidence":"high|medium|low"}';
    if (hourlyRate) extras += `\nTaux horaire MO: ${hourlyRate}€/h.`;
    if (instructions) extras += `\nINSTRUCTIONS: ${instructions}`;

    const rawResponse = await callAiProxy(basePrompt + extras, `VISITE CHANTIER:\n\n${combined}`);

    let s = rawResponse.trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0]; else s = s.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const parsed = JSON.parse(s);
        return {
            title: parsed.title || 'Devis visite chantier',
            items: (parsed.items || []).map(item => ({
                id: Date.now() + Math.random(),
                description: item.description,
                quantity: parseFloat(item.quantity) || 1,
                unit: item.unit || 'u',
                price: parseFloat(item.price) || 0,
                buying_price: 0,
                type: item.type || 'service',
            })),
            suggestions: parsed.suggestions || [],
            estimated_duration: parsed.estimated_duration || null,
            price_range: parsed.price_range || null,
            confidence: parsed.confidence || 'medium',
        };
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
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
