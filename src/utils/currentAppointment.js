// Détection du rendez-vous « en cours » et du chantier qui va avec.
//
// Sur le terrain, l'artisan pointe ses heures en arrivant : le chantier à
// sélectionner est presque toujours celui du rendez-vous du moment. Ce module
// désigne ce rendez-vous à partir de l'agenda du jour, puis retrouve le devis
// correspondant (lien direct `events.quote_id`, sinon le chantier du client).
//
// Logique PURE : aucune requête, pour être testable et réutilisable.

/** On considère qu'on est « sur » un RDV dès une heure avant l'heure prévue. */
const DEFAULT_LEAD_MINUTES = 60;

/**
 * Heure de début d'un rendez-vous : `start_time` s'il est renseigné, sinon la
 * date du RDV à l'heure `time` (HH:MM). Renvoie null pour un RDV sans heure
 * (journée entière), qui ne peut pas être situé dans la journée.
 */
export const eventStart = (event) => {
    if (event?.start_time) {
        const parsed = new Date(event.start_time);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const time = String(event?.time || '').trim();
    const match = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!match) return null;

    const base = event?.date ? new Date(event.date) : null;
    const day = base && !Number.isNaN(base.getTime()) ? new Date(base) : new Date();
    day.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return day;
};

/** Le RDV mène-t-il à un chantier (devis lié ou client identifié) ? */
export const isWorksiteEvent = (event) =>
    !!event && (event.quote_id != null || event.client_id != null || !!event.client_name);

/**
 * Rendez-vous « du moment » parmi ceux du jour.
 *
 * Règle : le dernier RDV déjà commencé (ou qui commence dans l'heure) — c'est
 * celui sur lequel on est. Si la journée n'a pas encore démarré, on prend le
 * prochain ; s'il n'y a que des RDV sans heure, on prend le premier.
 *
 * @param {Array} events Rendez-vous du jour.
 * @param {Date} now
 * @returns {object|null}
 */
export const pickCurrentEvent = (events, now = new Date(), leadMinutes = DEFAULT_LEAD_MINUTES) => {
    const list = (Array.isArray(events) ? events : []).filter(isWorksiteEvent);
    if (!list.length) return null;

    const timed = list
        .map((event) => ({ event, start: eventStart(event) }))
        .filter((e) => e.start)
        .sort((a, b) => a.start - b.start);

    if (!timed.length) return list[0];

    const threshold = now.getTime() + leadMinutes * 60 * 1000;
    const started = timed.filter((e) => e.start.getTime() <= threshold);
    return started.length ? started[started.length - 1].event : timed[0].event;
};

/**
 * Chantier à pré-sélectionner pour un rendez-vous : le devis explicitement lié
 * au RDV, sinon le chantier en cours du même client (par identifiant, à défaut
 * par nom).
 *
 * @param {Array} worksites Devis pointables (id, client_id, client_name…).
 * @param {object|null} event
 * @returns {object|null}
 */
export const worksiteForEvent = (worksites, event) => {
    const list = Array.isArray(worksites) ? worksites : [];
    if (!event) return null;

    if (event.quote_id != null) {
        const linked = list.find((q) => String(q.id) === String(event.quote_id));
        if (linked) return linked;
    }
    if (event.client_id != null) {
        const sameClient = list.find((q) => q.client_id != null && String(q.client_id) === String(event.client_id));
        if (sameClient) return sameClient;
    }
    const name = String(event.client_name || '').trim().toLowerCase();
    if (name) {
        const byName = list.find((q) => String(q.client_name || '').trim().toLowerCase() === name);
        if (byName) return byName;
    }
    return null;
};

/** Libellé court du RDV pour expliquer la pré-sélection (« RDV 9h00 · Dupont »). */
export const eventLabel = (event) => {
    if (!event) return '';
    const start = eventStart(event);
    const hour = start
        ? start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : null;
    return [hour ? `RDV ${hour}` : 'RDV', event.client_name || event.title].filter(Boolean).join(' · ');
};
