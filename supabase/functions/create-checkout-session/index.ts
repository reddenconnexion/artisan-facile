import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';
import { corsPreflight, json, requireUser } from '../_shared/http.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const isTestMode = stripeKey.startsWith('sk_test_');

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Field names differ between test and live mode for accounting isolation
const customerIdField = isTestMode ? 'stripe_test_customer_id' : 'stripe_customer_id';
const subscriptionIdField = isTestMode ? 'stripe_test_subscription_id' : 'stripe_subscription_id';
const subscriptionStatusField = isTestMode ? 'stripe_test_subscription_status' : 'stripe_subscription_status';

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
      .select(`${customerIdField}, plan, full_name, company_name`)
      .eq('id', user.id)
      .single();

    if (profile?.plan === 'pro' || profile?.plan === 'owner') {
      return json({ error: 'Vous avez déjà un plan Pro actif.' }, 400);
    }

    const { origin } = await req.json().catch(() => ({ origin: 'https://app.artisan-facile.fr' }));
    const appUrl = origin || Deno.env.get('APP_URL') || 'https://app.artisan-facile.fr';

    // Get or create Stripe customer (isolated per mode)
    let customerId = profile?.[customerIdField];
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.company_name || profile?.full_name || user.email,
        metadata: { supabase_user_id: user.id, stripe_mode: isTestMode ? 'test' : 'live' },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('profiles')
        .update({ [customerIdField]: customerId })
        .eq('id', user.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Artisan Facile Pro',
              description: 'Mémos vocaux illimités, IA illimitée, pipeline automatique',
            },
            unit_amount: 1499, // 14.99 € in cents
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/app/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app/subscription?cancelled=true`,
      locale: 'fr',
      metadata: { supabase_user_id: user.id, stripe_mode: isTestMode ? 'test' : 'live' },
    });

    console.log(`Checkout session created (${isTestMode ? 'TEST' : 'LIVE'} mode) for user ${user.id}`);

    return json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return json({ error: err.message }, 500);
  }
});
