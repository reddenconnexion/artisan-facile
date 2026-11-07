import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';
import { corsPreflight, json, requireUser } from '../_shared/http.ts';
import { TRIAL_DAYS, proPriceCents, type BillingInterval } from '../_shared/pricing.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const isTestMode = stripeKey.startsWith('sk_test_');

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Field names differ between test and live mode for accounting isolation
const customerIdField = isTestMode ? 'stripe_test_customer_id' : 'stripe_customer_id';
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
      .select(`${customerIdField}, ${subscriptionStatusField}, plan, full_name, company_name, founder_since`)
      .eq('id', user.id)
      .single();

    if (profile?.plan === 'pro' || profile?.plan === 'owner') {
      return json({ error: 'Vous avez déjà un plan Pro actif.' }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const appUrl = body.origin || Deno.env.get('APP_URL') || 'https://app.artisan-facile.fr';
    const interval: BillingInterval = body.interval === 'year' ? 'year' : 'month';

    // Tarif fondateur : déjà fondateur (réabonnement), ou une place reste libre.
    const { data: spotsLeft } = await supabaseAdmin.rpc('founder_spots_left');
    const founder = Boolean(profile?.founder_since) || (spotsLeft ?? 0) > 0;
    const unitAmount = proPriceCents(founder, interval);

    // Essai gratuit : une seule fois, pour qui n'a jamais eu d'abonnement.
    const offerTrial = !profile?.[subscriptionStatusField];

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

    const metadata = {
      supabase_user_id: user.id,
      stripe_mode: isTestMode ? 'test' : 'live',
      founder: founder ? 'true' : 'false',
      interval,
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: founder ? 'Artisan Facile Pro — Membre fondateur' : 'Artisan Facile Pro',
              description: founder
                ? 'Tarif fondateur bloqué à vie · Mémos vocaux et IA illimités, pipeline automatique'
                : 'Mémos vocaux illimités, IA illimitée, pipeline automatique',
            },
            unit_amount: unitAmount,
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata,
        ...(offerTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      },
      success_url: `${appUrl}/app/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app/subscription?cancelled=true`,
      locale: 'fr',
      metadata,
    });

    console.log(`Checkout session created (${isTestMode ? 'TEST' : 'LIVE'} mode) for user ${user.id} founder=${founder} interval=${interval} trial=${offerTrial}`);

    return json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return json({ error: err.message }, 500);
  }
});
