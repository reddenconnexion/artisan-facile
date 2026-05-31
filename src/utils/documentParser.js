import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { toast } from 'sonner';

// Configure worker to use the local file in public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Extracts text from a PDF preserving the visual layout.
 *
 * Improvements vs. naive extraction:
 *  - Y-tolerance is dynamic, derived from each item's font height (handles
 *    PDFs that mix font sizes — title vs. table rows).
 *  - When the X-gap between two consecutive glyphs on the same line is wider
 *    than ~half a character, an extra space is inserted. PDFs frequently
 *    encode table columns as widely-spaced text fragments without explicit
 *    whitespace, so the previous "join with single space" approach merged
 *    "Description Quantité Prix" into garbled blobs. With this fix, columns
 *    stay visually separated and downstream regexes can split on whitespace.
 */
export const extractTextFromPDF = async (file) => {
    try {
        toast.info("Lecture du fichier PDF en cours...");

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        loadingTask.onProgress = (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            console.log(`PDF Load Progress: ${percent}%`);
        };

        const pdf = await loadingTask.promise;
        toast.info(`PDF chargé: ${pdf.numPages} pages détectées`);

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            const items = textContent.items
                .filter(it => it.str !== undefined)
                .map(item => ({
                    str: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width || 0,
                    height: item.height || (item.transform[3] || 10),
                }));

            if (items.length === 0) continue;

            // Sort by Y descending (PDF origin is bottom-left → top of page = high Y)
            items.sort((a, b) => b.y - a.y || a.x - b.x);

            // Group items into lines using each item's own height as the tolerance.
            const lines = [];
            let currentLine = [];
            let currentY = items[0].y;
            let currentH = items[0].height || 10;

            for (const item of items) {
                const tol = Math.max(2, (item.height || currentH) * 0.5);
                if (currentLine.length === 0) {
                    currentLine.push(item);
                    currentY = item.y;
                    currentH = item.height || currentH;
                } else if (Math.abs(item.y - currentY) <= tol) {
                    currentLine.push(item);
                } else {
                    lines.push(currentLine);
                    currentLine = [item];
                    currentY = item.y;
                    currentH = item.height || currentH;
                }
            }
            if (currentLine.length > 0) lines.push(currentLine);

            // For each line, sort by X and rebuild text while preserving column gaps.
            for (const line of lines) {
                line.sort((a, b) => a.x - b.x);

                let lineText = '';
                let prev = null;
                for (const it of line) {
                    if (prev) {
                        const gap = it.x - (prev.x + (prev.width || 0));
                        // Average glyph width on this line (rough heuristic)
                        const avgChar = (prev.width || 5) / Math.max(1, prev.str.length);
                        // Insert extra spaces when the gap looks like a column separator.
                        if (gap > avgChar * 2.5) {
                            // Big gap → multiple spaces (table column)
                            const spaces = Math.min(8, Math.max(2, Math.round(gap / Math.max(2, avgChar))));
                            lineText += ' '.repeat(spaces);
                        } else if (gap > avgChar * 0.4 && !/\s$/.test(lineText) && !/^\s/.test(it.str)) {
                            lineText += ' ';
                        }
                    }
                    lineText += it.str;
                    prev = it;
                }
                fullText += lineText.replace(/\s+$/g, '') + '\n';
            }
            fullText += '\n'; // page separator
        }

        if (fullText.length < 50) {
            toast.warning("Peu de texte détecté. C'est peut-être un PDF scanné (image) ?");
        }

        return fullText;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        toast.error(`Erreur lecture PDF: ${error.message}`);
        throw error;
    }
};

