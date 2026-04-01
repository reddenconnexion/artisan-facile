// Edge Runtime — persistant entre les requêtes, pas de cold start par invocation
export const config = { runtime: 'edge' };

// Rate limiting : 5 requêtes max / IP / minute (in-memory, par instance Edge)
const rateLimit = new Map();
const WINDOW_MS  = 60_000; // 1 minute
const MAX_REQ    = 5;

function checkRateLimit(ip) {
    const now  = Date.now();
    const entry = rateLimit.get(ip) ?? { count: 0, reset: now + WINDOW_MS };

    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + WINDOW_MS;
    }

    entry.count++;
    rateLimit.set(ip, entry);

    // Nettoyage périodique pour éviter les fuites mémoire
    if (rateLimit.size > 10_000) {
        for (const [key, val] of rateLimit) {
            if (now > val.reset) rateLimit.delete(key);
        }
    }

    return {
        allowed:   entry.count <= MAX_REQ,
        remaining: Math.max(0, MAX_REQ - entry.count),
        reset:     Math.ceil(entry.reset / 1000),
    };
}

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Récupération de l'IP (Vercel fournit x-forwarded-for)
    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('cf-connecting-ip') ||
        'unknown';

    const { allowed, remaining, reset } = checkRateLimit(ip);

    const rateLimitHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit':     String(MAX_REQ),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset':     String(reset),
    };

    if (!allowed) {
        return new Response(
            JSON.stringify({ error: 'Trop de tentatives. Réessayez dans une minute.' }),
            { status: 429, headers: { ...rateLimitHeaders, 'Retry-After': '60' } }
        );
    }

    try {
        const { toEmail, otpCode, clientName, companyName } = await req.json();
        const apiKey = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;

        if (!apiKey) {
            console.log(`[DEV MODE] Simulated email to ${toEmail}. OTP is: ${otpCode}`);
            return new Response(
                JSON.stringify({ success: true, simulated: true, message: 'Missing API Key, simulating email.' }),
                { status: 200, headers: rateLimitHeaders }
            );
        }

        const emailFrom = process.env.EMAIL_FROM ?? 'Artisan Facile <signature@artisanfacile.fr>';
        const company = companyName || 'Artisan Facile';
        const plainText = [
            `Bonjour ${clientName || ''},`,
            '',
            'Voici votre code de vérification pour signer le devis en ligne :',
            '',
            `    ${otpCode}`,
            '',
            'Si vous n\'avez pas demandé ce code, veuillez l\'ignorer.',
            '',
            `— ${company}`,
        ].join('\n');

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: [toEmail],
                subject: `Code de vérification - ${company}`,
                text: plainText,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #1f2937;">Bonjour ${clientName || ''},</h2>
                        <p style="color: #4b5563; line-height: 1.5;">Voici votre code de vérification sécurisé pour signer le devis en ligne :</p>
                        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                            <h1 style="letter-spacing: 10px; color: #2563EB; margin: 0; font-size: 32px;">${otpCode}</h1>
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé ce code, veuillez l'ignorer.</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
                        <p style="color: #9ca3af; font-size: 12px; text-align: center;">${company}</p>
                    </div>
                `,
            }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return new Response(
                JSON.stringify({ error: data.message || 'Failed to send email' }),
                { status: response.status, headers: rateLimitHeaders }
            );
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: rateLimitHeaders,
        });

    } catch {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
