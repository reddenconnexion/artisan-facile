import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { toast } from 'sonner';

// Configure worker to use the local file in public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export const extractTextFromPDF = async (file) => {
    try {
        toast.info("Lecture du fichier PDF en cours...");
        console.log("Initializing PDF read with worker at /pdf.worker.min.mjs");

        const arrayBuffer = await file.arrayBuffer();

        // Load document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        loadingTask.onProgress = (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            console.log(`PDF Load Progress: ${percent}%`);
        };

        const pdf = await loadingTask.promise;
        console.log(`PDF Loaded. Pages: ${pdf.numPages}`);
        toast.info(`PDF chargé: ${pdf.numPages} pages détectées`);

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Simple robust extraction matching the previous logic
            const items = textContent.items.map(item => ({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5]
            }));

            // Sort by Y descending (top to bottom)
            items.sort((a, b) => b.y - a.y);

            const tolerance = 5;
            const lines = [];
            let currentLine = [];
            let currentY = items[0]?.y;

            for (const item of items) {
                if (currentLine.length === 0) {
                    currentLine.push(item);
                    currentY = item.y; // Initialize currentY for the first item
                } else if (Math.abs(item.y - currentY) < tolerance) {
                    currentLine.push(item);
                } else {
                    lines.push(currentLine);
                    currentLine = [item];
                    currentY = item.y;
                }
            }
            if (currentLine.length > 0) lines.push(currentLine);

            lines.forEach(line => {
                // Sort by X (left to right)
                line.sort((a, b) => a.x - b.x);
                fullText += line.map(l => l.str).join(' ') + '\n';
            });
        }

        console.log("Text extraction complete. Length:", fullText.length);
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

        console.log("Docx text length:", text.length);
        return text;
    } catch (error) {
        console.error('Error parsing Docx:', error);
        toast.error(`Erreur lecture fichier: ${error.message}`);
        throw error;
    }
};

// Detects whether a description corresponds to a material/supply item
const isMaterialKeyword = (desc) => {
    const d = desc.toLowerCase();
    return /fourniture|matériel|materiel|pièce|piece|câble|cable|tuyau|tube|joint|robinet|interrupteur|prise|vis|cheville|colle|dalle|carrelage|peinture|vernis|enduit|robinetterie|vanne|luminaire|ampoule|gaine|conduit|goulottes?|plaque|consommable/.test(d);
};

export const parseQuoteItems = (text) => {
    const items = [];
    const lines = text.split('\n');
    let notes = '';
    let inTable = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // ── Detect table header row (Description + Quantité/Prix columns) ──────
        if (!inTable && /description/i.test(trimmed) && /(quantit|prix\s*u|p\.u\.)/i.test(trimmed)) {
            inTable = true;
            continue;
        }

        // ── TABLE MODE ────────────────────────────────────────────────────────
        if (inTable) {
            // End of table at the totals section
            if (/^\s*total\s*h\.?t\.?(\s|$)/i.test(trimmed) || /^\s*sous[\s-]?total/i.test(trimmed)) {
                inTable = false;
                continue;
            }
            // Skip TVA / footer boilerplate
            if (/^(t\.?v\.?a|tva\s*\(|valable|acompte|règlement|paiement|signature|bon pour accord|page\s+\d)/i.test(trimmed)) continue;
            // Skip pure number/currency lines (subtotals)
            if (/^[\d\s.,€%*]+$/.test(trimmed)) continue;

            const numbers = trimmed.match(/\d+(?:[.,]\d+)?/g) || [];

            if (numbers.length >= 2) {
                // Try: description  qty  unit_price  [total]
                const m =
                    trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s*€?\s+([\d.,]+)\s*€?\s*$/) ||
                    trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s*€?\s*$/);

                if (m) {
                    const desc  = m[1].trim();
                    const qty   = parseFloat(m[2].replace(',', '.'));
                    const price = parseFloat(m[3].replace(',', '.'));
                    if (desc.length > 1 && qty > 0 && price > 0) {
                        items.push({
                            id: Date.now() + Math.random(),
                            description: desc,
                            quantity: qty,
                            price,
                            type: isMaterialKeyword(desc) ? 'material' : 'service',
                        });
                        continue;
                    }
                }
            }

            // No numbers (or unmatched) → treat as section header
            if (trimmed.length > 2 && !/^[\d.,€\s]+$/.test(trimmed)) {
                items.push({
                    id: Date.now() + Math.random(),
                    description: trimmed,
                    quantity: 1,
                    price: 0,
                    type: 'section',
                });
            }
            continue;
        }

        // ── FALLBACK MODE (no table header detected yet) ──────────────────────
        // Skip obvious headers/footers
        if (/page \d|devis n°|facture n°|date:|client :/i.test(trimmed)) continue;
        // Skip totals and legal jargon
        if (/total|tva|montant|net à payer|bon pour accord|signature|siret|intracom|r\.c\.s|conditions/i.test(trimmed)) continue;

        // Strategy 1: description + qty + unit price [+ total]
        const complexItemRegex = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|unites?|u)?\s*([\d\s.,]+)(?:€|EUR)?\s*([\d\s.,]+)?(?:€|EUR)?$/i;
        let match = trimmed.match(complexItemRegex);
        if (match) {
            const description = match[1].trim();
            const qty   = parseFloat(match[2].replace(',', '.'));
            const price = parseFloat(match[3].replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(qty) && !isNaN(price)) {
                items.push({
                    id: Date.now() + Math.random(),
                    description,
                    quantity: qty,
                    price,
                    type: isMaterialKeyword(description) ? 'material' : 'service',
                });
                continue;
            }
        }

        // Strategy 2: description + price (qty assumed = 1)
        const simpleItemRegex = /^(.+?)\s+([\d\s.,]+)(?:€|EUR)?$/i;
        match = trimmed.match(simpleItemRegex);
        if (match && match[1].length > 2) {
            const price = parseFloat(match[2].replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(price) && price > 0) {
                items.push({
                    id: Date.now() + Math.random(),
                    description: match[1].trim(),
                    quantity: 1,
                    price,
                    type: isMaterialKeyword(match[1]) ? 'material' : 'service',
                });
                continue;
            }
        }

        // Everything else → notes
        if (trimmed.length > 2 && !/^[\d.,€]+$/.test(trimmed)) {
            notes += trimmed + '\n';
        }
    }

    return { items, notes: notes.trim() };
};