export const extractTextFromDocx = async (file) => {
    try {
        toast.info("Lecture du fichier Word/GDocs en cours...");
        const arrayBuffer = await file.arrayBuffer();

        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const text = result.value;
        const messages = result.messages;

        if (messages.length > 0) {
            console.warn("Mammoth messages:", messages);
        }

        return text;
    } catch (error) {
        console.error('Error parsing Docx:', error);
        toast.error(`Erreur lecture fichier: ${error.message}`);
        throw error;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a number string written in either French ("1 234,56" / "1.234,56")
 * or English ("1,234.56" / "1234.56") notation. Returns NaN if not parseable.
 */
const parseFrNumber = (raw) => {
    if (raw == null) return NaN;
    let s = String(raw).trim().replace(/\u00A0/g, ' ').replace(/\s+/g, '');
    s = s.replace(/€|EUR|HT|TTC/gi, '');
    if (!s) return NaN;

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma && hasDot) {
        // Whichever appears last is the decimal separator.
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (hasComma) {
        // French decimal "1234,56" — but also handle "1,234" (English thousands).
        // If exactly one comma and the fractional part is 3 digits, treat as thousands.
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && !/^0/.test(parts[0])) {
            s = s.replace(',', '');
        } else {
            s = s.replace(',', '.');
        }
    }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
};

const UNIT_TOKENS = {
    'm²': 'm2', 'm2': 'm2', 'm³': 'm3', 'm3': 'm3',
    'ml': 'ml', 'mL': 'ml', 'm.l': 'ml', 'm/l': 'ml',
    'mètre': 'ml', 'metre': 'ml', 'mètres': 'ml', 'metres': 'ml', 'mlt': 'ml',
    'h': 'h', 'hr': 'h', 'heure': 'h', 'heures': 'h',
    'j': 'forfait', 'jour': 'forfait', 'jours': 'forfait',
    'u': 'u', 'pce': 'u', 'pces': 'u', 'pc': 'u', 'pcs': 'u',
    'unité': 'u', 'unite': 'u', 'unites': 'u', 'unités': 'u',
    'forfait': 'forfait', 'ft': 'forfait', 'fft': 'forfait', 'ens': 'forfait', 'lot': 'forfait',
    'kg': 'u', 'l': 'u', 'g': 'u',
    'sac': 'u', 'sacs': 'u', 'rouleau': 'u', 'rouleaux': 'u',
    'boite': 'u', 'boîte': 'u', 'jeu': 'u', 'paire': 'u', 'paires': 'u', 'ral': 'u',
};

const detectUnit = (token) => {
    if (!token) return null;
    const t = token.toLowerCase().replace(/\./g, '');
    return UNIT_TOKENS[t] || UNIT_TOKENS[token] || null;
};

// Material/supply detection — broader than the original list.
const MATERIAL_RE = /\b(fourniture|matériel|materiel|matériaux|materiaux|pi[èe]ce|c[âa]ble|tuyau|tube|joint|robinet|interrupteur|prise|vis|cheville|colle|dalle|carrelage|peinture|vernis|enduit|robinetterie|vanne|luminaire|ampoule|gaine|conduit|goulottes?|plaque|consommable|isolant|laine|placo|pl[âa]tre|ciment|mortier|béton|beton|sable|gravier|bois|planche|panneau|porte|fen[êe]tre|vitrage|carreau|fa[ïi]ence|parquet|stratifi[ée]|moquette|lambris|bardage|gouttière|tuile|ardoise|chevron|li[èe]ge|silicone|mastic|primaire|sous-couche|membrane|étanchéité|etancheite|disjoncteur|tableau électrique|tableau electrique|différentiel|differentiel|chauffe-eau|radiateur|chaudi[èe]re|pompe|filtre|cartouche|ballon|réservoir|reservoir|wc|lavabo|évier|evier|mitigeur|douche|baignoire|receveur|carrelet|cornière|corniere|plinthe)\b/i;

const SECTION_RE = /^(prestations?|fournitures?|main[\s-]?d['’]?œuvre|main[\s-]?d['’]?oeuvre|travaux|installation|d[ée]molition|finitions?|peinture|plomberie|[ée]lectricit[ée]|maçonnerie|maconnerie|menuiserie|chauffage|climatisation|carrelage|isolation|toiture|sanitaires?|cuisine|salle de bain|chambre|salon|étage \d|rez[\s-]?de[\s-]?chauss[ée]e|sous[\s-]?sol|garage|ext[ée]rieur|jardin|abord|terrassement|gros[\s-]?œuvre|gros[\s-]?oeuvre|second[\s-]?œuvre|second[\s-]?oeuvre|lot \d+|tranche \d+)[\s:.-]*$/i;

const SKIP_LINE_RE = /^(page\s+\d|devis\s*n°|devis\s*num|facture\s*n°|date\s*[:.]|client\s*[:.]|adresse\s*[:.]|t[ée]l[\s.:.]|email|e-?mail|siret|siren|naf|ape|tva\s*intracom|r\.?c\.?s|conditions?\s+de|valable|acompte|règlement|reglement|paiement|signature|bon pour accord|cachet|merci|cordialement|fait à|date d['’]émission|date d['’]emission|d[ée]lai|garantie|montant\s+ttc|montant\s+ht|net\s+à\s+payer|sous[\s-]?total|total\s+(ht|ttc|tva)|tva\s*\(|tva\s+\d|reste à payer)/i;

// Phone numbers (FR formats: "06 12 34 56 78", "+33 6 12...", with . or -).
const PHONE_RE = /(?:\+33|0)\s?[1-9](?:[\s.\-]?\d{2}){4}/;
// Email addresses.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Administrative / contact / payment-schedule / totals lines that are NEVER
// quote items. Anchored at line start, with word boundaries so we don't catch
// real products that merely start with the same letters (e.g. "Conditionnement"
// must NOT match "conditions"). Applied both during parsing and as a final
// safety net on the produced items.
const ADMIN_RE = /^(?:t[ée]l(?:[ée]phone)?\b|portable\b|mobile\b|fax\b|e-?mail\b|courriel\b|site\s*web|www\.|adresse\b|code\s+postal\b|n°?\s*(?:siret|siren|rcs|tva|ape|naf)\b|siret\b|siren\b|rcs\b|ape\b|naf\b|rib\b|iban\b|bic\b|tva\s*intra(?:com)?\b|capital\s+social|acompte\b|arrhes\b|solde\b|[ée]ch[ée]anc|versement\b|reste\s+[àa]\s+payer|net\s+[àa]\s+payer|sous[\s-]?total|total\b|montant\s+(?:ht|ttc|tva)|tva\b|valable\b|garantie\b|d[ée]lai\b|conditions?\b|r[èe]glement\b|paiement\b|mode\s+de\s+r[èe]glement|bon\s+pour\s+accord|signature\b|cachet\b|fait\s+[àa]\b)/i;

// Postal addresses without a label: a street line ("12 rue …", "ZA de …", "BP 12")
// or a whole line that is just "<code postal> Ville". These sit in the header /
// footer identity block and are never quote items.
const ADDRESS_RE = /^(?:\d{1,4}\s*(?:bis|ter|quater)?[\s,]+(?:rue|r\.|avenue|av\.?|bd|boulevard|impasse|imp\.?|all[ée]es?|chemin|ch\.?|route|rte|place|pl\.?|quai|cours|sentier|voie|lotissement|lot\.?|r[ée]sidence|r[ée]s\.?|zone\b|z\.?\s?a\.?\s?c?\.?|z\.?\s?i\.?|square|passage|mont[ée]e|rampe|faubourg|fbg)\b|b\.?p\.?\s*\d+|\d{5}\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\s.\-]{1,30}$)/i;

// A line that is essentially just a company identifier (SIRET 14, SIREN 9,
// intra-EU VAT "FR.. 999999999"), with or without a leading label.
const ID_LINE_RE = /^(?:n°\s*)?(?:siret|siren|rcs|tva(?:\s*intra(?:com)?)?)?\s*:?\s*(?:fr\s*[0-9a-z]{2}\s*)?(?:\d[\s.]?){9,14}$/i;

// True for any line that is administrative rather than a quote item.
const isAdminLine = (line) =>
    ADMIN_RE.test(line) || PHONE_RE.test(line) || EMAIL_RE.test(line) ||
    ADDRESS_RE.test(line) || ID_LINE_RE.test(line);

// ─────────────────────────────────────────────────────────────────────────────
// Quote metadata extraction (title + client name)
// ─────────────────────────────────────────────────────────────────────────────

export const extractQuoteMetadata = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let title = '';
    let clientName = '';
    let date = '';

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        // Title: "Objet :", "Projet :", "Travaux :", "Description du projet :"
        const titleMatch = l.match(/^(?:objet|projet|travaux|description(?:\s+du\s+projet)?|chantier|intitulé|intitule)\s*[:.\-–]\s*(.+)$/i);
        if (titleMatch && titleMatch[1].length > 3 && !title) {
            title = titleMatch[1].trim().replace(/[.;,:]+$/, '');
        }

        // Client: "Client :", "À l'attention de", "Destinataire :"
        const clientMatch = l.match(/^(?:client|à\s*l['’]?\s*attention\s+de|a\s*l['’]?\s*attention\s+de|destinataire|adressé\s+à|adresse\s+à)\s*[:.\-–]\s*(.+)$/i);
        if (clientMatch && clientMatch[1].length > 2 && !clientName) {
            clientName = clientMatch[1].trim().replace(/[.;,:]+$/, '');
        }

        // Date: "Date : 12/03/2025" or "Le 12/03/2025"
        const dateMatch = l.match(/(?:date|le)\s*[:.\-–]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
        if (dateMatch && !date) {
            date = dateMatch[1];
        }
    }

    return { title, clientName, date };
};

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses extracted PDF/Docx text into structured quote items.
 *
 * Strategy:
 *  1. Walk lines. Detect table header → enter "table mode".
 *  2. In table mode, collect numbers from each line. The line shape we expect is:
 *       <description> [<qty> [<unit>]] <unit_price> [<total>]
 *     We accept whichever subset of fields is present and compute missing ones
 *     when consistent (qty × unit_price ≈ total).
 *  3. Multi-line descriptions are merged: a line with no numbers immediately
 *     before a numeric line is treated as a description prefix.
 *  4. Pure section headers ("Plomberie", "Étage 1") become type="section".
 *  5. Numbers like 5,5% TVA, € symbols, and totals are stripped/skipped.
 */
