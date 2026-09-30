import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';
import { corsPreflight, json, requireUser } from '../_shared/http.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const isTestMode = stripeKey.startsWith('sk_test_');

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Field name differs between test and live mode for accounting isolation
const customerIdField = isTestMode ? 'stripe_test_customer_id' : 'stripe_customer_id';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  try {
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const { user } = auth;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(customerIdField)
      .eq('id', user.id)
      .single();

    const customerId = profile?.[customerIdField];
    if (!customerId) {
      return json({ error: 'Aucun abonnement trouvé.' }, 404);
    }

    const { origin } = await req.json().catch(() => ({ origin: '' }));
    const appUrl = origin || Deno.env.get('APP_URL') || 'https://app.artisan-facile.fr';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app/subscription`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    return json({ error: err.message }, 500);
  }
});
