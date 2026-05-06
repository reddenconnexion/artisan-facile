// Edge Runtime — persistant entre les requêtes, pas de cold start par invocation
export const config = { runtime: 'edge' };

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-IP rate limiting: 5 requêtes max / IP / minute (in-memory, per Edge instance)
const ipRateLimit = new Map();
const IP_WINDOW_MS = 60_000;
const IP_MAX_REQ = 5;

// Per-email rate limiting: avoid flooding a recipient's inbox even if the
// attacker rotates IPs. 3 OTPs / email / 15 minutes.
const emailRateLimit = new Map();
const EMAIL_WINDOW_MS = 15 * 60_000;
const EMAIL_MAX_REQ = 3;

function consumeBucket(map, key, windowMs, maxReq) {
    const now = Date.now();
    const entry = map.get(key) ?? { count: 0, reset: now + windowMs };

    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + windowMs;
    }

    entry.count++;
    map.set(key, entry);

    if (map.size > 10_000) {
        for (const [k, v] of map) {
            if (now > v.reset) map.delete(k);
        }
    }

    return {
        allowed: entry.count <= maxReq,
        remaining: Math.max(0, maxReq - entry.count),
        reset: Math.ceil(entry.reset / 1000),
    };
}

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Récupération de l'IP (Vercel fournit x-forwarded-for, Cloudflare cf-connecting-ip)
    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-real-ip') ||
        null;

    if (!ip) {
        // No identifiable client IP means rate-limiting cannot be applied.
        // Reject rather than lump every anonymous request into a shared bucket.
        return new Response(
            JSON.stringify({ error: 'Requête invalide.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const ipBucket = consumeBucket(ipRateLimit, ip, IP_WINDOW_MS, IP_MAX_REQ);

    const rateLimitHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit':     String(IP_MAX_REQ),
        'X-RateLimit-Remaining': String(ipBucket.remaining),
        'X-RateLimit-Reset':     String(ipBucket.reset),
    };

    if (!ipBucket.allowed) {
        return new Response(
            JSON.stringify({ error: 'Trop de tentatives. Réessayez dans une minute.' }),
            { status: 429, headers: { ...rateLimitHeaders, 'Retry-After': '60' } }
        );
    }

    try {
        const { toEmail, otpCode, clientName, companyName } = await req.json();

        if (!toEmail || typeof toEmail !== 'string' || !EMAIL_RE.test(toEmail)) {
            return new Response(
                JSON.stringify({ error: 'Adresse email invalide.' }),
                { status: 400, headers: rateLimitHeaders }
            );
        }
        if (!otpCode || typeof otpCode !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Code OTP manquant.' }),
                { status: 400, headers: rateLimitHeaders }
            );
        }

        // Per-recipient throttle: protects the target's inbox even if the
        // attacker rotates IPs to evade ipBucket.
        const emailKey = toEmail.toLowerCase();
        const emailBucket = consumeBucket(emailRateLimit, emailKey, EMAIL_WINDOW_MS, EMAIL_MAX_REQ);
        if (!emailBucket.allowed) {
            return new Response(
                JSON.stringify({ error: 'Trop de codes envoyés à cette adresse. Réessayez dans 15 minutes.' }),
                { status: 429, headers: { ...rateLimitHeaders, 'Retry-After': '900' } }
            );
        }

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
                        <h2 style="color: #1f2937;">Bonjour ${escapeHtml(clientName)},</h2>
                        <p style="color: #4b5563; line-height: 1.5;">Voici votre code de vérification sécurisé pour signer le devis en ligne :</p>
                        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                            <h1 style="letter-spacing: 10px; color: #2563EB; margin: 0; font-size: 32px;">${escapeHtml(otpCode)}</h1>
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé ce code, veuillez l'ignorer.</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
                        <p style="color: #9ca3af; font-size: 12px; text-align: center;">${escapeHtml(company)}</p>
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

    } catch (err) {
        console.error('[send-otp] Unhandled error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
