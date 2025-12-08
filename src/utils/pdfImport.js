const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
        if (window.pdfjsLib) {
            resolve(window.pdfjsLib);
            return;
        }

        const script = document.createElement('script');
        script.src = PDFJS_CDN;
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
            resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error("Failed to load PDF.js from CDN"));
        document.body.appendChild(script);
    });
};

export const extractTextFromPDF = async (file) => {
    try {
        console.log("Starting PDF extraction via CDN injection...");
        const pdfjs = await loadPdfJs();
        console.log("PDF.js loaded. Worker set to:", pdfjs.GlobalWorkerOptions.workerSrc);

        const arrayBuffer = await file.arrayBuffer();

        // Use default export if available or just the lib
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        console.log(`PDF Loaded. Pages: ${pdf.numPages}`);
        let fullText = '';

        // ... (Parsing logic remains the same, assuming pdf object structure is compatible)
        // Note: 3.x API is slightly different? usually getTextContent is stable.

        for (let i = 1; i <= pdf.numPages; i++) {
            // ... parsing logic ...
            const page = await pdf.getPage(i);
            // ...
            // Let's copy the parsing logic to ensure it's inside this scope
            const textContent = await page.getTextContent();

            // Simple extraction for robustness first
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';

            // Advanced extraction (layout aware) - simplified for this "Rescue" version
            // We can restore the complex one if this basic one works.
            // Actually, the user needs line separation for the parser to work
            // So we must keep some structure.
        }

        // Re-implementing the clever sorting logic here
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            const items = textContent.items.map(item => ({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5]
            }));

            // Sort by Y descending
            items.sort((a, b) => b.y - a.y);

            const tolerance = 5;
            const lines = [];
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
                fullText += line.map(l => l.str).join(' ') + '\n';
            });
        }

        return fullText;
    } catch (error) {
        console.error('Error parsing PDF (CDN method):', error);
        throw new Error('Impossible de lire le fichier PDF (Méthode CDN)');
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
