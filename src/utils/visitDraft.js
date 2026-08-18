// Brouillon de visite technique : la trame en cours est conservée sur
// l'appareil pendant la visite. Sur chantier on perd le réseau, on prend un
// appel, l'onglet est recyclé par le téléphone — le relevé ne doit pas
// disparaître pour autant. Module pur : le stockage est injectable, donc
// testable, et l'absence de localStorage (navigation privée) est tolérée.

export const VISIT_DRAFT_KEY = 'artisanfacile.visite.draft.v1';

// Au-delà, le brouillon est considéré comme périmé : on ne propose pas de
// reprendre une visite d'il y a deux semaines sur un autre chantier.
export const VISIT_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const defaultStorage = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null; // accès refusé (navigation privée, cookies bloqués)
    }
};

/** Enregistre le brouillon horodaté. Retourne false si le stockage refuse. */
export const saveVisitDraft = (draft, { storage = defaultStorage(), now = Date.now() } = {}) => {
    if (!storage || !draft) return false;
    try {
        storage.setItem(VISIT_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now }));
        return true;
    } catch {
        return false; // quota dépassé ou stockage indisponible
    }
};

/**
 * Relit le brouillon. Retourne null s'il est absent, illisible ou périmé —
 * un brouillon périmé est effacé au passage.
 */
export const loadVisitDraft = ({ storage = defaultStorage(), now = Date.now(), maxAgeMs = VISIT_DRAFT_MAX_AGE_MS } = {}) => {
    if (!storage) return null;
    let raw;
    try {
        raw = storage.getItem(VISIT_DRAFT_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        clearVisitDraft({ storage });
        return null;
    }
    if (!parsed || typeof parsed !== 'object') {
        clearVisitDraft({ storage });
        return null;
    }
    if (!parsed.savedAt || now - parsed.savedAt > maxAgeMs) {
        clearVisitDraft({ storage });
        return null;
    }
    return parsed;
};

/** Efface le brouillon (visite terminée ou abandonnée). */
export const clearVisitDraft = ({ storage = defaultStorage() } = {}) => {
    if (!storage) return;
    try {
        storage.removeItem(VISIT_DRAFT_KEY);
    } catch {
        /* stockage indisponible : rien à nettoyer */
    }
};

/** Libellé « il y a … » affiché sur la bannière de reprise. */
export const draftAgeLabel = (savedAt, now = Date.now()) => {
    const mins = Math.max(0, Math.round((now - savedAt) / 60000));
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.round(hours / 24);
    return `il y a ${days} j`;
};
