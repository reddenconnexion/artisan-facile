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

    if (error) {
        // On a non-2xx status, supabase-js puts the error in `error` (a
        // FunctionsHttpError) and leaves `data` null, so the helpful message
        // returned by the Edge Function lives in the response body, not in
        // `error.message` (which is the opaque "Edge Function returned a
        // non-2xx status code"). Read it back so the user sees the real cause.
        try {
            const payload = await error.context?.json?.();
            if (payload?.error) throw new Error(payload.error);
        } catch (parseError) {
            // Re-throw the extracted message; swallow only genuine parse failures.
            if (parseError instanceof Error && parseError.message && parseError.message !== 'Edge Function returned a non-2xx status code') {
                throw parseError;
            }
        }
        throw new Error(error.message || 'Erreur du proxy IA');
    }

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

Ta mission : reconstruire FIDÈLEMENT et INTÉGRALEMENT la liste des lignes du devis en JSON STRICT. Ne résume pas, ne fusionne pas deux prestations distinctes, n'invente aucune ligne, et n'omets AUCUNE ligne chiffrée.

RÈGLES :
- Une ligne = une prestation OU une fourniture OU un en-tête de section.
- Fusionne les descriptions multi-lignes d'UNE MÊME ligne (ex. "Fourniture et pose" puis "carrelage 60x60" sur la ligne suivante = une seule ligne).
- Conserve les lignes optionnelles/variantes telles quelles (préfixe la description par "(Option) " si le devis l'indique).
- Détecte la quantité, l'unité (u, m2, m3, ml, h, forfait), le prix unitaire HT, le total HT de la ligne, et le type ("service" = main d'œuvre/prestation, "material" = fourniture/matériel, "section" = titre de catégorie).
- Pour une ligne "section" : quantity=1, price=0, total=0.
- Les remises/rabais/avoirs sont des lignes à prix NÉGATIF (price et total négatifs).
- Ignore : entêtes (Devis n°, Date, Client, SIRET…), pieds de page, coordonnées (téléphone, e-mail, adresse, IBAN/RIB), totaux globaux (Total HT, TVA, Net à payer), acomptes et échéanciers de paiement, conditions, signatures, mentions légales.
- Convertis les nombres au format anglais (point décimal, pas d'espace milliers). "1 234,56 €" devient 1234.56.
- COHÉRENCE OBLIGATOIRE : price ≈ total / quantity. Si une seule de ces valeurs manque, déduis-la des deux autres. Si elles sont incohérentes, fais confiance au total affiché et recalcule le prix unitaire (total / quantity).
- Descriptions concises, sans saut de ligne, sans coller le code article ou la référence.
- Si tu détectes le titre/objet du devis et le nom du client, retourne-les aussi.

FORMAT JSON STRICT (sans markdown, sans texte avant/après) :
{
  "title": "Titre/objet du devis ou null",
  "client_name": "Nom du client ou null",
  "items": [
    {"description":"...", "quantity":1, "unit":"u", "price":0.00, "total":0.00, "type":"service"}
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
    const items = Array.isArray(parsed.items) ? parsed.items.map(it => {
        const type = it.type === 'material' || it.type === 'section' ? it.type : 'service';
        const quantity = toSafeNumber(it.quantity, 1, 'pdf.quantity');
        let price = toSafeNumber(it.price, 0, 'pdf.price');
        const total = toSafeNumber(it.total, NaN, 'pdf.total');

        // Only DERIVE a missing unit price from the printed line total — never
        // "correct" a price the model already gave, since the model is usually
        // more reliable on the unit price than on a recomputed total and an
        // imperfect total would otherwise corrupt a correct price.
        if (type !== 'section' && !price && Number.isFinite(total) && total !== 0 && quantity > 0) {
            price = total / quantity;
        }

        return {
            id: Date.now() + Math.random(),
            description: String(it.description || '').trim(),
            quantity,
            unit: it.unit || 'u',
            price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
            buying_price: 0,
            type,
        };
    }).filter(it => it.description.length > 0) : [];

    return {
        title: typeof parsed.title === 'string' ? parsed.title.trim() : null,
        client_name: typeof parsed.client_name === 'string' ? parsed.client_name.trim() : null,
        items,
        notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    };
};

/**
 * System prompt used to extract a SUPPLIER (material) invoice from raw PDF text.
 * Unlike a quote, here every line is a purchased product and we also want the
 * supplier identity + invoice header so the comparator can rank suppliers.
 */
const SUPPLIER_INVOICE_PROMPT = `Tu es un expert en lecture de factures de fournisseurs de matériel du bâtiment (négoces, grossistes). Tu reçois le TEXTE BRUT extrait d'un PDF de facture (colonnes parfois désalignées, descriptions sur plusieurs lignes).

Ta mission : extraire FIDÈLEMENT l'en-tête de la facture et la liste COMPLÈTE des produits achetés, en JSON STRICT. N'invente aucune ligne, n'omets aucune ligne chiffrée, ne fusionne pas deux produits distincts.

RÈGLES :
- "supplier_name" : raison sociale du FOURNISSEUR (émetteur de la facture), pas du client/artisan.
- "invoice_number" : numéro de la facture si présent, sinon null.
- "invoice_date" : date de la facture au format AAAA-MM-JJ, sinon null.
- "total_ht" / "total_ttc" : totaux de la facture (nombres), sinon null.
- "currency" : "EUR" par défaut.
- Pour chaque ligne produit : "product_name" (libellé concis), "reference" (code/référence article si présent, sinon null), "quantity", "unit" (u, m2, m3, ml, kg, l, h, forfait…), "unit_price" (prix unitaire HT), "total_price" (montant de la ligne HT).
- Convertis les nombres au format anglais (point décimal, pas d'espace milliers). "1 234,56 €" devient 1234.56.
- COHÉRENCE : unit_price ≈ total_price / quantity. Si une valeur manque, déduis-la des deux autres ; en cas d'incohérence, fais confiance au total affiché.
- IGNORE : coordonnées, mentions légales, conditions de paiement, totaux globaux/TVA/écotaxe en pied de tableau (ne les mets pas comme produits), frais de port uniquement s'ils ne sont pas une vraie ligne facturée (sinon garde-les).

FORMAT JSON STRICT (sans markdown, sans texte avant/après) :
{
  "supplier_name": "Nom du fournisseur ou null",
  "invoice_number": "... ou null",
  "invoice_date": "AAAA-MM-JJ ou null",
  "total_ht": 0.00,
  "total_ttc": 0.00,
  "currency": "EUR",
  "items": [
    {"product_name":"...", "reference":"... ou null", "quantity":1, "unit":"u", "unit_price":0.00, "total_price":0.00}
  ]
}`;

/**
 * Extracts a structured supplier (material) invoice from raw PDF text using the
 * AI proxy. Returns the supplier/header fields and the purchased product lines.
 *
 * @param {string} pdfText - Raw text previously extracted from the invoice PDF.
 * @returns {Promise<{supplier_name, invoice_number, invoice_date, total_ht, total_ttc, currency, items: Array}>}
 */
export const extractSupplierInvoiceFromText = async (pdfText) => {
    if (!pdfText || pdfText.trim().length < 20) {
        throw new Error('Texte trop court pour être analysé.');
    }

    const truncated = pdfText.length > 12000 ? pdfText.slice(0, 12000) + '\n…[tronqué]' : pdfText;

    const rawResponse = await callAiProxy({
        systemPrompt: SUPPLIER_INVOICE_PROMPT,
        userMessage: `TEXTE DE LA FACTURE À ANALYSER :\n\n${truncated}`,
    });

    let parsed;
    try {
        parsed = extractJsonObject(rawResponse);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide pour l'extraction de la facture.");
    }

    const items = Array.isArray(parsed.items) ? parsed.items.map(it => {
        const quantity = toSafeNumber(it.quantity, 1, 'inv.quantity');
        let unitPrice = toSafeNumber(it.unit_price, 0, 'inv.unit_price');
        const totalPrice = toSafeNumber(it.total_price, NaN, 'inv.total_price');

        // Déduire le prix unitaire manquant à partir du total de ligne.
        if (!unitPrice && Number.isFinite(totalPrice) && totalPrice !== 0 && quantity > 0) {
            unitPrice = totalPrice / quantity;
        }
        const finalUnit = Number.isFinite(unitPrice) ? Math.round(unitPrice * 100) / 100 : 0;

        return {
            product_name: String(it.product_name || '').trim(),
            reference: it.reference ? String(it.reference).trim() : '',
            quantity,
            unit: it.unit || 'u',
            unit_price: finalUnit,
            total_price: Number.isFinite(totalPrice)
                ? Math.round(totalPrice * 100) / 100
                : Math.round(finalUnit * quantity * 100) / 100,
        };
    }).filter(it => it.product_name.length > 0) : [];

    return {
        supplier_name: typeof parsed.supplier_name === 'string' ? parsed.supplier_name.trim() : '',
        invoice_number: typeof parsed.invoice_number === 'string' ? parsed.invoice_number.trim() : '',
        invoice_date: typeof parsed.invoice_date === 'string' ? parsed.invoice_date.trim() : '',
        total_ht: toSafeNumber(parsed.total_ht, NaN, 'inv.total_ht'),
        total_ttc: toSafeNumber(parsed.total_ttc, NaN, 'inv.total_ttc'),
        currency: typeof parsed.currency === 'string' && parsed.currency.trim() ? parsed.currency.trim() : 'EUR',
        items,
    };
};

/**
 * Translates the free-text content of a quote (line-item descriptions, title,
 * notes) into the target language. Amounts, quantities and units are NOT sent
 * and never change — only human-written labels are translated.
 *
 * The descriptions are sent as an ordered array and must come back as an array
 * of the SAME length and order, so the caller can re-map each translation onto
 * its item by index (robust to duplicate descriptions).
 *
 * @param {object} content - { title, notes, descriptions: string[] }
 * @param {string} targetLang - 'en' (extendable later)
 * @returns {Promise<{title:string, notes:string, descriptions:string[]}>}
 */
export const translateQuoteContent = async (content, targetLang = 'en') => {
    const descriptions = Array.isArray(content?.descriptions) ? content.descriptions : [];
    const title = typeof content?.title === 'string' ? content.title : '';
    const notes = typeof content?.notes === 'string' ? content.notes : '';

    // Nothing to translate → return as-is without spending an AI call.
    if (!title.trim() && !notes.trim() && descriptions.every(d => !String(d || '').trim())) {
        return { title, notes, descriptions };
    }

    const langName = targetLang === 'en' ? 'anglais' : targetLang;

    const systemPrompt = `Tu es un traducteur professionnel spécialisé dans les devis du bâtiment (BTP) français. Tu traduis vers ${langName} en utilisant la terminologie technique correcte du métier (électricité, plomberie, maçonnerie, etc.).

RÈGLES STRICTES :
- Traduis UNIQUEMENT le texte ; ne traduis JAMAIS les nombres, montants, références produit, codes (ex. "U-1000 R2V", "3G10 mm²", "40 A", "NF C 15-100") ni les unités.
- Garde les titres de section en MAJUSCULES s'ils l'étaient.
- Conserve EXACTEMENT le même nombre d'éléments dans "descriptions" et le même ordre. Si une description est vide, renvoie une chaîne vide à la même position.
- Traduction naturelle et concise, pas mot-à-mot maladroit.
- Réponds en JSON STRICT, sans markdown, sans texte autour.

FORMAT DE RÉPONSE :
{"title":"...","notes":"...","descriptions":["...","..."]}`;

    const userMessage = `Traduis le contenu de ce devis vers ${langName}.\n\nDONNÉES (JSON) :\n${JSON.stringify({ title, notes, descriptions })}`;

    const rawResponse = await callAiProxy({ systemPrompt, userMessage });
    const parsed = extractJsonObject(rawResponse);

    const outDesc = Array.isArray(parsed.descriptions) ? parsed.descriptions : [];
    // Re-align defensively: keep the source string if the model dropped/added
    // an entry, so an item is never left with the wrong translation.
    const descriptionsOut = descriptions.map((src, i) => {
        const t = outDesc[i];
        return typeof t === 'string' && t.trim() ? t : src;
    });

    return {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : title,
        notes: typeof parsed.notes === 'string' ? parsed.notes : notes,
        descriptions: descriptionsOut,
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
 * Construit le bloc "INTELLIGENCE" injecté dans le prompt de relance à partir
 * du contexte renvoyé par `getRelanceContext` (historique client, engagement
 * e-mail, contexte du devis). Renvoie une chaîne vide si aucun signal.
 */
const buildRelanceSignals = (rc) => {
    if (!rc) return '';
    const lines = [];

    // ── Contexte du devis ──
    const q = rc.quote || {};
    if (q.ageDays != null) {
        lines.push(`- Devis envoyé il y a ${q.ageDays} jour${q.ageDays > 1 ? 's' : ''}.`);
    }
    if (q.followUpCount > 0) {
        lines.push(`- ${q.followUpCount} relance${q.followUpCount > 1 ? 's' : ''} déjà effectuée${q.followUpCount > 1 ? 's' : ''}${q.daysSinceLastFollowUp != null ? ` (la dernière il y a ${q.daysSinceLastFollowUp} j)` : ''} — espace les sollicitations et change d'angle, ne répète pas le même message.`);
    }
    if (q.validUntil && q.daysUntilExpiry != null) {
        if (q.expired) {
            lines.push(`- Le devis a dépassé sa date de validité (${q.validUntil}) : propose honnêtement de le réactualiser si besoin (prix matériaux/planning), sans inventer de hausse.`);
        } else if (q.daysUntilExpiry <= 15) {
            lines.push(`- Le devis est valable jusqu'au ${q.validUntil} (dans ${q.daysUntilExpiry} j) : tu peux rappeler cette échéance RÉELLE comme repère, sans dramatiser.`);
        }
    }

    // ── Historique client ──
    const c = rc.client || {};
    if (c.isReturningClient) {
        lines.push(`- Client FIDÈLE : ${c.signedCount} devis déjà signé${c.signedCount > 1 ? 's' : ''} par le passé${c.relationshipMonths ? `, relation suivie depuis ~${c.relationshipMonths} mois` : ''}. Reconnais cette relation de confiance avec sincérité (réciprocité), reste familier mais pro.`);
    } else if (c.totalPastQuotes === 0) {
        lines.push(`- NOUVEAU client (premier projet) : rassure, montre le sérieux et l'expérience du métier (preuve sociale générale et VRAIE, sans inventer de témoignage ni de chiffre).`);
    }
    if (c.rejectedCount > 0) {
        lines.push(`- A déjà refusé ${c.rejectedCount} devis : reste léger, ne force pas, mets en avant l'écoute et la flexibilité.`);
    }
    if (c.lastInteraction && c.lastInteraction.daysAgo != null) {
        lines.push(`- Dernier contact il y a ${c.lastInteraction.daysAgo} j (${c.lastInteraction.type}).`);
    }

    // ── Engagement e-mail ──
    const e = rc.engagement || {};
    if (e.quoteOpened) {
        lines.push(`- Le client a OUVERT le devis${e.lastOpenedDaysAgo != null ? ` (il y a ${e.lastOpenedDaysAgo} j)` : ''} mais n'a pas encore répondu : il y a probablement une hésitation ou une question en suspens. Invite-le doucement à exprimer son éventuel frein (budget, délai, détail technique).`);
    } else if (q.followUpCount > 0) {
        lines.push(`- Aucune ouverture détectée du devis : l'e-mail n'a peut-être pas été vu. Vérifie poliment la bonne réception et propose un autre canal (téléphone).`);
    }

    if (lines.length === 0) return '';
    return `\nSIGNAUX À EXPLOITER (personnalise le message en t'appuyant dessus, sans jamais les citer explicitement ni les énumérer) :\n${lines.join('\n')}\n`;
};

/**
 * Renvoie les consignes de persuasion selon le niveau choisi par l'artisan.
 * Tous les niveaux restent HONNÊTES : aucun fait inventé, urgence uniquement si
 * une vraie échéance existe.
 */
const buildPersuasionGuide = (level = 'soft') => {
    const common = `LEVIERS DE PERSUASION (à doser subtilement, jamais de façon mécanique ni visible) :
- Réciprocité : offre quelque chose d'utile (un conseil, une disponibilité, une petite flexibilité) avant de demander.
- Preuve sociale : évoque ton expérience sur des projets similaires de façon générale et VRAIE — n'invente jamais de témoignage, de note, de nom ou de chiffre.
- Cohérence/engagement : rappelle en douceur l'intérêt initial du client pour le projet.
- Aversion à la perte : évoque ce qu'un report concret peut impliquer (planning qui se remplit, organisation) sans menace ni urgence factice.
- Appel à l'action unique et à faible friction : termine par UN seul prochain pas simple (un oui/non, un appel de 10 min, un créneau proposé).`;

    const guards = `GARDE-FOUS (impératifs) :
- N'invente AUCUN fait : pas de fausse rareté, pas de promotion fictive, pas de hausse de prix imaginaire, pas de témoignage inventé.
- N'utilise l'urgence QUE si une échéance réelle est fournie (date de validité du devis).
- Reste honnête, respectueux et humain : la pression déguisée ou culpabilisante est interdite.`;

    const levels = {
        soft: `NIVEAU DE PERSUASION : DOUX. Priorité absolue à la relation et à la valeur. Très peu (voire pas) d'urgence. Ton chaleureux, jamais insistant. Un seul appel à l'action simple, formulé comme une proposition ouverte.`,
        balanced: `NIVEAU DE PERSUASION : ÉQUILIBRÉ. Mets en valeur les bénéfices concrets et un appel à l'action clair. Tu peux t'appuyer sur une échéance réelle si elle existe. Reste courtois et sans lourdeur.`,
        assertive: `NIVEAU DE PERSUASION : APPUYÉ. Ton plus directif et orienté décision, appel à l'action explicite et un peu plus pressant, mise en avant de l'échéance réelle. Toujours honnête, jamais de mensonge ni de culpabilisation.`,
    };

    return `${levels[level] || levels.soft}\n\n${common}\n\n${guards}`;
};

/**
 * Generates a follow-up email content using AI.
 * @param {object|object[]} quotes - A single quote or array of quotes (for grouped relances)
 * @param {object} client - The client object
 * @param {object} step - The step configuration (label, context)
 * @param {object} context - User settings/context. May include:
 *   - relanceContext: output of getRelanceContext (client history + quote signals)
 *   - persuasionLevel: 'soft' | 'balanced' | 'assertive' (default 'soft')
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

    const signalsBlock = buildRelanceSignals(context.relanceContext);
    const persuasionGuide = buildPersuasionGuide(context.persuasionLevel || 'soft');

    const systemPrompt = `Tu es un assistant professionnel pour un artisan du bâtiment, spécialiste de la relation client et de la conversion de devis.
Rédige un e-mail de relance PERSONNALISÉ pour ${isGrouped ? `${quotes.length} devis envoyés` : 'un devis envoyé'} à un client, dont l'objectif est de faire avancer vers la signature avec tact.

ARTISAN : ${artisanSignature}
CLIENT : ${client.name || 'Client'}
${quoteDate ? `DATE D'ENVOI DES DEVIS : ${quoteDate}` : ''}
DEVIS À RELANCER :
${quotesLines}

ÉTAPE DE RELANCE : ${step.label} (étape ${stepIndex + 1})
OBJECTIF : ${step.context || "Ton professionnel, courtois et direct."}
GUIDE : ${guide}
${signalsBlock}
${persuasionGuide}

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


/**
 * Génère une réponse à un avis client, optimisée pour le référencement local (SEO local).
 *
 * Bonnes pratiques SEO local intégrées au prompt : citer une fois le nom de
 * l'entreprise, la ville/zone d'intervention et le métier de façon NATURELLE
 * (pas de bourrage de mots-clés), personnaliser selon le contenu de l'avis,
 * rester humain et concis. Les avis négatifs sont traités avec empathie, sans
 * mots-clés marketing, en invitant à poursuivre hors ligne.
 *
 * @param {object} params
 * @param {string} params.reviewText - Le texte de l'avis laissé par le client.
 * @param {number} [params.rating=5] - La note (1 à 5 étoiles).
 * @param {string} [params.customerName] - Prénom/nom du client (optionnel).
 * @param {string} [params.tone='chaleureux'] - 'chaleureux' | 'professionnel' | 'concis'.
 * @param {object} [params.business] - Contexte entreprise { companyName, city, area, trade, signature }.
 * @param {number} [params.count=3] - Nombre de variantes distinctes à générer (1 à 4).
 * @returns {Promise<{replies: string[]}>}
 */
export const generateReviewReply = async ({
    reviewText,
    rating = 5,
    customerName = '',
    interventionCity = '',
    workObject = '',
    tone = 'chaleureux',
    business = {},
    count = 3,
} = {}) => {
    if (!reviewText || !reviewText.trim()) {
        throw new Error("Collez d'abord l'avis du client à traiter.");
    }

    const variantCount = Math.max(1, Math.min(4, Number(count) || 3));

    const companyName = (business.companyName || '').trim();
    const city = (business.city || '').trim();
    const area = (business.area || '').trim(); // ex. code postal ou zone d'intervention
    const trade = (business.trade || '').trim();
    const signature = (business.signature || '').trim();

    const safeRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const isNegative = safeRating <= 2;
    const isNeutral = safeRating === 3;

    const toneGuides = {
        chaleureux: 'Ton chaleureux et humain, comme un artisan reconnaissant qui parle à un voisin.',
        professionnel: 'Ton professionnel et posé, courtois et soigné.',
        concis: 'Ton direct et concis, sans formules creuses.',
    };
    const toneGuide = toneGuides[tone] || toneGuides.chaleureux;

    const localContextLines = [
        companyName && `- Nom de l'entreprise : ${companyName}`,
        trade && `- Métier / spécialité : ${trade}`,
        city && `- Ville principale : ${city}`,
        area && `- Zone d'intervention / code postal : ${area}`,
        signature && `- Signature à utiliser : ${signature}`,
    ].filter(Boolean).join('\n');

    // Contexte d'intervention saisi par l'artisan (souvent absent de l'avis).
    const interv = String(interventionCity || '').trim();
    const obj = String(workObject || '').trim();
    const interventionContextLines = [
        interv && `- Lieu d'intervention de ce chantier : ${interv}`,
        obj && `- Objet / nature des travaux : ${obj}`,
    ].filter(Boolean).join('\n');
    const interventionRule = (interv || obj)
        ? `\n- Si l'avis ne le mentionne pas déjà, évoque NATURELLEMENT (une seule fois) ${[interv && `le lieu d'intervention (${interv})`, obj && `la nature des travaux (${obj})`].filter(Boolean).join(' et ')} — utile pour le référencement local. N'invente jamais un autre lieu ni des travaux non fournis.`
        : '';

    const seoRules = isNegative
        ? `RÈGLES POUR UN AVIS NÉGATIF (note ${safeRating}/5) :
- Reste calme, empathique et professionnel — jamais sur la défensive.
- Remercie le client d'avoir pris le temps de partager son retour.
- Reconnais son ressenti et présente des excuses sincères si c'est justifié.
- Propose de poursuivre l'échange hors ligne (téléphone ou email) pour trouver une solution.
- N'insère AUCUN mot-clé marketing ni argument commercial : un avis négatif ne se "SEO-optimise" pas, il se gère humainement.
- ${companyName ? `Tu peux signer avec le nom de l'entreprise (${companyName}).` : 'Signe simplement.'}`
        : `RÈGLES SEO LOCAL POUR UN AVIS ${isNeutral ? 'NEUTRE' : 'POSITIF'} (note ${safeRating}/5) :
- Remercie sincèrement le client${customerName ? ` (${customerName})` : ''} et rebondis sur un détail PRÉCIS qu'il a mentionné dans son avis.
- Intègre NATURELLEMENT, une seule fois chacun et seulement s'ils sont fournis : le nom de l'entreprise, le métier${city ? ', la ville' : ''}. Ces éléments aident le référencement local Google.
- INTERDIT : le bourrage de mots-clés, les listes de villes, les phrases artificielles. La réponse doit sonner 100 % humaine et authentique.
- ${isNeutral ? "Montre ta volonté de t'améliorer et invite le client à te recontacter." : 'Invite chaleureusement le client à refaire appel à toi ou à te recommander.'}${interventionRule}`;

    // ── Variété ──────────────────────────────────────────────────────────────
    // On tire au sort un angle d'ouverture, un axe de contenu et une longueur
    // cible à CHAQUE appel pour casser l'effet « réponse type » répétitive.
    // Le tirage étant ré-aléatoire à chaque génération, le bouton « Régénérer »
    // produit naturellement une réponse différente.
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const openings = isNegative
        ? [
            'Ouvre en remerciant le client pour son retour, formulé sans cliché.',
            customerName
                ? `Ouvre en t'adressant directement à ${customerName} avec considération.`
                : 'Ouvre par une formule posée et respectueuse.',
            "Ouvre en reconnaissant d'emblée le ressenti exprimé dans l'avis.",
        ]
        : [
            "Ouvre en réagissant spontanément à un détail concret de l'avis (n'ouvre PAS par « Merci »).",
            customerName
                ? `Ouvre en t'adressant directement à ${customerName}, puis enchaîne sur une réaction personnelle.`
                : 'Ouvre par un accueil simple suivi d\'une réaction personnelle.',
            "Ouvre en exprimant le plaisir ou la fierté d'avoir mené ce projet à bien.",
            'Ouvre par un remerciement, mais tourné de façon originale et personnelle.',
        ];

    const angles = isNegative
        ? [
            "Centre la réponse sur ta volonté sincère de comprendre et de réparer la situation.",
            "Centre la réponse sur l'écoute : montre que chaque retour te sert à progresser.",
        ]
        : [
            "Mets l'accent sur la relation de confiance et l'envie de retravailler ensemble.",
            'Mets l\'accent sur le soin apporté au travail et la satisfaction du résultat.',
            'Mets l\'accent sur le côté humain et la qualité de l\'échange.',
            "Rebondis surtout sur le point précis que le client a souligné.",
        ];

    const lengths = [
        'Fais court : 2 phrases.',
        'Vise 3 phrases.',
        'Tu peux aller jusqu\'à 4 phrases si l\'avis est détaillé.',
    ];

    // On mélange les listes pour suggérer un point de départ différent à chaque
    // variante (et on re-tire à chaque appel, donc « Régénérer » varie aussi).
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const shuffledOpenings = shuffle(openings);
    const shuffledAngles = shuffle(angles);

    const varietyRules = variantCount > 1
        ? `CONSIGNES DE VARIÉTÉ (impératif — les ${variantCount} variantes doivent être CLAIREMENT différentes entre elles) :
- Chaque variante utilise une ouverture, une structure et une longueur DIFFÉRENTES des autres.
- Pistes d'ouverture à répartir entre les variantes : ${shuffledOpenings.slice(0, variantCount).join(' / ')}
- Pistes d'angle à répartir : ${shuffledAngles.slice(0, variantCount).join(' / ')}
- Fais varier la longueur d'une variante à l'autre (de 2 à 4 phrases).
- Ne réutilise pas les mêmes tournures ni le même vocabulaire d'une variante à l'autre.
- BANNIS ces formules toutes faites et clichés : « Merci beaucoup pour votre avis », « N'hésitez pas à refaire appel à nous », « Au plaisir de vous revoir », « Toute l'équipe vous remercie », « Cela nous va droit au cœur », « Votre satisfaction est notre priorité ».`
        : `CONSIGNES DE VARIÉTÉ (impératif, pour éviter les réponses qui se ressemblent) :
- ${shuffledOpenings[0]}
- ${shuffledAngles[0]}
- ${pick(lengths)}
- Varie la structure et le vocabulaire : ne réutilise pas systématiquement les mêmes tournures.
- BANNIS ces formules toutes faites et clichés : « Merci beaucoup pour votre avis », « N'hésitez pas à refaire appel à nous », « Au plaisir de vous revoir », « Toute l'équipe vous remercie », « Cela nous va droit au cœur », « Votre satisfaction est notre priorité ».`;

    const systemPrompt = `Tu es l'artisan propriétaire de l'entreprise et tu rédiges TA réponse publique à un avis client (avis Google / fiche établissement). Tu réponds à la première personne ("je", "nous").

CONTEXTE ENTREPRISE :
${localContextLines || '- (aucune information fournie, reste générique mais authentique)'}
${interventionContextLines ? `\nCONTEXTE DE CETTE INTERVENTION (fourni par l'artisan, peut ne pas figurer dans l'avis) :\n${interventionContextLines}\n` : ''}
${seoRules}

${varietyRules}

RÈGLES GÉNÉRALES DE STYLE :
- Réponds en français.
- ${toneGuide}
- Longueur : 2 à 4 phrases maximum par réponse (les réponses aux avis sont courtes).
- ${customerName ? `Adresse-toi au client par son prénom (${customerName}) au fil de la réponse.` : "Si tu ne connais pas le prénom, n'en invente aucun."}
- Pas d'emojis. Pas de markdown. Texte brut uniquement.
- Ne mets pas de mentions entre crochets ni de champs à remplir : chaque réponse doit être directement publiable.
- N'invente aucun fait (pas de nom de chantier, de date ou de montant non mentionnés dans l'avis).

FORMAT DE RÉPONSE (JSON pur, sans markdown, sans texte avant/après) :
{"replies": [${Array.from({ length: variantCount }, () => '"Une réponse publiable"').join(', ')}]}`;

    const userMessage = `AVIS DU CLIENT (note ${safeRating}/5)${customerName ? ` — Client : ${customerName}` : ''} :
"""
${reviewText.trim()}
"""

Rédige ${variantCount > 1 ? `${variantCount} variantes distinctes` : 'la réponse'} publique(s) optimisée(s).`;

    const rawResponse = await callAiProxy({ systemPrompt, userMessage });

    // Normalise différentes formes possibles renvoyées par le modèle en un
    // tableau de chaînes non vides.
    const toReplies = (value) => {
        if (Array.isArray(value)) {
            return value
                .map((v) => (typeof v === 'string' ? v : v?.reply))
                .filter((v) => typeof v === 'string' && v.trim())
                .map((v) => v.trim());
        }
        return [];
    };

    let replies = [];
    try {
        const parsed = extractJsonObject(rawResponse);
        replies = toReplies(parsed.replies);
        // Repli si le modèle a renvoyé l'ancien format { reply: "..." }.
        if (replies.length === 0 && typeof parsed.reply === 'string' && parsed.reply.trim()) {
            replies = [parsed.reply.trim()];
        }
    } catch {
        // Repli : texte brut sans JSON exploitable.
        const cleaned = String(rawResponse || '').trim();
        if (cleaned) replies = [cleaned];
    }

    if (replies.length === 0) {
        throw new Error("L'IA n'a pas généré de réponse. Veuillez réessayer.");
    }
    return { replies };
};


/**
 * Génère un bilan comptable et des conseils d'optimisation personnalisés, à la
 * manière d'un expert-comptable, à partir d'agrégats financiers (jamais de
 * données client nominatives).
 *
 * @param {object} params
 * @param {string} params.facts - Bloc factuel construit par buildAdviceFacts().
 * @param {string} [params.question] - Question libre optionnelle de l'artisan.
 * @returns {Promise<object>} Conseils structurés (voir FORMAT JSON ci-dessous).
 */
export const generateAccountingAdvice = async ({ facts, question = '' } = {}) => {
    if (!facts || !facts.trim()) {
        throw new Error('Aucune donnée comptable à analyser pour le moment.');
    }

    const systemPrompt = `Tu es un expert-comptable français spécialisé dans l'accompagnement des artisans du bâtiment (TPE, micro-entreprises, EI, EURL, SASU). Tu analyses la situation chiffrée d'un artisan et tu lui donnes des conseils CONCRETS et CHIFFRÉS pour optimiser légalement ses cotisations sociales, son imposition et la déduction de ses charges.

RÈGLES IMPÉRATIVES :
- Base-toi UNIQUEMENT sur les chiffres fournis. N'invente AUCUN montant : si une donnée manque, dis-le.
- Raisonne sur le STATUT le plus adapté (micro-entreprise vs régime réel : EI au réel, EURL à l'IR ou à l'IS, SASU) selon le niveau et la trajectoire de CA, et le niveau réel de charges déductibles de l'artisan.
- EXPLOITE EN PRIORITÉ les charges professionnelles réelles déclarées par l'artisan et la comparaison micro/réel chiffrée fournie dans les données : confirme ou nuance ce calcul, explique quel régime est le plus avantageux et de combien. Si l'artisan n'a pas saisi ses charges, dis-lui clairement que la comparaison micro/réel sera bien plus fiable une fois ses charges renseignées.
- Couvre systématiquement, quand c'est pertinent : le choix micro vs réel (intérêt de déduire les charges réelles si elles dépassent l'abattement forfaitaire), l'option du versement libératoire de l'impôt, l'ACRE, le passage ou non à la TVA (récupération de la TVA sur achats vs franchise en base), et le seuil de bascule micro→réel.
- Liste des CHARGES DÉDUCTIBLES typiques d'un artisan qu'il devrait penser à comptabiliser (sous un régime réel) : matériaux, outillage, véhicule/carburant, assurance décennale, sous-traitance, frais de déplacement, téléphonie, comptable, etc. — uniquement celles plausibles pour un artisan.
- Chiffre les gains/économies estimés quand c'est possible (ordres de grandeur, en précisant « estimation »).
- Conseils actionnables, pédagogiques, sans jargon inutile. Tutoiement professionnel.
- Tu n'es pas un avis fiscal personnalisé opposable : rappelle brièvement de valider avec un expert-comptable avant toute démarche importante.
- Seuils/taux 2025-2026 : micro services BIC cotisations ≈ 21,2 %, vente BIC ≈ 12,3 %, libéral BNC ≈ 24,6 %. Plafonds micro : 77 700 € (services/BNC), 188 700 € (vente). Franchise TVA : 37 500 € (services), 85 000 € (vente).

FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT, sans markdown, sans texte avant/après :
{
  "synthese": "2-4 phrases résumant la situation et l'enjeu principal.",
  "statut": {
    "actuel": "Statut actuel en clair",
    "recommande": "Statut recommandé (peut être identique à l'actuel)",
    "raison": "Pourquoi, en 1-2 phrases chiffrées."
  },
  "comparatif_statut": {
    "verdict": "micro" | "reel" | "comparable",
    "explication": "Explication chiffrée du régime le plus avantageux compte tenu des charges réelles déclarées (ou indication que les charges manquent pour trancher).",
    "micro": { "cotisations": "Montant ou ordre de grandeur", "base_imposable": "Montant", "commentaire": "1 phrase" },
    "reel": { "cotisations": "Montant estimé", "base_imposable": "Montant estimé", "commentaire": "1 phrase" }
  },
  "recommandations": [
    {
      "titre": "Titre court de la recommandation",
      "categorie": "statut" | "cotisations" | "impot" | "tva" | "charges" | "tresorerie",
      "priorite": "haute" | "moyenne" | "basse",
      "explication": "Explication claire et chiffrée (2-4 phrases).",
      "gain_estime": "Économie/gain estimé ou 'Non chiffrable' ",
      "action": "Prochaine étape concrète."
    }
  ],
  "charges_deductibles": [
    { "poste": "Nom du poste", "exemple": "Exemple concret", "condition": "Condition pour déduire (ex: passage au réel)" }
  ],
  "points_vigilance": ["Point de vigilance 1", "Point de vigilance 2"],
  "avertissement": "Rappel que ces conseils sont informatifs et à valider avec un expert-comptable."
}`;

    const userMessage = `DONNÉES COMPTABLES DE L'ARTISAN :
${facts}
${question && question.trim() ? `\nQUESTION SPÉCIFIQUE DE L'ARTISAN : "${question.trim()}"` : ''}

Analyse cette situation et renvoie le bilan + les conseils au format JSON demandé.`;

    const rawResponse = await callAiProxy({ systemPrompt, userMessage });

    let parsed;
    try {
        parsed = extractJsonObject(rawResponse);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }

    // Normalisation défensive : on garantit la forme attendue côté UI.
    const asArray = (v) => (Array.isArray(v) ? v : []);
    const recommandations = asArray(parsed.recommandations)
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({
            titre: String(r.titre || '').trim(),
            categorie: ['statut', 'cotisations', 'impot', 'tva', 'charges', 'tresorerie'].includes(r.categorie)
                ? r.categorie
                : 'charges',
            priorite: ['haute', 'moyenne', 'basse'].includes(r.priorite) ? r.priorite : 'moyenne',
            explication: String(r.explication || '').trim(),
            gain_estime: String(r.gain_estime || '').trim(),
            action: String(r.action || '').trim(),
        }))
        .filter((r) => r.titre || r.explication);

    const chargesDeductibles = asArray(parsed.charges_deductibles)
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
            poste: String(c.poste || '').trim(),
            exemple: String(c.exemple || '').trim(),
            condition: String(c.condition || '').trim(),
        }))
        .filter((c) => c.poste);

    const statut = parsed.statut && typeof parsed.statut === 'object' ? parsed.statut : {};

    // Comparatif micro vs réel (optionnel) — normalisé défensivement.
    const comp = parsed.comparatif_statut && typeof parsed.comparatif_statut === 'object' ? parsed.comparatif_statut : null;
    const regime = (r) => {
        const o = r && typeof r === 'object' ? r : {};
        return {
            cotisations: String(o.cotisations || '').trim(),
            base_imposable: String(o.base_imposable || '').trim(),
            commentaire: String(o.commentaire || '').trim(),
        };
    };
    const comparatifStatut = comp
        ? {
              verdict: ['micro', 'reel', 'comparable'].includes(comp.verdict) ? comp.verdict : 'comparable',
              explication: String(comp.explication || '').trim(),
              micro: regime(comp.micro),
              reel: regime(comp.reel),
          }
        : null;

    return {
        synthese: String(parsed.synthese || '').trim(),
        statut: {
            actuel: String(statut.actuel || '').trim(),
            recommande: String(statut.recommande || '').trim(),
            raison: String(statut.raison || '').trim(),
        },
        comparatif_statut: comparatifStatut,
        recommandations,
        charges_deductibles: chargesDeductibles,
        points_vigilance: asArray(parsed.points_vigilance).map((p) => String(p || '').trim()).filter(Boolean),
        avertissement: String(parsed.avertissement || '').trim(),
    };
};


/**
 * ─── Assistant conversationnel "Copilot Artisan" ──────────────────────────
 *
 * Aplatit l'historique de conversation en un seul `userMessage` pour passer
 * par le contrat existant de ai-proxy ({systemPrompt, userMessage}). Permet
 * un chat multi-tours sans modifier la Edge Function ni introduire de SSE.
 *
 * @param {string} systemPrompt - Instructions système (incluant le contexte page)
 * @param {Array<{role: "user"|"assistant", content: string}>} messages - Historique complet
 * @returns {Promise<string>} La réponse texte de l'assistant
 */
export const chatWithCopilot = async (systemPrompt, messages) => {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('"messages" doit contenir au moins un tour de conversation');
    }

    // Si un seul message utilisateur, on l'envoie tel quel (pas d'historique à aplatir)
    if (messages.length === 1 && messages[0].role === 'user') {
        return callAiProxy(systemPrompt, messages[0].content);
    }

    // Sinon, on aplatit l'historique au format texte
    // Le dernier message est forcément user — c'est lui qui déclenche la réponse
    const history = messages.slice(0, -1);
    const last    = messages[messages.length - 1];

    const historyText = history
        .map(m => `${m.role === 'user' ? 'Artisan' : 'Toi (Assistant)'}: ${m.content}`)
        .join('\n\n');

    const userMessage = `Voici l'historique de notre conversation :

${historyText}

Nouvelle demande de l'Artisan :
${last.content}

Réponds en restant cohérent avec le fil de discussion.`;

    return callAiProxy(systemPrompt, userMessage);
};

