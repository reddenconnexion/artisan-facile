// Demande d'avis Google au moment où l'artisan termine le chantier et quitte
// les lieux (pilote automatique, plan Pro). Le serveur vérifie tout le reste
// (Pro, pilote et avis activés, lien d'avis, client joignable, une seule
// demande par client, chantier bien terminé en base).
import { toast } from 'sonner';
import { supabase } from './supabase';
import { getRunningClock } from './timeTracking';

/** Pointage ouvert sur ce chantier ? La demande attend alors « Je repars ». */
export const clockRunningOn = (quoteId, clock = getRunningClock()) =>
    clock?.quoteId != null && quoteId != null && String(clock.quoteId) === String(quoteId);

/**
 * @returns {Promise<{ status: 'sent'|'deferred'|'skipped'|'failed', to?: string, reason?: string }>}
 */
export const requestReviewAtWorkEnd = async (quoteId) => {
    if (clockRunningOn(quoteId)) return { status: 'deferred' };
    try {
        const { data, error } = await supabase.functions.invoke('autopilot-run', {
            body: { action: 'review_now', quote_id: quoteId },
        });
        if (error || !data) return { status: 'failed' };
        return data;
    } catch {
        // Pas de réseau sur le chantier : l'envoi horaire rattrapera la demande.
        return { status: 'failed' };
    }
};

/** Dit à l'artisan ce qui s'est passé, seulement quand c'est utile. */
export const announceReviewResult = (result) => {
    if (result?.status === 'sent') {
        toast.success(`⭐ Demande d'avis Google envoyée à ${result.to}`);
    } else if (result?.status === 'deferred') {
        toast.info("La demande d'avis Google partira quand vous direz « Je repars ».");
    } else if (result?.status === 'skipped' && result.reason === 'no_review_link') {
        toast.info("Ajoutez votre lien d'avis Google dans Réglages : l'appli le demandera à vos clients en fin de chantier.");
    }
};

/** Termine le chantier puis demande l'avis (bouton « Chantier terminé » du pointage). */
export const finishChantierAndAskReview = async (quoteId) => {
    const { error } = await supabase.from('quotes').update({ work_stage: 'completed' }).eq('id', quoteId);
    if (error) {
        toast.error('Chantier non mis à jour : ' + error.message);
        return;
    }
    toast.success('Chantier terminé');
    announceReviewResult(await requestReviewAtWorkEnd(quoteId));
};

// Délai laissé au bouton « Annuler » des déplacements de chantier (6 s) : si
// l'artisan annule, le chantier n'est plus terminé en base et le serveur ne
// demande rien.
const UNDO_DELAY_MS = 7000;

/** Chantier terminé par glisser-déposer : demande d'avis après le délai d'annulation. */
export const askReviewAfterUndoDelay = (quoteId) => {
    setTimeout(async () => {
        announceReviewResult(await requestReviewAtWorkEnd(quoteId));
    }, UNDO_DELAY_MS);
};