export const parseQuoteItems = (text) => {
    const items = [];
    const rawLines = text.split('\n');
    let notes = '';
    let inTable = false;
    let pendingDescription = '';

    const lines = rawLines.map(l => l.replace(/\u00A0/g, ' ').replace(/\s+$/g, ''));

    const pushItem = (data) => {
        const id = Date.now() + Math.random();
        items.push({ id, ...data });
    };

    for (let idx = 0; idx < lines.length; idx++) {
        const raw = lines[idx];
        const trimmed = raw.trim();
        if (!trimmed) {
            // blank line breaks pending multi-line descriptions
            pendingDescription = '';
            continue;
        }

        // Detect table header: lines with "description" + (quantité|prix unitaire|p.u.|qté)
        if (!inTable && /description|d[ée]signation/i.test(trimmed) &&
            /(quantit|qt[ée]|prix\s*u|p\.?\s*u\.?|montant)/i.test(trimmed)) {
            inTable = true;
            pendingDescription = '';
            continue;
        }

        // Administrative lines (contact, phone, email, payment schedule, totals)
        // are never quote items — drop them wherever they appear, including
        // inside the table, so they don't become bogus rows or get merged into
        // a real line's description. Totals also close the table.
        if (isAdminLine(trimmed)) {
            if (/^(?:sous[\s-]?total|total\b|montant\s+(?:ht|ttc|tva)|net\s+[àa]\s+payer)/i.test(trimmed)) {
                inTable = false;
            }
            pendingDescription = '';
            continue;
        }

        // ── TABLE MODE ───────────────────────────────────────────────────────
        if (inTable) {
            // End of table at totals
            if (/^\s*(total\s*h\.?\s*t\.?|total\s+général|total\s+ttc|sous[\s-]?total|net\s+à\s+payer|montant\s+ht|montant\s+ttc)(\s|$|:)/i.test(trimmed)) {
                inTable = false;
                pendingDescription = '';
                continue;
            }
            // Skip TVA / footer boilerplate inside the table
            if (/^(t\.?\s*v\.?\s*a|tva\s*\(|tva\s+\d|valable|acompte|r[èe]glement|paiement|signature|bon pour accord|page\s+\d|conditions?)/i.test(trimmed)) {
                continue;
            }
            // Skip pure number/currency lines (subtotals, page numbers)
            if (/^[\d\s.,€%*-]+$/.test(trimmed)) continue;
        }

        // Section headers (apply both in and out of table)
        if (SECTION_RE.test(trimmed) || (inTable && /^[A-ZÀ-Ý][A-ZÀ-Ý\s\d-]{2,}$/.test(trimmed) && !/\d{2,}/.test(trimmed))) {
            pushItem({
                description: trimmed.replace(/[:\-–]+\s*$/, '').trim(),
                quantity: 1,
                unit: 'u',
                price: 0,
                buying_price: 0,
                type: 'section',
            });
            pendingDescription = '';
            continue;
        }

        // Try to match a structured item line.
        const parsed = parseItemLine(trimmed);
        if (parsed) {
            // Prepend any pending multi-line description
            const fullDesc = pendingDescription
                ? (pendingDescription + ' ' + parsed.description).trim()
                : parsed.description;
            pendingDescription = '';

            if (fullDesc.length > 1 && Number.isFinite(parsed.price)) {
                pushItem({
                    description: fullDesc,
                    quantity: parsed.quantity,
                    unit: parsed.unit,
                    price: parsed.price,
                    buying_price: 0,
                    type: classifyType(fullDesc),
                });
                continue;
            }
        }

        // Outside table mode: skip headers/footers entirely.
        if (!inTable && SKIP_LINE_RE.test(trimmed)) {
            pendingDescription = '';
            continue;
        }

        // Line with no numbers but readable text → could be a section or a
        // multi-line description prefix. Buffer it for the next line.
        if (!/\d/.test(trimmed) && trimmed.length > 2 && trimmed.length < 200) {
            // If we're in the table, treat this as a description-only row.
            if (inTable) {
                // It might be a sub-section or a multi-line description.
                pendingDescription = pendingDescription
                    ? (pendingDescription + ' ' + trimmed).trim()
                    : trimmed;
            } else {
                // Outside table, send to notes.
                notes += trimmed + '\n';
            }
            continue;
        }

        // Has digits but didn't match item pattern → notes (rare).
        if (!inTable && trimmed.length > 2) {
            notes += trimmed + '\n';
        }
    }

    // Post-process: drop items that are clearly bogus (no description after
    // merging) or that are administrative lines the table-mode logic let slip
    // through (e.g. a phone number or "Acompte" merged onto a numeric row).
    const cleanedItems = items.filter(it => {
        if (!it.description) return false;
        if (it.description.replace(/[\s\d.,€-]/g, '').length < 2) return false;
        if (isAdminLine(it.description)) return false;
        return true;
    });

    return { items: cleanedItems, notes: notes.trim() };
};

// Classify an item as section / material / service.
const classifyType = (description) => {
    if (MATERIAL_RE.test(description)) return 'material';
    return 'service';
};

/**
 * Parses a single text line that should look like:
 *   "<desc...> <qty> [<unit>] <unit_price> [<total>]"
 * and returns { description, quantity, unit, price } or null.
 *
 * Handles French numbers, optional € symbol, optional unit token.
 */
const DISCOUNT_RE = /\b(remise|rabais|r[ée]duction|escompte|geste\s+commercial|avoir)\b/i;

const parseItemLine = (line) => {
    if (!line || line.length < 4) return null;

    // Strip ALL TVA percentages like "20%" or "5,5 %" anywhere on the line.
    // A mid-line VAT column (e.g. "qty PU 20% total") would otherwise break the
    // right-to-left number walk on the "%" token and leave qty/PU stuck in the
    // description.
    const cleaned = line
        .replace(/\d{1,3}([.,]\d{1,2})?\s*%/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Tokenize on whitespace
    const tokens = cleaned.split(/\s+/);
    if (tokens.length < 2) return null;

    // Find runs of numbers from the right — the right side typically holds
    // qty / unit / unit_price / total. Walk from the end gathering numeric
    // tokens (numbers may include €, comma decimal, thousand separators).
    const numberToken = (t) => {
        const stripped = t.replace(/€|EUR|HT|TTC/gi, '');
        // Must contain at least one digit and be entirely numeric-like
        if (!/\d/.test(stripped)) return null;
        if (!/^-?[\d\s.,'’]+$/.test(stripped.replace(/\u00A0/g, ' '))) return null;
        const n = parseFrNumber(stripped);
        return isNaN(n) ? null : n;
    };

    // Walk from the end collecting tokens that are either numbers or unit tokens.
    const trail = []; // entries: { kind: 'num'|'unit', value, raw }
    let cut = tokens.length;
    for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        // Standalone currency / HT-TTC markers ("€", "EUR", "HT", "TTC") often
        // sit between the figures as separate tokens — skip them without
        // breaking the walk, otherwise a trailing "750,00 €" stops parsing dead.
        if (/^(€|eur|euros?|ht|ttc)$/i.test(t)) {
            cut = i;
            continue;
        }
        const n = numberToken(t);
        if (n !== null && !isNaN(n)) {
            trail.unshift({ kind: 'num', value: n, raw: t });
            cut = i;
            continue;
        }
        const u = detectUnit(t);
        if (u) {
            trail.unshift({ kind: 'unit', value: u, raw: t });
            cut = i;
            continue;
        }
        // Combined "qty unit" tokens like "5m²" or "12,5ml"
        const combined = t.match(/^(\d+(?:[.,]\d+)?)([a-zA-Zµ²³éèêà]+)$/);
        if (combined) {
            const cn = parseFrNumber(combined[1]);
            const cu = detectUnit(combined[2]);
            if (!isNaN(cn) && cu) {
                trail.unshift({ kind: 'num', value: cn, raw: combined[1] });
                trail.unshift({ kind: 'unit', value: cu, raw: combined[2] });
                cut = i;
                continue;
            }
        }
        break; // stop at first non-numeric / non-unit token
    }

    if (trail.length === 0) return null;

    const numbers = trail.filter(t => t.kind === 'num').map(t => t.value);
    const unit = trail.find(t => t.kind === 'unit')?.value || null;
    const description = tokens.slice(0, cut).join(' ').trim();
    if (description.length < 2) return null;

    let quantity = 1;
    let price = 0;

    if (numbers.length === 1) {
        // Only one number → assume it's the unit price (qty defaults to 1)
        price = numbers[0];
    } else if (numbers.length === 2) {
        // Common: qty + unit_price OR unit_price + total
        const [a, b] = numbers;
        if (unit && a > 0) {
            // A detected unit (m², ml, h…) sits right after the quantity in
            // virtually every quote layout, so the first number is the qty and
            // the second the unit price — even when the unit price is smaller.
            quantity = a;
            price = b;
        } else if (a > 0 && b > 0 && (b / a) > 1.2 && a < 1000) {
            // a is small, b much bigger → a = qty, b = price
            quantity = a;
            price = b;
        } else if (a > b && a > 0) {
            // a looks like a total, b like unit price → can't recover qty reliably
            price = b;
        } else {
            quantity = a || 1;
            price = b;
        }
    } else if (numbers.length >= 3) {
        // Layout is typically: qty, [unit price], …, line total (rightmost).
        // The printed line total is the most reliable anchor, so treat the LAST
        // number as the total and the FIRST as the quantity, then pick the unit
        // price among the middle numbers that reproduces the total (≤5% error).
        // If none fits, derive it (total / qty) so the imported line always
        // matches the amount shown on the source document.
        const qty = numbers[0];
        const total = numbers[numbers.length - 1];
        const middle = numbers.slice(1, -1);
        if (qty > 0 && total > 0) {
            let chosen = null;
            for (const pu of middle) {
                if (pu > 0 && Math.abs(qty * pu - total) / total < 0.05) {
                    chosen = pu;
                    break;
                }
            }
            quantity = qty;
            price = chosen !== null ? chosen : total / qty;
        } else {
            quantity = numbers[0] || 1;
            price = numbers[1];
        }
    }

    // Discount/credit lines ("Remise", "Rabais", "Avoir"…) are always negative,
    // whatever sign the source printed; everything else uses the magnitude.
    if (DISCOUNT_RE.test(description)) {
        price = -Math.abs(price);
    } else if (price < 0) {
        price = Math.abs(price);
    }

    if (price === 0 || isNaN(price)) return null;
    if (quantity <= 0 || isNaN(quantity)) quantity = 1;

    return {
        description,
        quantity,
        unit: unit || 'u',
        price,
    };
};
