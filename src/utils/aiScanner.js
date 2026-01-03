/**
 * Utility to analyze images for inventory using AI (Gemini Flash if key provided, else Mock).
 */

export const analyzeStockImage = async (imageFile, apiKey = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Convert to Base64
            const base64Image = await toBase64(imageFile);

            if (apiKey) {
                // REAL AI MODE
                const result = await scanWithGemini(base64Image, apiKey);
                resolve(result);
            } else {
                // MOCK MODE (Demo)
                console.log("Simulating AI analysis...");
                setTimeout(() => {
                    resolve(getMockData());
                }, 2500); // 2.5s delay for effect
            }
        } catch (error) {
            console.error("AI Analysis failed:", error);
            reject(error);
        }
    });
};

const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // Remove header
    reader.onerror = error => reject(error);
});

const scanWithGemini = async (base64Image, key) => {
    const prompt = `
    Analyse this image of construction materials / stock. 
    Identify the items present. 
    Return a JSON array where each object has:
    - description: Short French description of the item (e.g., "Sac de Ciment 25kg", "Pôt Peinture Blanc").
    - quantity: Estimated count visible.
    - category: Suggested category (e.g., "Maçonnerie", "Peinture", "Plomberie").
    
    Output ONLY raw JSON. No markdown.
    `;

    const body = {
        contents: [{
            parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
            ]
        }]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("No response from AI");

    // Clean markdown if present
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
};

const getMockData = () => {
    // Generate some plausible "detected" items based on randomness
    const mocks = [
        { description: "Sac de Ciment 35kg", quantity: 3, category: "Maçonnerie" },
        { description: "Boite de Vis à Bois 4x50", quantity: 2, category: "Quincaillerie" },
        { description: "Tube Cuivre Ø14", quantity: 5, category: "Plomberie" },
        { description: "Ruban Adhésif Orange", quantity: 4, category: "Consommable" },
        { description: "Cartouche Silicone Blanc", quantity: 6, category: "Joints" }
    ];

    // Return random subset
    return mocks.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 2);
};
