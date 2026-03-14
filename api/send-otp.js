export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { toEmail, otpCode, clientName, companyName } = req.body;
        const apiKey = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;

        // Log to console for local debugging if API key is missing
        if (!apiKey) {
            console.log(`[DEV MODE] Simulated email to ${toEmail}. OTP is: ${otpCode}`);
            return res.status(200).json({ success: true, simulated: true, otp: otpCode, message: "Missing API Key, simulating email." });
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Artisan Facile <onboarding@resend.dev>',
                to: [toEmail],
                subject: `Code de vérification - ${companyName || 'Signature'}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #1f2937;">Bonjour ${clientName || ''},</h2>
                        <p style="color: #4b5563; line-height: 1.5;">Voici votre code de vérification sécurisé pour signer le devis en ligne :</p>
                        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                            <h1 style="letter-spacing: 10px; color: #2563EB; margin: 0; font-size: 32px;">${otpCode}</h1>
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé ce code, veuillez l'ignorer.</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
                        <p style="color: #9ca3af; font-size: 12px; text-align: center;">${companyName || 'Artisan Facile'}</p>
                    </div>
                `
            })
        });

        const data = await response.json().catch(() => ({}));
        
        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || "Failed to send email" });
        }
        
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
