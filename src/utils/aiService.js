import { supabase } from './supabase';
import {
    toSafeNumber,
    validateQuoteItem,
    extractJsonObject,
    parseQuoteResponse,
} from './quoteValidation';

// Re-exported so callers that already import these from aiService keep working.
export { toSafeNumber };

/**
 * Calls the ai-proxy Edge Function which securely retrieves the API key
 * from the database and proxies the request server-side.
 *
 * Two call shapes:
 *   - { systemPrompt, userMessage }: legacy/explicit prompt path
 *   - { preset, extras, userMessage }: server resolves the preset (e.g. 'quote')
 *     against the user's saved customisation, keeping default prompts off the client bundle
 */
const callAiProxy = async (body) => {
    const { data, error } = await supabase.functions.invoke('ai-proxy', { body });

    if (data?.error) throw new Error(data.error);
    if (error) throw new Error(error.message || 'Erreur du proxy IA');

    return data.rawResponse;
};

/**
 * Prompt système par défaut pour la génération de devis.
 *
 * Production calls now resolve the prompt server-side via `preset: 'quote'`
 * in callAiProxy, so the server is the source of truth and can be tuned
 * without a frontend redeploy. This client-side copy is kept only as a
 * placeholder hint in the Profile page so users can see what the default
 * looks like before customising it.
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
 * System prompt used when extracting a quote from raw PDF text.
 * The text is unstructured (line-broken, possibly garbled by PDF extraction),
 * so the LLM is asked to recover the table structure and infer missing fields.
 */
const PDF_EXTRACTION_PROMPT = `Tu es un expert en lecture de devis BTP français. Tu reçois le TEXTE BRUT extrait d'un PDF de devis (les colonnes du tableau peuvent être désalignées, les descriptions parfois sur plusieurs lignes).

Ta mission : reconstruire la liste des lignes du devis en JSON STRICT.

RÈGLES :
- Une ligne = une prestation OU une fourniture OU un en-tête de section.
- Fusionne les descriptions multi-lignes (ex. "Fourniture et pose" sur une ligne, "carrelage 60x60" sur la suivante).
- Détecte la quantité, l'unité (u, m2, m3, ml, h, forfait), le prix unitaire HT, et le type ("service" pour main d'œuvre/prestation, "material" pour fourniture/matériel, "section" pour les titres de catégorie).
- Ignore : entêtes (Devis n°, Date, Client, SIRET…), pieds de page, totaux (Total HT, TVA, Net à payer), conditions, signatures, mentions légales.
- Convertis les nombres au format anglais (point décimal, pas d'espace milliers). Les "1 234,56 €" deviennent 1234.56.
- Si un prix unitaire manque mais qu'un total et une quantité sont présents, déduis le prix unitaire (total / qty).
- Descriptions concises, sans saut de ligne, sans le code article ou la référence collés.
- Si tu détectes le titre/objet du devis et le nom du client, retourne-les aussi.

FORMAT JSON STRICT (sans markdown, sans texte avant/après) :
{
  "title": "Titre/objet du devis ou null",
  "client_name": "Nom du client ou null",
  "items": [
    {"description":"...", "quantity":1, "unit":"u", "price":0.00, "type":"service"}
  ],
  "notes": "Conditions particulières / remarques détectées (vide si aucune)"
}`;

/**
 * Extracts structured quote items from raw PDF/Docx text using the AI proxy.
 * Far more tolerant of unusual layouts than the regex parser — used as a
 * fallback (or upgrade) when the regex extraction looks poor.
 *
 * @param {string} pdfText - Raw text previously extracted from the PDF.
 * @returns {Promise<{title:string|null, client_name:string|null, items:Array, notes:string}>}
 */
