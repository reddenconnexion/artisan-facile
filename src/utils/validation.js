/**
 * SECURITY: Input validation and sanitization utilities
 * Provides validation for user inputs, file uploads, and sensitive data
 */

// =============================================================================
// INPUT SANITIZATION
// =============================================================================

/**
 * Sanitize text input to prevent basic XSS
 * @param {string} input - Raw user input
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input, maxLength = 1000) => {
    if (typeof input !== 'string') return input;
    return input
        .trim()
        .replace(/[<>]/g, '') // Remove basic HTML tags
        .slice(0, maxLength);
};

/**
 * Sanitize input for display (encode HTML entities)
 * @param {string} input - Raw input
 * @returns {string} HTML-safe string
 */
export const escapeHtml = (input) => {
    if (typeof input !== 'string') return input;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return input.replace(/[&<>"']/g, (char) => map[char]);
};

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} Whether email is valid
 */
export const validateEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
};

// =============================================================================
// PHONE VALIDATION
// =============================================================================

/**
 * Validate phone number format (French and international)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone is valid
 */
export const validatePhone = (phone) => {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-\.\(\)]/g, '');
    // Accept French format (10 digits) or international format (+ followed by 8-15 digits)
    return /^(\+?\d{8,15}|0\d{9})$/.test(cleaned);
};

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
export const formatPhone = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
        // French format: 06 12 34 56 78
        return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
    }
    return phone;
};

// =============================================================================
// SIRET VALIDATION (French business ID)
// =============================================================================

/**
 * Validate SIRET number (14 digits with Luhn checksum)
 * @param {string} siret - SIRET number to validate
 * @returns {boolean} Whether SIRET is valid
 */
export const validateSiret = (siret) => {
    if (!siret || typeof siret !== 'string') return false;
    const cleaned = siret.replace(/\s/g, '');

    // Must be exactly 14 digits
    if (!/^\d{14}$/.test(cleaned)) return false;

    // Luhn algorithm validation
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        let digit = parseInt(cleaned[i], 10);
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }

    return sum % 10 === 0;
};

/**
 * Format SIRET for display
 * @param {string} siret - Raw SIRET
 * @returns {string} Formatted SIRET (XXX XXX XXX XXXXX)
 */
export const formatSiret = (siret) => {
    if (!siret) return '';
    const cleaned = siret.replace(/\s/g, '');
    if (cleaned.length !== 14) return siret;
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
};

/**
 * Mask SIRET for display (shows first 3 and last 3 digits)
 * @param {string} siret - SIRET to mask
 * @returns {string} Masked SIRET
 */
export const maskSiret = (siret) => {
    if (!siret) return '';
    const cleaned = siret.replace(/\s/g, '');
    if (cleaned.length < 6) return siret;
    return cleaned.slice(0, 3) + ' *** *** ' + cleaned.slice(-3);
};

// =============================================================================
// IBAN VALIDATION
// =============================================================================

/**
 * Validate IBAN format (basic validation)
 * @param {string} iban - IBAN to validate
 * @returns {boolean} Whether IBAN format is valid
 */
export const validateIban = (iban) => {
    if (!iban || typeof iban !== 'string') return false;
    const cleaned = iban.replace(/\s/g, '').toUpperCase();

    // Basic format: 2 letters + 2 digits + 11-30 alphanumeric
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false;

    // IBAN checksum validation (ISO 7064 Mod 97-10)
    const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
    const numericIban = rearranged.replace(/[A-Z]/g, (char) =>
        (char.charCodeAt(0) - 55).toString()
    );

    // Calculate mod 97 for large number
    let remainder = numericIban;
    while (remainder.length > 2) {
        const block = remainder.slice(0, 9);
        remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(9);
    }

    return parseInt(remainder, 10) % 97 === 1;
};

/**
 * Format IBAN for display (groups of 4)
 * @param {string} iban - Raw IBAN
 * @returns {string} Formatted IBAN
 */
export const formatIban = (iban) => {
    if (!iban) return '';
    const cleaned = iban.replace(/\s/g, '').toUpperCase();
    return cleaned.replace(/(.{4})/g, '$1 ').trim();
};

/**
 * Mask IBAN for display (shows first 4 and last 4 characters)
 * @param {string} iban - IBAN to mask
 * @returns {string} Masked IBAN
 */
export const maskIban = (iban) => {
    if (!iban) return '';
    const cleaned = iban.replace(/\s/g, '').toUpperCase();
    if (cleaned.length < 8) return iban;
    return cleaned.slice(0, 4) + ' **** **** **** ' + cleaned.slice(-4);
};

// =============================================================================
// FILE VALIDATION
// =============================================================================

// Allowed MIME types for different file categories
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];

// File size limits
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB

// Magic bytes for file type verification
const FILE_SIGNATURES = {
    pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46, 0x38],
    webp: [0x52, 0x49, 0x46, 0x46] // RIFF (WebP container)
};

