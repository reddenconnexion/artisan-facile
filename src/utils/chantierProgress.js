// Suivi d'avancement d'un chantier, ligne par ligne, à partir du devis.
//
// Sur le chantier, l'artisan a besoin de deux choses que le devis papier lui
// donnait : savoir CE QUI EST PRÉVU (et ce qui ne l'est pas — les options non
// retenues, le hors devis) et cocher AU FUR ET À MESURE ce qui est fait pour
// savoir où il en est. Ce module transforme le JSON `quotes.items` en une
// check-list exploitable au doigt, et calcule l'avancement.
//
// Logique PURE (aucun accès réseau ni localStorage) : la persistance vit dans
// `chantierProgressStore.js`. Les clés de ligne suivent la même convention que
// `supplyEntries` (quoteInternalDetail.js) : `line:<id>` et `comp:<id>:<id>`,
// pour rester stables tant que le devis n'est pas réécrit.

import { lineComponents } from './quoteInternalDetail';
import { isLaborLine } from './timeTracking';

/** Titre de la section implicite des lignes posées avant tout titre de section. */
export const DEFAULT_SECTION = 'Prestations';

/** Quantité exploitable d'une ligne : 1 par défaut, comme dans le devis. */
const qtyOf = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
};

/** Clé stable d'une ligne de devis. */
export const lineKey = (item, index) => `line:${item?.id ?? index}`;

/** Clé stable d'une fourniture du chiffrage interne. */
export const componentKey = (lineId, component, index) => `comp:${lineId}:${component?.id ?? index}`;

/**
 * Découpe les lignes du devis en sections cochables.
 *
 * Chaque ligne porte ses sous-lignes (`components`) : les fournitures du
 * chiffrage interne d'une ligne groupée. Elles sont cochables individuellement
 * — c'est souvent à ce niveau que le travail avance réellement (« les 6 prises
 * du séjour sont posées, il reste les 2 de la chambre »).
 *
 * @param {Array} items Lignes du devis (quotes.items).
 * @returns {Array<{ title: string, lines: Array }>} Sections non vides.
 */
export const checklistSections = (items) => {
    const sections = [];
    let current = { title: DEFAULT_SECTION, lines: [] };

    (Array.isArray(items) ? items : []).forEach((item, index) => {
        if (!item) return;

        if (item.type === 'section') {
            if (current.lines.length) sections.push(current);
            current = { title: (item.description || '').trim() || DEFAULT_SECTION, lines: [] };
            return;
        }

        const description = (item.description || '').trim();
        if (!description && !item.price) return; // ligne vide en cours de saisie

        const id = item.id ?? index;
        const key = lineKey(item, index);
        const quantity = qtyOf(item.quantity);
        const price = parseFloat(item.price) || 0;

        current.lines.push({
            key,
            description: description || 'Ligne sans description',
            quantity,
            unit: item.unit || 'u',
            price,
            total: price * quantity,
            type: item.type === 'material' ? 'material' : 'service',
            isLabor: isLaborLine(item),
            isOptional: !!item.is_optional,
            note: (item.internal_note || '').trim() || null,
            components: lineComponents(item).map((component, ci) => ({
                key: componentKey(id, component, ci),
                description: component.description.trim(),
                quantity: qtyOf(component.quantity),
                unit: component.unit || 'u',
                parentKey: key,
            })),
        });
    });

    if (current.lines.length) sections.push(current);
    return sections;
};

/** Toutes les lignes des sections, à plat (sans les sous-lignes). */
export const flatLines = (sections) =>
    (Array.isArray(sections) ? sections : []).flatMap((s) => s.lines);

/**
 * Une ligne est faite si elle est cochée explicitement, ou si toutes ses
 * fournitures internes le sont (on ne demande pas de cocher deux fois).
 */
export const isLineDone = (line, done = {}) => {
    if (done[line.key]) return true;
    if (!line.components?.length) return false;
    return line.components.every((c) => !!done[c.key]);
};

/**
 * Coche / décoche une ligne, en propageant aux fournitures internes : cocher la
 * ligne groupée coche tout son détail, la décocher le libère.
 *
 * @returns {object} Nouvelle carte `done` (clé → horodatage ISO).
 */
