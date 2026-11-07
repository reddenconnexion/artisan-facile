-- Date de fin d'un abonnement Pro résilié (Stripe `subscription.cancel_at`).
-- Renseignée par le webhook Stripe, remise à NULL si la résiliation est
-- annulée ou à la fin de l'abonnement. Commune aux modes test et réel, comme
-- `plan` : elle sert uniquement à l'affichage « Résilié — actif jusqu'au … ».
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMPTZ;
