// Fiche Affaire : regroupe ce qui se passe sur le chantier (photos, RDV,
// matériel, heures, rapports, suivi terrain) autour du devis racine.
// Fonctions pures, testées dans affaireSite.test.js.

/** Identifiants des documents de l'affaire : devis racine + documents liés. */
export const affaireQuoteIds = (root, children = []) => {
    const ids = new Set();
    if (root?.id != null) ids.add(Number(root.id));
    (children || []).forEach((doc) => {
        if (doc?.id != null) ids.add(Number(doc.id));
    });
    return [...ids].filter(Number.isFinite);
};

/**
 * Noms des dossiers photos de l'affaire. Un dossier est créé au nom du devis
 * (puis de chaque avenant) chez le client : on le retrouve par ce nom.
 */
export const photoFolderNames = (root, children = []) => {
    const names = new Set();
    [root, ...(children || []).filter((d) => d?.type === 'amendment')].forEach((doc) => {
        const name = (doc?.title || '').trim();
        if (name) names.add(name);
    });
    return [...names];
};

const MATERIAL_STATUSES = ['pending', 'ordered', 'received'];

/** Matériel de l'affaire compté par état (à commander / commandé / reçu). */
export const summarizeMaterial = (rows = []) => {
    const counts = { pending: 0, ordered: 0, received: 0 };
    let cost = 0;
    (rows || []).forEach((row) => {
        const status = MATERIAL_STATUSES.includes(row?.status) ? row.status : 'pending';
        counts[status] += 1;
        const qty = Number(row?.quantity) || 0;
        const price = Number(row?.buying_price) || 0;
        cost += qty * price;
    });
    return { ...counts, total: (rows || []).length, cost: Math.round(cost * 100) / 100 };
};

/** Heures pointées sur l'affaire : total et dernier pointage. */
export const summarizeHours = (rows = []) => {
    const list = (rows || []).filter((r) => Number(r?.hours_spent) > 0);
    const total = list.reduce((sum, r) => sum + Number(r.hours_spent), 0);
    const last = list.reduce((acc, r) => (!acc || String(r.date || '') > String(acc.date || '') ? r : acc), null);
    return { total: Math.round(total * 100) / 100, count: list.length, lastDate: last?.date || null };
};

const eventDay = (ev) => String(ev?.date || '').slice(0, 10);

/**
 * RDV de l'affaire : ceux rattachés à un de ses documents, sinon ceux du
 * client depuis la date du devis. À venir d'abord (du plus proche au plus
 * lointain), puis les passés (du plus récent au plus ancien).
 */
export const affaireEvents = (events = [], { quoteIds = [], clientId = null, sinceDate = null, today } = {}) => {
    const ids = new Set((quoteIds || []).map(Number));
    const since = String(sinceDate || '').slice(0, 10);
    const todayStr = today || new Date().toISOString().slice(0, 10);
    const linked = (events || []).filter((ev) => ev?.quote_id != null && ids.has(Number(ev.quote_id)));
    const pool = linked.length > 0
        ? linked
        : (events || []).filter((ev) =>
            clientId != null && String(ev?.client_id) === String(clientId)
            && (!since || eventDay(ev) >= since));
    const key = (ev) => `${eventDay(ev)} ${ev?.time || ''}`;
    const upcoming = pool.filter((ev) => eventDay(ev) >= todayStr).sort((a, b) => key(a).localeCompare(key(b)));
    const past = pool.filter((ev) => eventDay(ev) < todayStr).sort((a, b) => key(b).localeCompare(key(a)));
    return { upcoming, past };
};

/** Travaux notés « hors devis » sur le chantier et pas encore chiffrés en avenant. */
export const openExtras = (extras = []) =>
    (Array.isArray(extras) ? extras : []).filter((e) => e && !e.deleted && !e.amendment_id && (e.description || '').trim());

/**
 * Lignes d'avenant à partir des notes « hors devis » : une ligne par note,
 * quantité 1, prix à renseigner par l'artisan.
 */
export const extrasToAmendmentItems = (extras = [], now = Date.now()) =>
    openExtras(extras).map((extra, i) => ({
        id: now + i,
        description: extra.description.trim(),
        quantity: 1,
        unit: 'forfait',
        price: 0,
        buying_price: 0,
        type: 'service',
    }));

/** Marque les notes reprises dans un avenant (elles quittent la liste à chiffrer). */
export const markExtrasConverted = (extras = [], amendmentId, at = new Date().toISOString()) => {
    const open = new Set(openExtras(extras).map((e) => e.id));
    return (Array.isArray(extras) ? extras : []).map((e) =>
        open.has(e.id) ? { ...e, amendment_id: amendmentId, updated_at: at } : e);
};
