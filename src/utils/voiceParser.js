/**
 * Utility functions to parse voice transcripts into structured data using Regex/Heuristics.
 * "Free AI" approach running entirely on the client.
 */

// Common patterns
const PHONE_REGEX = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/;
const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.[a-z]{2,}/i;

export const parseClientVoice = (text) => {
    if (!text) return {};

    const result = {
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: ''
    };

    // 1. Extract Phone
    const phoneMatch = text.match(PHONE_REGEX);
    if (phoneMatch) {
        result.phone = phoneMatch[0].replace(/[\s.-]/g, ''); // Clean phone
        // Remove phone from text to avoid confusion? careful
    }

    // 2. Extract Email
    // Voice often says "arobase" or "point"
    let cleanTextForEmail = text.toLowerCase()
        .replace(/\s+arobase\s+/g, '@')
        .replace(/\s+point\s+/g, '.');
    const emailMatch = cleanTextForEmail.match(EMAIL_REGEX);
    if (emailMatch) {
        result.email = emailMatch[0];
    }

    // 3. Extract Name
    // Heuristic: "Client [Name]" or "Nouveau client [Name]" or "Je veux créer [Name]"
    // Or simply take the first few words if it looks like a name?
    // Let's look for "Client" keyword
    const clientKeyword = text.match(/(?:client|monsieur|madame|mme|mr)\s+([a-zà-ÿ\s]+)(?:au|téléphone|habite|adresse|$)/i);
    if (clientKeyword) {
        result.name = clientKeyword[1].trim();
    }

    // 4. Extract Address
    // "habitant à [Address]", "adresse [Address]"
    const addressMatch = text.match(/(?:habitant|habite|adresse|au)\s+(?:à|au)?\s*([^.,]+)/i);
    if (addressMatch) {
        // Filter out simple connectors if captured
        let addr = addressMatch[1].trim();
        // naive check to see if it's just a phone number fragment
        if (!addr.match(/^\d+$/)) {
            result.address = addr;
        }
    }

    // If no specific extraction, put everything in notes as fallback
    if (!result.name && !result.email && !result.phone) {
        result.notes = text;
    }

    return result;
};

export const parseQuoteItemVoice = (text) => {
    if (!text) return null;

    // Pattern: [Description] [Quantity] [Unit?] [Price?]
    // ex: "Pose de parquet 20m2 à 50 euros"
    // ex: "3 pots de peinture blanche"

    const result = {
        description: '',
        quantity: 1,
        price: 0
    };

    // Extract Price ("... à 50 euros", "pour 100€")
    const priceMatch = text.match(/(?:à|pour|prix|coût)\s+(\d+(?:[.,]\d+)?)\s*(?:euros|€)/i);
    if (priceMatch) {
        result.price = parseFloat(priceMatch[1].replace(',', '.'));
    }

    // Extract Quantity ("... 20 m2", "5 sacs")
    // Look for number not associated with price
    // This is tricky. Let's look for number + unit?
    const quantityMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m2|ml|u|h|jours?|sacs?|pots?|pcs?|unités?)/i);
    if (quantityMatch) {
        result.quantity = parseFloat(quantityMatch[1].replace(',', '.'));
        // Could optimize unit extraction here
    } else {
        // Fallback: finding a standalone number at the start? "2 robinets"
        const startNum = text.match(/^(\d+)\s+/);
        if (startNum) {
            result.quantity = parseFloat(startNum[1]);
        }
    }

    // Description: Remove Price and Quantities roughly
    let desc = text
        .replace(/(?:à|pour|prix|coût)\s+(\d+(?:[.,]\d+)?)\s*(?:euros|€)/i, '') // Remove price
        .replace(/(\d+(?:[.,]\d+)?)\s*(m2|ml|u|h|jours?|sacs?|pots?|pcs?|unités?)/i, '') // Remove Qty+Unit
        .trim();

    // Clean up
    desc = desc.replace(/^pour\s+/, '').replace(/^de\s+/, '');
    result.description = desc.charAt(0).toUpperCase() + desc.slice(1);

    return result;
};