/**
 * Validate file by checking magic bytes
 * @param {File} file - File to validate
 * @param {string} expectedType - Expected file type ('pdf', 'image')
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export const validateFile = async (file, expectedType = 'pdf') => {
    if (!file) {
        return { valid: false, error: 'Aucun fichier fourni' };
    }

    // Check MIME type
    if (expectedType === 'pdf') {
        if (!ALLOWED_PDF_TYPES.includes(file.type)) {
            return { valid: false, error: 'Type de fichier non autorisé. Seuls les PDF sont acceptés.' };
        }
        if (file.size > MAX_PDF_SIZE) {
            return { valid: false, error: `Fichier trop volumineux (max ${MAX_PDF_SIZE / 1024 / 1024} MB)` };
        }
    } else if (expectedType === 'image') {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return { valid: false, error: 'Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WebP.' };
        }
        if (file.size > MAX_IMAGE_SIZE) {
            return { valid: false, error: `Fichier trop volumineux (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)` };
        }
    } else if (expectedType === 'logo') {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return { valid: false, error: 'Type de fichier non autorisé. Utilisez JPG, PNG ou WebP.' };
        }
        if (file.size > MAX_LOGO_SIZE) {
            return { valid: false, error: `Logo trop volumineux (max ${MAX_LOGO_SIZE / 1024 / 1024} MB)` };
        }
    }

    // Verify magic bytes
    try {
        const buffer = await file.slice(0, 12).arrayBuffer();
        const header = new Uint8Array(buffer);

        let isValid = false;

        if (expectedType === 'pdf') {
            isValid = FILE_SIGNATURES.pdf.every((byte, i) => header[i] === byte);
        } else if (expectedType === 'image' || expectedType === 'logo') {
            // Check against all image signatures
            isValid =
                FILE_SIGNATURES.jpeg.every((byte, i) => header[i] === byte) ||
                FILE_SIGNATURES.png.every((byte, i) => header[i] === byte) ||
                FILE_SIGNATURES.gif.every((byte, i) => header[i] === byte) ||
                FILE_SIGNATURES.webp.every((byte, i) => header[i] === byte);
        }

        if (!isValid) {
            return { valid: false, error: 'Le contenu du fichier ne correspond pas au type déclaré.' };
        }
    } catch (e) {
        console.error('Error validating file:', e);
        return { valid: false, error: 'Erreur lors de la validation du fichier.' };
    }

    return { valid: true };
};

/**
 * Validate PDF file specifically
 * @param {File} file - PDF file to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export const validatePDF = (file) => validateFile(file, 'pdf');

/**
 * Validate image file
 * @param {File} file - Image file to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export const validateImage = (file) => validateFile(file, 'image');

/**
 * Validate logo file (smaller size limit)
 * @param {File} file - Logo file to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export const validateLogo = (file) => validateFile(file, 'logo');

// =============================================================================
// URL VALIDATION
// =============================================================================

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
export const validateUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

// =============================================================================
// QUOTE ITEMS VALIDATION
// =============================================================================

const MAX_ITEMS_PER_QUOTE = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PRICE = 1000000; // 1 million euros

/**
 * Validate quote items array
 * @param {Array} items - Quote items to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validateQuoteItems = (items) => {
    const errors = [];

    if (!Array.isArray(items)) {
        return { valid: false, errors: ['Les éléments du devis sont invalides'] };
    }

    if (items.length === 0) {
        errors.push('Le devis doit contenir au moins un élément');
    }

    if (items.length > MAX_ITEMS_PER_QUOTE) {
        errors.push(`Maximum ${MAX_ITEMS_PER_QUOTE} lignes par devis`);
    }

    items.forEach((item, index) => {
        if (!item.description || item.description.trim().length === 0) {
            errors.push(`Ligne ${index + 1}: Description requise`);
        }

        if (item.description && item.description.length > MAX_DESCRIPTION_LENGTH) {
            errors.push(`Ligne ${index + 1}: Description trop longue (max ${MAX_DESCRIPTION_LENGTH} caractères)`);
        }

        const qty = parseFloat(item.quantity);
        if (isNaN(qty) || qty < 0) {
            errors.push(`Ligne ${index + 1}: Quantité invalide`);
        }

        const price = parseFloat(item.price);
        if (isNaN(price) || price < 0 || price > MAX_PRICE) {
            errors.push(`Ligne ${index + 1}: Prix invalide`);
        }
    });

    return { valid: errors.length === 0, errors };
};

// =============================================================================
// EXPORTS SUMMARY
// =============================================================================

export default {
    // Sanitization
    sanitizeInput,
    escapeHtml,

    // Validation
    validateEmail,
    validatePhone,
    validateSiret,
    validateIban,
    validateUrl,
    validateFile,
    validatePDF,
    validateImage,
    validateLogo,
    validateQuoteItems,

    // Formatting
    formatPhone,
    formatSiret,
    formatIban,

    // Masking (for display of sensitive data)
    maskSiret,
    maskIban,

    // Constants
    MAX_ITEMS_PER_QUOTE,
};
