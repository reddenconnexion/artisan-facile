-- ──────────────────────────────────────────────────────────────────────────────
-- Champs d'abonnement de `profiles` : en lecture seule pour l'artisan.
--
-- La policy « Users can update own profile » autorise l'artisan à modifier sa
-- ligne entière : avec la clé anon et son JWT, il pouvait se passer lui-même
-- en plan 'pro' (ou 'owner'), ou réserver une place « Membre fondateur », sans
-- passer par Stripe. Ces champs ne sont écrits que par le webhook Stripe et
-- create-checkout-session (service_role) ou par le propriétaire (SQL).
--
-- Pour les rôles de l'API (anon, authenticated) : à l'UPDATE, les valeurs
-- d'abonnement d'origine sont conservées (le reste de la ligne se met à jour
-- normalement, même si le client renvoie la ligne complète) ; à l'INSERT,
-- elles repartent des valeurs par défaut.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan := 'free';
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.stripe_subscription_status := NULL;
    NEW.stripe_test_customer_id := NULL;
    NEW.stripe_test_subscription_id := NULL;
    NEW.stripe_test_subscription_status := NULL;
    NEW.subscription_cancel_at := NULL;
    NEW.subscription_trial_end := NULL;
    NEW.founder_since := NULL;
  ELSE
    NEW.plan := OLD.plan;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.stripe_subscription_status := OLD.stripe_subscription_status;
    NEW.stripe_test_customer_id := OLD.stripe_test_customer_id;
    NEW.stripe_test_subscription_id := OLD.stripe_test_subscription_id;
    NEW.stripe_test_subscription_status := OLD.stripe_test_subscription_status;
    NEW.subscription_cancel_at := OLD.subscription_cancel_at;
    NEW.subscription_trial_end := OLD.subscription_trial_end;
    NEW.founder_since := OLD.founder_since;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_billing ON public.profiles;
CREATE TRIGGER protect_profile_billing
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing();
