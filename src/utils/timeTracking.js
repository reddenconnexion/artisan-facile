// Utilitaires de pointage des heures et de rentabilité chantier.
// Le pointage en cours est persisté dans localStorage pour survivre aux
// rechargements de page et fonctionner hors ligne ; les heures terminées
// sont enregistrées dans la table `task_tracking` (une ligne par pointage).

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
        if (!isLaborLine(item)) return acc;
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
    const clock = { startedAt: new Date().toISOString(), quoteId, quoteLabel };
    try {
        localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(clock));
    } catch {
        // localStorage plein ou indisponible : le chrono vivra en mémoire.
    }
    return clock;
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
