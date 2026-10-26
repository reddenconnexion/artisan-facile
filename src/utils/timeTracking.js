// Utilitaires de pointage des heures et de rentabilité chantier.
// Le pointage en cours est persisté dans localStorage pour survivre aux
// rechargements de page et fonctionner hors ligne ; les heures terminées
// sont enregistrées dans la table `task_tracking` (une ligne par pointage).

import { isAmendmentRow } from './amendmentIndex';

const CLOCK_STORAGE_KEY = 'af-time-clock';

// Unités de ligne de devis considérées comme du temps de main d'œuvre.
const HOUR_UNITS = ['h', 'h.', 'heure', 'heures'];
const DAY_UNITS = ['j', 'j.', 'jour', 'jours', 'journée', 'journées'];
export const HOURS_PER_DAY = 7;

/**
 * Vrai si la ligne est de la main d'œuvre facturée au temps (unité en heures ou
 * en jours). Sert à la fois à estimer les heures et à éviter de compter ces
 * lignes dans le coût matière (leur coût = heures × coût horaire de revient).
 */
export const isLaborLine = (item) => {
    if (!item || item.type === 'section') return false;
    const unit = String(item.unit || '').trim().toLowerCase();
    return HOUR_UNITS.includes(unit) || DAY_UNITS.includes(unit);
};

/**
 * Estime les heures de main d'œuvre prévues dans un devis à partir de ses
 * lignes : les quantités en heures comptent telles quelles, les quantités en
 * jours sont converties (7 h/jour). Les autres unités (m², forfait…) sont
 * ignorées — on ne devine pas.
 */
export const estimatedHoursFromItems = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, item) => {
        // Une option n'est pas du temps prévu tant qu'elle n'est pas retenue
        // (retenue, elle perd son flag et compte comme n'importe quelle ligne).
        if (!isLaborLine(item) || item.is_optional) return acc;
        const unit = String(item.unit || '').trim().toLowerCase();
        const qty = parseFloat(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) return acc;
        if (HOUR_UNITS.includes(unit)) return acc + qty;
        return acc + qty * HOURS_PER_DAY;
    }, 0);
};