export const extractQuoteFromPdfText = async (pdfText) => {
    if (!pdfText || pdfText.trim().length < 20) {
        throw new Error('Texte trop court pour être analysé.');
    }

    // Cap the text size we send to the LLM so we don't blow up the prompt.
    // 12k chars is plenty for typical 3-5 page artisan quotes.
    const truncated = pdfText.length > 12000 ? pdfText.slice(0, 12000) + '\n…[tronqué]' : pdfText;

    const rawResponse = await callAiProxy({
        systemPrompt: PDF_EXTRACTION_PROMPT,
        userMessage: `TEXTE DU DEVIS À ANALYSER :\n\n${truncated}`,
    });

    let parsed;
    try {
        parsed = extractJsonObject(rawResponse);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide pour l'extraction PDF.");
    }

    // Reuse the shared safe-number coercion so PDF-extracted prices can't
    // silently turn malformed values into "1" or "0".
    const items = Array.isArray(parsed.items) ? parsed.items.map(it => ({
        id: Date.now() + Math.random(),
        description: String(it.description || '').trim(),
        quantity: toSafeNumber(it.quantity, 1, 'pdf.quantity'),
        unit: it.unit || 'u',
        price: toSafeNumber(it.price, 0, 'pdf.price'),
        buying_price: 0,
        type: it.type === 'material' || it.type === 'section' ? it.type : 'service',
    })).filter(it => it.description.length > 0) : [];

    return {
        title: typeof parsed.title === 'string' ? parsed.title.trim() : null,
        client_name: typeof parsed.client_name === 'string' ? parsed.client_name.trim() : null,
        items,
        notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    };
};

/**
 * Generates quote items based on a natural language description.
 * @param {string} userDescription - The user's description of work
 * @param {object} context - Optional context (hourlyRate, instructions, customSystemPrompt, etc.)
 * @returns {Promise<{items, suggestions, estimated_duration}>}
 */
export const generateQuoteItems = async (userDescription, context = {}) => {
    const hourlyRate = context.hourlyRate || context.hourly_rate || context.ai_hourly_rate;
    const instructions = context.instructions || context.ai_instructions;

    let extras = '';
    if (hourlyRate) extras += `\nTaux horaire MO imposé: ${hourlyRate}€/h.`;
    if (instructions) extras += `\nINSTRUCTIONS SPÉCIALES: ${instructions}`;

    const userMessage = `TRAVAUX: "${userDescription}"`;
    const rawResponse = context.customSystemPrompt
        ? await callAiProxy({ systemPrompt: context.customSystemPrompt + extras, userMessage })
        : await callAiProxy({ preset: 'quote', extras, userMessage });
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

    const rawResponse = await callAiProxy({ systemPrompt, userMessage: `DEMANDE UTILISATEUR: "${userText}"` });

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

    const rawResponse = await callAiProxy({ systemPrompt, userMessage: `TRANSCRIPTION VOCALE : "${transcript}"` });

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

    let extras = '';
    if (hourlyRate) extras += `\nTaux horaire MO: ${hourlyRate}€/h.`;
    if (instructions) extras += `\nINSTRUCTIONS: ${instructions}`;

    const userMessage = `VISITE CHANTIER:\n\n${combined}`;
    const siteVisitExtras = '\n\nMODE VISITE CHANTIER — retourne aussi title, price_range et confidence:\n{"title":"...","items":[...],"suggestions":[...],"estimated_duration":"...","price_range":{"min":0,"max":0},"confidence":"high|medium|low"}';
    const rawResponse = context.customSystemPrompt
        ? await callAiProxy({ systemPrompt: context.customSystemPrompt + siteVisitExtras + extras, userMessage })
        : await callAiProxy({ preset: 'quote-site-visit', extras, userMessage });

    const parsed = extractJsonObject(rawResponse);
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((item, i) => {
        const v = validateQuoteItem(item, i);
        return { ...v, id: Date.now() + Math.random(), buying_price: 0 };
    });

    const priceRange = parsed.price_range && typeof parsed.price_range === 'object'
        ? {
            min: toSafeNumber(parsed.price_range.min, 0, 'price_range.min'),
            max: toSafeNumber(parsed.price_range.max, 0, 'price_range.max'),
        }
        : null;

    const allowedConfidence = ['high', 'medium', 'low'];
    const confidence = allowedConfidence.includes(parsed.confidence) ? parsed.confidence : 'medium';

    return {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Devis visite chantier',
        items,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s) => typeof s === 'string') : [],
        estimated_duration: typeof parsed.estimated_duration === 'string' ? parsed.estimated_duration : null,
        price_range: priceRange,
        confidence,
    };
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

    const rawResponse = await callAiProxy({ systemPrompt, userMessage: 'Génère l\'email de relance.' });

    let cleanJson = rawResponse.trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    return JSON.parse(cleanJson);
};
