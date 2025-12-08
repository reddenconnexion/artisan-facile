import * as pdfjsLib from 'pdfjs-dist';
import { toast } from 'sonner';

// Configure worker to use the local file in public folder
// This avoids all bundler/CDN issues by serving it as a static asset from the same origin.
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

    // Regex to detect a line with a price at the end
    // Matches: Description potentially with digits ... Price (with optional currency)
    // We look for the last number in the line.

    // Example: "Peinture murale 25.00 €" -> Desc: Peinture murale, Price: 25.00
    // Example: "Peinture 10m2 x 50€ = 500€" -> matches 500. This is tricky.

    // Simpler approach:
    // If a line ends with a number (and optional currency), treat the rest as description.

    const moneyRegex = /([\d\s.,]+)(?:€|EUR|euros?)$/i;
    // Or just a number at the end
    const numberEndRegex = /([\d.,]+)\s*$/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip obvious headers/footers and totals already calculated
        if (/page \d/i.test(trimmed)) continue;

        // Exclude redundant info (totals, headers) from notes
        if (/total|tva|montant|facture|devis|net à payer|bon pour accord|signature|siret|intracom|r\.c\.s/i.test(trimmed)) {
            continue;
        }

        let match = trimmed.match(moneyRegex) || trimmed.match(numberEndRegex);

        if (match) {
            // Found a price-like ending
            const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
            const price = parseFloat(priceStr);

            if (!isNaN(price) && price > 0) {
                // Determine description
                const description = trimmed.substring(0, match.index).trim();

                if (description.length > 3) {
                    items.push({
                        id: Date.now() + Math.random(),
                        description: description,
                        quantity: 1, // Default to 1
                        price: price,
                        type: 'service' // Default
                    });
                    continue;
                }
            }
        }

        // If no Item detected, add to notes
        notes += trimmed + '\n';
    }

    return { items, notes };
};
