/**
 * Validators for AI-generated quote payloads.
 *
 * These run on whatever the AI returns before the data hits the form, so
 * they have to assume the worst (missing fields, wrong types, garbage
 * numbers, JSON wrapped in markdown). Kept in a separate module so they
 * can be unit-tested without touching the Supabase client.
 */

/**
 * Coerces a value to a finite number. Returns `fallback` and logs a warning
 * when the value is missing, NaN, Infinity or otherwise non-numeric. This
 * prevents silent data corruption (e.g. parseFloat("abc") || 1 turning a
 * malformed quantity into 1 with no signal to the caller).
 */
export function toSafeNumber(value, fallback, fieldName = 'value') {
    if (value === null || value === undefined || value === '') return fallback;
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) {
        console.warn(`[quoteValidation] Invalid numeric ${fieldName}: ${JSON.stringify(value)} → using ${fallback}`);
        return fallback;
    }
    return num;
}

/**
 * Validates an AI-generated quote item and returns a normalised version.
 * Throws on missing/invalid description (the only field we cannot recover
 * from); coerces numeric fields with a warning when malformed.
 */
export function validateQuoteItem(item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`Item ${index} : structure invalide.`);
    }
    if (typeof item.description !== 'string' || item.description.trim() === '') {
        throw new Error(`Item ${index} : description manquante.`);
    }
    return {
        description: item.description.trim(),
        quantity: toSafeNumber(item.quantity, 1, `items[${index}].quantity`),
        unit: typeof item.unit === 'string' && item.unit ? item.unit : 'u',
        price: toSafeNumber(item.price, 0, `items[${index}].price`),
        type: item.type === 'material' ? 'material' : 'service',
    };
}

/**
 * Extracts a JSON object from a possibly-noisy AI response (markdown fences,
 * leading prose, etc.) and parses it. Throws a user-facing error on failure.
 */
export function extractJsonObject(raw) {
    let s = String(raw ?? '').trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0]; else s = s.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(s);
    } catch {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
}

/**
 * Parses and validates the raw JSON response from the AI proxy for a
 * standard quote-generation prompt. Returns { items, suggestions,
 * estimated_duration } with each item normalised.
 */
export function parseQuoteResponse(raw) {
    const parsed = extractJsonObject(raw);
    const rawItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
    if (!Array.isArray(rawItems)) {
        throw new Error("L'IA a renvoyé un format invalide. Veuillez réessayer.");
    }
    const items = rawItems.map(validateQuoteItem);
    const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((s) => typeof s === 'string')
        : [];
    const estimated_duration = typeof parsed.estimated_duration === 'string'
        ? parsed.estimated_duration
        : null;
    return { items, suggestions, estimated_duration };
}
