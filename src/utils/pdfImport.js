import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's asset import to get the URL of the worker file
// This ensures it works in both dev (localhost) and prod (bundled)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const extractTextFromPDF = async (file) => {
    try {
        console.log(`Attempting to read PDF with worker: ${WORKER_URL}`);
        const arrayBuffer = await file.arrayBuffer();

        // Use try-catch specifically for getDocument to catch worker errors
        let pdf;
        try {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            pdf = await loadingTask.promise;
        } catch (e) {
            console.error("PDF Worker Error:", e);
            throw new Error("Erreur de chargement du moteur PDF (Worker). Vérifiez votre connexion internet.");
        }

        console.log(`PDF Loaded. Pages: ${pdf.numPages}`);
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            console.log(`Parsing page ${i}/${pdf.numPages}`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Sort items by Y (descending) then X (ascending)
            const items = textContent.items.map(item => ({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                w: item.width,
                h: item.height
            }));

            // Group by Y with tolerance
            const tolerance = 5;
            const lines = [];

            items.sort((a, b) => b.y - a.y);

            let currentLine = [];
            let currentY = items[0]?.y;

            for (const item of items) {
                if (currentLine.length === 0) {
                    currentLine.push(item);
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
                line.sort((a, b) => a.x - b.x);
                // Join with spaces, but maybe double space if large gap? Keep simple for now.
                const lineStr = line.map(l => l.str).join(' ');
                fullText += lineStr + '\n';
            });
        }

        return fullText;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw error; // Re-throw to be caught by UI
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