export const toggleLine = (done = {}, line, at = new Date().toISOString()) => {
    const next = { ...done };
    const target = !isLineDone(line, done);
    const apply = (key) => { if (target) next[key] = at; else delete next[key]; };
    apply(line.key);
    (line.components || []).forEach((c) => apply(c.key));
    return next;
};

/** Coche / décoche une fourniture interne, sans toucher aux autres. */
export const toggleComponent = (done = {}, line, component, at = new Date().toISOString()) => {
    const next = { ...done };
    if (next[component.key]) {
        delete next[component.key];
        delete next[line.key]; // la ligne parente n'est plus complète
    } else {
        next[component.key] = at;
        if (line.components.every((c) => c.key === component.key || next[c.key])) next[line.key] = at;
    }
    return next;
};

/** Coche (ou décoche) toutes les lignes fermes d'un coup. */
export const setAll = (sections, value, at = new Date().toISOString()) => {
    if (!value) return {};
    const done = {};
    flatLines(sections)
        .filter((l) => !l.isOptional)
        .forEach((line) => {
            done[line.key] = at;
            (line.components || []).forEach((c) => { done[c.key] = at; });
        });
    return done;
};

/**
 * Avancement du chantier.
 *
 * - En nombre d'opérations : on compte les « feuilles » (les fournitures
 *   internes quand elles existent, sinon la ligne elle-même).
 * - En montant : seules les lignes fermes portent un prix ; les options en sont
 *   exclues, comme dans le total du devis, puisqu'elles ne sont pas dues.
 *
 * @returns {{ doneUnits:number, totalUnits:number, ratio:number,
 *             doneAmount:number, totalAmount:number, amountRatio:number,
 *             optionalCount:number, remainingLines:Array }}
 */
export const progressStats = (sections, done = {}) => {
    const lines = flatLines(sections);
    const firm = lines.filter((l) => !l.isOptional);

    let doneUnits = 0;
    let totalUnits = 0;
    firm.forEach((line) => {
        if (line.components?.length) {
            totalUnits += line.components.length;
            doneUnits += line.components.filter((c) => !!done[c.key]).length;
        } else {
            totalUnits += 1;
            if (isLineDone(line, done)) doneUnits += 1;
        }
    });

    const totalAmount = firm.reduce((sum, l) => sum + l.total, 0);
    const doneAmount = firm.reduce((sum, l) => sum + (isLineDone(l, done) ? l.total : 0), 0);

    return {
        doneUnits,
        totalUnits,
        ratio: totalUnits > 0 ? doneUnits / totalUnits : 0,
        doneAmount,
        totalAmount,
        amountRatio: totalAmount > 0 ? doneAmount / totalAmount : 0,
        optionalCount: lines.length - firm.length,
        remainingLines: firm.filter((l) => !isLineDone(l, done)),
    };
};

/** Normalise un texte pour la recherche : minuscules, sans accents. */
const normalize = (text) =>
    String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * La ligne (ou une de ses fournitures) correspond-elle à la recherche ?
 * Sert à répondre sur place à « est-ce que la prise du garage est prévue ? ».
 */
export const lineMatches = (line, query) => {
    const q = normalize(query).trim();
    if (!q) return true;
    const terms = q.split(/\s+/);
    const haystack = normalize([
        line.description,
        line.unit,
        line.note,
        ...(line.components || []).map((c) => c.description),
    ].join(' '));
    return terms.every((term) => haystack.includes(term));
};

/** Fusionne deux états de suivi (local / distant) : l'horodatage le plus ancien gagne. */
export const mergeDone = (a = {}, b = {}) => {
    const merged = { ...a };
    Object.entries(b).forEach(([key, value]) => {
        if (!merged[key] || String(value) < String(merged[key])) merged[key] = value;
    });
    return merged;
};

/** Fusionne les travaux hors devis des deux côtés, par identifiant. */
export const mergeExtras = (a = [], b = []) => {
    const byId = new Map();
    [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach((extra) => {
        if (!extra?.id) return;
        const existing = byId.get(extra.id);
        if (!existing || String(extra.updated_at || '') > String(existing.updated_at || '')) {
            byId.set(extra.id, extra);
        }
    });
    return Array.from(byId.values())
        .filter((e) => !e.deleted)
        .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')));
};
