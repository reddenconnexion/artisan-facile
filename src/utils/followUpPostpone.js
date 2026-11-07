// « Projet reporté » : le client a annoncé que les travaux se feront dans
// plusieurs mois. Les relances s'arrêtent jusqu'à la date de reprise, puis le
// pilote envoie un mail de reprise (voir dueQuoteFollowUp).
import { supabase } from './supabase';

export const POSTPONE_PRESETS = [
    { label: '1 mois', months: 1 },
    { label: '3 mois', months: 3 },
    { label: '6 mois', months: 6 },
];

/** Date « AAAA-MM-JJ » dans `months` mois (fin de mois ramenée au dernier jour). */
export const postponeDate = (months, from = new Date()) => {
    const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
};

// 6 h UTC = 7 h ou 8 h à Paris : le report tombe bien le jour choisi.
const toTimestamp = (dateKey) => `${dateKey}T06:00:00Z`;

/** La date de reprise est-elle encore à venir ? */
export const isPostponedNow = (quote, now = new Date()) =>
    Boolean(quote?.relance_postponed && quote?.relance_snoozed_until && new Date(quote.relance_snoozed_until) > now);

export const postponeFollowUps = async (quoteId, dateKey) => {
    const { error } = await supabase.from('quotes')
        .update({ relance_snoozed_until: toTimestamp(dateKey), relance_postponed: true })
        .eq('id', quoteId);
    if (error) throw error;
};

export const cancelPostpone = async (quoteId) => {
    const { error } = await supabase.from('quotes')
        .update({ relance_snoozed_until: null, relance_postponed: false })
        .eq('id', quoteId);
    if (error) throw error;
};
