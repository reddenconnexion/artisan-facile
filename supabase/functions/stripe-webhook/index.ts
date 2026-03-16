import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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
            stripe_subscription_id: subscription.id,
            stripe_subscription_status: status,
          })
          .eq('stripe_customer_id', customerId);

        console.log(`Subscription ${subscription.id} → plan=${plan} (status: ${status})`);
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
            stripe_subscription_id: null,
            stripe_subscription_status: 'cancelled',
          })
          .eq('stripe_customer_id', customerId);

        console.log(`Subscription ${subscription.id} deleted → plan=free`);
        break;
      }

      // Payment failed
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Downgrade to free if payment fails (grace period managed by Stripe)
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId);

        console.log(`Payment failed for customer ${customerId}`);
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
            .update({ stripe_customer_id: session.customer as string })
            .eq('id', userId);
        }

        console.log(`Checkout completed for user ${userId}`);
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