/** Formate une durée décimale en heures pour affichage : 3.5 → "3h30". */
export const formatHours = (hours) => {
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0) return '0h';
    const totalMinutes = Math.round(value * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}min`;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

/**
 * Lit une saisie d'heures libre et la convertit en heures décimales.
 * Accepte la décimale française ou anglaise ("3,5", "3.5") et la notation
 * horaire de l'artisan ("3h30", "3h", "45min"). Retourne null si la saisie
 * n'est pas exploitable ou vaut zéro.
 */
export const parseHoursInput = (raw) => {
    const text = String(raw ?? '').trim().toLowerCase().replace(/\s/g, '');
    if (!text) return null;

    const round = (h) => (Number.isFinite(h) && h > 0 ? Math.round(h * 100) / 100 : null);

    // "45min", "45mn", "45m"
    const minutesOnly = text.match(/^(\d+(?:[.,]\d+)?)(?:min|mn|m)$/);
    if (minutesOnly) return round(parseFloat(minutesOnly[1].replace(',', '.')) / 60);

    // "3h30", "3h05", "3h", "3h30min"
    const hoursMinutes = text.match(/^(\d+)h(\d{1,2})?(?:min|mn|m)?$/);
    if (hoursMinutes) {
        const minutes = hoursMinutes[2] ? parseInt(hoursMinutes[2], 10) : 0;
        if (minutes > 59) return null;
        return round(parseInt(hoursMinutes[1], 10) + minutes / 60);
    }

    // "3,5" / "3.5" / "3"
    if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
    return round(parseFloat(text.replace(',', '.')));
};

/** Heures décimales vers une saisie éditable à la française : 3.5 → "3,5". */
export const hoursToInput = (hours) => {
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0) return '';
    return String(Math.round(value * 100) / 100).replace('.', ',');
};

/** Durée écoulée (en secondes) depuis le démarrage d'un pointage. */
export const elapsedSeconds = (startedAt, now = Date.now()) => {
    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) return 0;
    return Math.max(0, Math.floor((now - started) / 1000));
};

/** Convertit des secondes pointées en heures décimales (2 décimales, min 0.01). */
export const secondsToHours = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.max(0.01, Math.round((seconds / 3600) * 100) / 100);
};

// ── Persistance du pointage en cours ─────────────────────────────────────────

/** Retourne le pointage en cours ({ startedAt, quoteId, quoteLabel }) ou null. */
export const getRunningClock = () => {
    try {
        const raw = localStorage.getItem(CLOCK_STORAGE_KEY);
        if (!raw) return null;
        const clock = JSON.parse(raw);
        if (!clock || !clock.startedAt) return null;
        return clock;
    } catch {
        return null;
    }
};

/** Démarre un pointage (écrase un éventuel pointage précédent). */
export const startClock = ({ quoteId = null, quoteLabel = '' } = {}) => {
    const clock = { startedAt: new Date().toISOString(), quoteId, quoteLabel, workBlock: null };
    try {
        localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(clock));
    } catch {
        // localStorage plein ou indisponible : le chrono vivra en mémoire.
    }
    return clock;
};

/**
 * Change le bloc de travaux du pointage en cours (tout le pointage lui sera
 * imputé à l'arrêt). Retourne le pointage mis à jour, ou null s'il n'y en a pas.
 */
export const setClockWorkBlock = (workBlock) => {
    const clock = getRunningClock();
    if (!clock) return null;
    const next = { ...clock, workBlock: normalizeWorkBlock(workBlock) };
    try {
        localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Ignore : le bloc restera celui affiché tant que la page est ouverte.
    }
    return next;
};

/** Arrête le pointage en cours et le retourne (ou null s'il n'y en avait pas). */
export const stopClock = () => {
    const clock = getRunningClock();
    try {
        localStorage.removeItem(CLOCK_STORAGE_KEY);
    } catch {
        // Ignore : au pire la clé restera et sera écrasée au prochain départ.
    }
    return clock;
};

// ── Blocs de travaux ─────────────────────────────────────────────────────────

/**
 * Découpage des heures pointées par nature de travaux. Un total par chantier
 * dit seulement si l'ensemble a été sous- ou sur-estimé ; ces blocs disent où,
 * et deviennent au fil des chantiers un barème de temps réels pour chiffrer.
 * Les clés sont stockées dans `task_tracking.work_block`.
 */
export const WORK_BLOCKS = [
    { id: 'cables', label: 'Câbles & cheminements', hint: 'tirage, goulottes, gaines, saignées' },
    { id: 'tableau', label: 'Tableau', hint: 'pose, câblage, repérage, essais' },
    { id: 'appareillage', label: 'Appareillage & luminaires', hint: 'pose, raccordement' },
    { id: 'imprevus', label: 'Imprévus & reprises', hint: '' },
    { id: 'hors_pose', label: 'Hors pose', hint: 'achats comptoir, mesures, échanges client' },
];

const WORK_BLOCK_IDS = WORK_BLOCKS.map(b => b.id);

/** Clé de bloc valide, ou null (pointage non découpé). */
export const normalizeWorkBlock = (value) =>
    (WORK_BLOCK_IDS.includes(value) ? value : null);

/** Libellé d'un bloc, ou « Non précisé ». */
export const workBlockLabel = (value) =>
    WORK_BLOCKS.find(b => b.id === value)?.label || 'Non précisé';

/**
 * Répartit des pointages par bloc de travaux.
 * @param {Array<{hours_spent:number, work_block?:string, reconstructed?:boolean}>} entries
 * @returns {{ blocks: Array<{id:string|null, label:string, hours:number}>, total:number, reconstructedHours:number }}
 *   `blocks` suit l'ordre de WORK_BLOCKS (non précisé en dernier) et ne
 *   contient que les blocs ayant des heures.
 */
export const hoursByWorkBlock = (entries) => {
    const sums = new Map();
    let total = 0;
    let reconstructedHours = 0;
    for (const e of Array.isArray(entries) ? entries : []) {
        const hours = Number(e?.hours_spent) || 0;
        if (hours <= 0) continue;
        const key = normalizeWorkBlock(e.work_block);
        sums.set(key, (sums.get(key) || 0) + hours);
        total += hours;
        if (e.reconstructed) reconstructedHours += hours;
    }
    const blocks = [...WORK_BLOCK_IDS, null]
        .filter(id => sums.has(id))
        .map(id => ({ id, label: workBlockLabel(id), hours: sums.get(id) }));
    return { blocks, total, reconstructedHours };
};

/**
 * Écart entre heures pointées et heures chiffrées, en % des heures chiffrées :
 * +15 = 15 % de temps en plus que prévu au devis. null sans heures au devis.
 */
export const hoursGapPercent = (estimatedHours, spentHours) => {
    const est = Number(estimatedHours) || 0;
    if (est <= 0) return null;
    const spent = Number(spentHours) || 0;
    return Math.round(((spent - est) / est) * 100);
};

// ── Types de chantier et coefficients correcteurs ────────────────────────────

/** Types de chantier (colonne `quotes.chantier_type` du devis initial). */
export const CHANTIER_TYPES = [
    { id: 'neuf', label: 'Neuf' },
    { id: 'renovation_partielle', label: 'Rénovation partielle' },
    { id: 'renovation_complete', label: 'Rénovation complète' },
    { id: 'depannage', label: 'Dépannage' },
];

const CHANTIER_TYPE_IDS = CHANTIER_TYPES.map(t => t.id);

/** Clé de type valide, ou null (chantier non classé). */
export const normalizeChantierType = (value) =>
    (CHANTIER_TYPE_IDS.includes(value) ? value : null);

/** Type retenu pour un chantier non classé : la rénovation, cas de la grande majorité des chantiers. */
export const DEFAULT_CHANTIER_TYPE = 'renovation_partielle';

/** Type du chantier, la rénovation par défaut s'il n'est pas classé. */
export const chantierTypeOrDefault = (value) =>
    normalizeChantierType(value) || DEFAULT_CHANTIER_TYPE;

/** Nombre de chantiers terminés à partir duquel un coefficient est jugé solide. */
export const MIN_CHANTIERS_FOR_COEFFICIENT = 4;

/**
 * Coefficient correcteur par type de chantier : heures pointées ÷ heures
 * chiffrées, cumulées sur les chantiers TERMINÉS du type (un chantier en cours
 * n'a pas encore toutes ses heures). Les cumuls pondèrent naturellement par
 * la taille : un gros chantier pèse plus qu'un petit dépannage.
 * Un chantier non classé compte comme une rénovation (DEFAULT_CHANTIER_TYPE).
 * Un chantier sans heures au devis ou sans pointage n'apprend rien : ignoré.
 *
 * @param {Array<{chantierType?:string, completed:boolean, estimated:number, spent:number}>} chantiers
 * @returns {Array<{id:string, label:string, count:number, estimated:number, spent:number, coefficient:number, reliable:boolean}>}
 *   dans l'ordre de CHANTIER_TYPES, uniquement les types ayant au moins un chantier exploitable.
 */
export const correctionCoefficients = (chantiers) => {
    const sums = new Map();
    for (const c of Array.isArray(chantiers) ? chantiers : []) {
        const type = chantierTypeOrDefault(c?.chantierType);
        const estimated = Number(c?.estimated) || 0;
        const spent = Number(c?.spent) || 0;
        if (!c?.completed || estimated <= 0 || spent <= 0) continue;
        const sum = sums.get(type) || { count: 0, estimated: 0, spent: 0 };
        sum.count += 1;
        sum.estimated += estimated;
        sum.spent += spent;
        sums.set(type, sum);
    }
    return CHANTIER_TYPES
        .filter(t => sums.has(t.id))
        .map(t => {
            const { count, estimated, spent } = sums.get(t.id);
            return {
                id: t.id,
                label: t.label,
                count,
                estimated,
                spent,
                coefficient: Math.round((spent / estimated) * 100) / 100,
                reliable: count >= MIN_CHANTIERS_FOR_COEFFICIENT,
            };
        });
};

// ── Rentabilité chantier ─────────────────────────────────────────────────────

/**
 * Calcule la rentabilité main d'œuvre d'un chantier.
 * @param {number} estimatedHours - heures prévues au devis
 * @param {number} spentHours - heures réellement pointées
 * @param {number} hourlyRate - taux horaire (€/h), 0 si inconnu
 * @returns {{ progress: number|null, overrunHours: number, overrunCost: number, status: 'ok'|'warning'|'over'|'unknown' }}
 */
export const laborProfitability = (estimatedHours, spentHours, hourlyRate = 0) => {
    const est = Number(estimatedHours) || 0;
    const spent = Number(spentHours) || 0;
    const rate = Number(hourlyRate) || 0;

    if (est <= 0) {
        // Pas d'heures chiffrées au devis : on ne peut pas juger, on informe.
        return { progress: null, overrunHours: 0, overrunCost: 0, status: 'unknown' };
    }

    const progress = spent / est;
    const overrunHours = Math.max(0, spent - est);
    const overrunCost = Math.round(overrunHours * rate * 100) / 100;
    const status = progress > 1 ? 'over' : progress >= 0.8 ? 'warning' : 'ok';
    return { progress, overrunHours, overrunCost, status };
};

// ── Chantier = devis initial + avenants ──────────────────────────────────────

// Statuts d'un avenant signé par le client : ses heures deviennent des heures
// prévues du chantier.
const SIGNED_STATUSES = ['accepted', 'billed', 'paid'];

/**
 * Id du devis initial d'un chantier : pour un avenant (y compris converti en
 * facture), son devis parent ; sinon le document lui-même.
 */
export const chantierRootId = (quote) => {
    if (!quote) return null;
    return isAmendmentRow(quote) && quote.parent_quote_id != null
        ? quote.parent_quote_id
        : quote.id;
};

/**
 * Heures d'un chantier comptées en COMMUN entre le devis initial et ses
 * avenants : le devis initial n'est pas forcément terminé quand l'avenant est
 * signé, et un RDV d'agenda peut être lié à l'un ou à l'autre.
 *   - prévues : devis initial + avenants signés ;
 *   - pointées : toutes les heures pointées sur le devis initial ou l'un de
 *     ses avenants (le temps passé est réel, même sur un avenant non signé).
 *
 * @param {Array} quotes Lignes `quotes` (devis initiaux et avenants).
 * @param {Record<number,number>|Map<number,number>} spentByQuote Heures pointées par devis.
 * @returns {Map<number, {estimated:number, spent:number, totalHt:number, amendmentCount:number, docIds:number[]}>}
 *   indexée par l'id du devis initial.
 */
export const chantierHours = (quotes, spentByQuote = {}) => {
    const spentOf = (id) => Number(
        spentByQuote instanceof Map ? spentByQuote.get(Number(id)) : spentByQuote?.[id]
    ) || 0;
    const map = new Map();
    const entry = (rootId) => {
        const key = Number(rootId);
        if (!map.has(key)) map.set(key, { estimated: 0, spent: 0, totalHt: 0, amendmentCount: 0, docIds: [] });
        return map.get(key);
    };

    const seen = new Set();
    for (const q of Array.isArray(quotes) ? quotes : []) {
        if (!q || q.id == null || seen.has(Number(q.id))) continue;
        seen.add(Number(q.id));
        const rootId = chantierRootId(q);
        const isAmendment = Number(rootId) !== Number(q.id);
        const e = entry(rootId);
        e.docIds.push(Number(q.id));
        e.spent += spentOf(q.id);
        // Un avenant non signé (brouillon, refusé…) n'engage pas encore le client.
        if (isAmendment && !SIGNED_STATUSES.includes(q.status)) continue;
        if (isAmendment) e.amendmentCount += 1;
        e.estimated += estimatedHoursFromItems(q.items);
        e.totalHt += Number(q.total_ht) || 0;
    }
    return map;
};

// ── Semaine de feuille d'heures ──────────────────────────────────────────────

/** Lundi (00:00 locale) de la semaine contenant `date`. */
export const startOfWeek = (date = new Date()) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = dimanche
    d.setDate(d.getDate() - ((day + 6) % 7));
    return d;
};

/** Les 7 dates (YYYY-MM-DD) de la semaine commençant à `weekStart`. */
export const weekDays = (weekStart) => {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return toDateString(d);
    });
};

/** Date locale au format YYYY-MM-DD (sans passer par UTC). */
export const toDateString = (date) => {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
