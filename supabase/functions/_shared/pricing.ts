// Tarifs de l'abonnement Pro, en centimes d'euro.
// Miroir côté appli : src/utils/founderOffer.js (un test vérifie qu'ils
// restent identiques).
//
// Offre « Membre fondateur » : tarif bloqué à vie pour les FOUNDER_SPOTS
// premiers abonnés (compteur : RPC founder_spots_left). Le prix d'un
// abonnement Stripe ne change pas tant qu'il n'est pas résilié.

export const FOUNDER_SPOTS = 50;
export const TRIAL_DAYS = 30;

export const PRO_PRICES = {
  standard: { month: 1499, year: 14990 },
  founder: { month: 990, year: 9900 },
} as const;

export type BillingInterval = 'month' | 'year';

export function proPriceCents(founder: boolean, interval: BillingInterval): number {
  return PRO_PRICES[founder ? 'founder' : 'standard'][interval];
}
