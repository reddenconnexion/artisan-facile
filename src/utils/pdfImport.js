import * as pdfjsLib from 'pdfjs-dist';

// Configure worker locally
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export const extractTextFromPDF = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Sort items by Y (descending) then X (ascending)
            // PDF coordinates: (0,0) is bottom-left usually. So higher Y is higher on page.
            const items = textContent.items.map(item => ({
                str: item.str,
                x: item.transform[4], // translation X
                y: item.transform[5], // translation Y
                w: item.width,
                h: item.height
            }));

            // Group by Y with tolerance (e.g. 5 units)
            const tolerance = 5;
            const lines = [];

            // Sort by Y descending first
            items.sort((a, b) => b.y - a.y);

            let currentLine = [];
            let currentY = items[0]?.y;

            for (const item of items) {
                if (currentLine.length === 0) {
                    currentLine.push(item);
                } else if (Math.abs(item.y - currentY) < tolerance) {
                    currentLine.push(item);
                } else {
                    // Start new line
                    lines.push(currentLine);
                    currentLine = [item];
                    currentY = item.y;
                }
            }
            if (currentLine.length > 0) lines.push(currentLine);

            // Sort content within lines by X
            lines.forEach(line => {
                line.sort((a, b) => a.x - b.x);
                const lineStr = line.map(l => l.str).join(' ');
                fullText += lineStr + '\n';
            });
        }

        return fullText;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error('Impossible de lire le fichier PDF');
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
