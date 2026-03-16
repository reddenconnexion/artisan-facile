import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const isTestMode = stripeKey.startsWith('sk_test_');

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Field names differ between test and live mode for accounting isolation
const customerIdField = isTestMode ? 'stripe_test_customer_id' : 'stripe_customer_id';
const subscriptionIdField = isTestMode ? 'stripe_test_subscription_id' : 'stripe_subscription_id';
const subscriptionStatusField = isTestMode ? 'stripe_test_subscription_status' : 'stripe_subscription_status';

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return new Response('Missing signature or secret', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // Subscription successfully created or renewed
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        // Active or trialing = Pro plan
        const isActive = status === 'active' || status === 'trialing';
        const plan = isActive ? 'pro' : 'free';

        await supabaseAdmin
          .from('profiles')
          .update({
            plan,
            [subscriptionIdField]: subscription.id,
            [subscriptionStatusField]: status,
          })
          .eq(customerIdField, customerId);

        console.log(`[${isTestMode ? 'TEST' : 'LIVE'}] Subscription ${subscription.id} → plan=${plan} (status: ${status})`);
        break;
      }

      // Subscription cancelled or expired
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabaseAdmin
          .from('profiles')
          .update({
            plan: 'free',
            [subscriptionIdField]: null,
            [subscriptionStatusField]: 'cancelled',
          })
          .eq(customerIdField, customerId);

        console.log(`[${isTestMode ? 'TEST' : 'LIVE'}] Subscription ${subscription.id} deleted → plan=free`);
        break;
      }

      // Payment failed
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabaseAdmin
          .from('profiles')
          .update({ [subscriptionStatusField]: 'past_due' })
          .eq(customerIdField, customerId);

        console.log(`[${isTestMode ? 'TEST' : 'LIVE'}] Payment failed for customer ${customerId}`);
        break;
      }

      // Checkout completed (first subscription)
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;

        // Subscription will be handled by customer.subscription.created
        // but we update the customer_id link here as a safety net
        if (session.customer) {
          await supabaseAdmin
            .from('profiles')
            .update({ [customerIdField]: session.customer as string })
            .eq('id', userId);
        }

        console.log(`[${isTestMode ? 'TEST' : 'LIVE'}] Checkout completed for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }
});
