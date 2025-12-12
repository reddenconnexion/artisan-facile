import * as pdfjsLib from 'pdfjs-dist';
import { toast } from 'sonner';
import { validatePDF } from './validation';

// Configure worker to use the local file in public folder
// This avoids all bundler/CDN issues by serving it as a static asset from the same origin.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export const extractTextFromPDF = async (file) => {
    try {
        // SECURITY: Validate PDF file before processing
        const validation = await validatePDF(file);
        if (!validation.valid) {
            toast.error(validation.error);
            throw new Error(validation.error);
        }

        toast.info("Lecture du fichier PDF en cours...");

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
            // Optional: Limit pages if too many? No, let's try full.
            // toast.loading(`Analyse page ${i}/${pdf.numPages}...`);
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

export const parseQuoteItems = (text) => {
    const items = [];
    const lines = text.split('\n');
    let notes = '';

    // Regex strategies to detect items
    // Strategy 1: "Description ... Quantity ... Unit Price ... Total"
    // Capture: (Description) (Quantity) (Unit Price) (Total)
    // Looking for: Something, then a number, then a number (price), then end or another number (total)

    // Pattern: Description ending with space, then number (qty), "x" or space, number (price), optional "€"
    const complexItemRegex = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|unites?|u)?\s*([\d\s.,]+)(?:€|EUR)?\s*([\d\s.,]+)?(?:€|EUR)?$/i;

    // Strategy 2: "Description ... Price" (Quantity assumed 1)
    const simpleItemRegex = /^(.+?)\s+([\d\s.,]+)(?:€|EUR)?$/i;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip obvious headers/footers
        if (/page \d|devis n°|facture n°|date:|client :/i.test(trimmed)) continue;

        // Skip totals and legal jargon
        if (/total|tva|montant|net à payer|bon pour accord|signature|siret|intracom|r\.c\.s|conditions/i.test(trimmed)) {
            continue;
        }

        // Try complex strategy first (Qty + Price)
        let match = trimmed.match(complexItemRegex);
        if (match) {
            const description = match[1].trim();
            const qtyStr = match[2].replace(',', '.');
            const priceStr = match[3].replace(/\s/g, '').replace(',', '.');

            const quantity = parseFloat(qtyStr);
            const price = parseFloat(priceStr);

            if (!isNaN(quantity) && !isNaN(price)) {
                items.push({
                    id: Date.now() + Math.random(),
                    description: description,
                    quantity: quantity,
                    price: price, // Unit price
                    type: 'service'
                });
                continue;
            }
        }

        // Try simple strategy (Price only, assume qty 1)
        match = trimmed.match(simpleItemRegex);
        if (match) {
            // Check if "price" looks like a real price (contains digits)
            const priceStr = match[2].replace(/\s/g, '').replace(',', '.');
            const price = parseFloat(priceStr);

            if (!isNaN(price) && price > 0) {
                // Double check description isn't just a date or nonsense
                if (match[1].length > 2) {
                    items.push({
                        id: Date.now() + Math.random(),
                        description: match[1].trim(),
                        quantity: 1,
                        price: price,
                        type: 'service'
                    });
                    continue;
                }
            }
        }

        // If no Item regex matched, treat as Description/Note line
        // Avoid adding very short numbers or symbols
        if (trimmed.length > 2 && !/^[\d.,€]+$/.test(trimmed)) {
            notes += trimmed + '\n';
        }
    }

    // Post-processing: If we found no items, maybe the parser was too strict?
    // Start simpler fallback: just looking for lines ending in numbers.
    if (items.length === 0 && lines.length > 0) {
        // Fallback logic could go here if needed
    }

    return { items, notes };
};
