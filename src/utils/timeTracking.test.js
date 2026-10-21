import { describe, it, expect, beforeEach } from 'vitest';
import {
    estimatedHoursFromItems,
    formatHours,
    elapsedSeconds,
    secondsToHours,
    getRunningClock,
    startClock,
    stopClock,
    laborProfitability,
    parseHoursInput,
    hoursToInput,
    startOfWeek,
    weekDays,
    toDateString,
    HOURS_PER_DAY,
    chantierHours,
    chantierRootId,
    normalizeWorkBlock,
    workBlockLabel,
    hoursByWorkBlock,
    hoursGapPercent,
    setClockWorkBlock,
    correctionCoefficients,
    normalizeChantierType,
    MIN_CHANTIERS_FOR_COEFFICIENT,
} from './timeTracking';

describe('estimatedHoursFromItems', () => {
    it('returns 0 for empty or invalid input', () => {
        expect(estimatedHoursFromItems(null)).toBe(0);
        expect(estimatedHoursFromItems([])).toBe(0);
        expect(estimatedHoursFromItems('nope')).toBe(0);
    });

    it('sums quantities with hour units', () => {
        expect(estimatedHoursFromItems([
            { description: 'MO pose', unit: 'h', quantity: 3 },
            { description: 'MO finitions', unit: 'Heures', quantity: 2.5 },
        ])).toBe(5.5);
    });

    it('converts day units to hours', () => {
        expect(estimatedHoursFromItems([
            { description: 'MO', unit: 'jour', quantity: 2 },
        ])).toBe(2 * HOURS_PER_DAY);
    });

    it('ignore une ligne optionnelle : une option non retenue n\'est pas du temps prévu', () => {
        const items = [
            { description: 'Pose', unit: 'h', quantity: 4 },
            { description: 'Tranchée (option)', unit: 'h', quantity: 2, is_optional: true },
        ];
        expect(estimatedHoursFromItems(items)).toBe(4);
    });

    it('ignores non-time units, sections and bad quantities', () => {
        expect(estimatedHoursFromItems([
            { description: 'Carrelage', unit: 'm²', quantity: 12 },
            { type: 'section', description: 'Salle de bain', unit: 'h', quantity: 4 },
            { description: 'MO', unit: 'h', quantity: 'abc' },
            { description: 'MO', unit: 'h', quantity: -2 },
            null,
        ])).toBe(0);
    });
});

describe('formatHours', () => {
    it('formats whole and fractional hours', () => {
        expect(formatHours(3)).toBe('3h');
        expect(formatHours(3.5)).toBe('3h30');
        expect(formatHours(0.25)).toBe('15min');
    });

    it('handles zero and invalid values', () => {
        expect(formatHours(0)).toBe('0h');
        expect(formatHours(-1)).toBe('0h');
        expect(formatHours(NaN)).toBe('0h');
    });

    it('pads minutes to two digits', () => {
        expect(formatHours(2.05)).toBe('2h03');
    });
});

describe('elapsedSeconds / secondsToHours', () => {
    it('computes elapsed seconds from a start timestamp', () => {
        const start = new Date('2026-07-02T08:00:00Z').toISOString();
        const now = new Date('2026-07-02T09:30:00Z').getTime();
        expect(elapsedSeconds(start, now)).toBe(5400);
    });

    it('never returns negative elapsed time', () => {
        const start = new Date(Date.now() + 60_000).toISOString();
        expect(elapsedSeconds(start)).toBe(0);
    });

    it('returns 0 for invalid start', () => {
        expect(elapsedSeconds('not-a-date')).toBe(0);
    });

    it('converts seconds to decimal hours with a floor of 0.01', () => {
        expect(secondsToHours(5400)).toBe(1.5);
        expect(secondsToHours(10)).toBe(0.01); // pointage éclair → minimum facturable
        expect(secondsToHours(0)).toBe(0);
    });
});

describe('running clock persistence', () => {
    // L'environnement de test est node : on fournit un localStorage minimal.
    beforeEach(() => {
        const store = new Map();
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
            clear: () => store.clear(),
        };
    });

    it('starts, reads and stops a clock', () => {
        expect(getRunningClock()).toBeNull();
        const clock = startClock({ quoteId: 42, quoteLabel: 'SDB Dupont' });
        expect(clock.quoteId).toBe(42);
        expect(getRunningClock()).toMatchObject({ quoteId: 42, quoteLabel: 'SDB Dupont' });
        const stopped = stopClock();
        expect(stopped.quoteId).toBe(42);
        expect(getRunningClock()).toBeNull();
    });

    it('survives corrupted storage', () => {
        localStorage.setItem('af-time-clock', '{invalid json');
        expect(getRunningClock()).toBeNull();
    });

    it('stopClock returns null when nothing is running', () => {
        expect(stopClock()).toBeNull();
    });
});

describe('laborProfitability', () => {
    it('flags unknown when no hours were quoted', () => {
        expect(laborProfitability(0, 5, 45)).toMatchObject({ progress: null, status: 'unknown' });
    });

    it('reports ok under 80% of quoted hours', () => {
        const r = laborProfitability(10, 5, 45);
        expect(r.status).toBe('ok');
        expect(r.progress).toBe(0.5);
        expect(r.overrunCost).toBe(0);
    });

    it('reports warning between 80% and 100%', () => {
        expect(laborProfitability(10, 9, 45).status).toBe('warning');
        expect(laborProfitability(10, 10, 45).status).toBe('warning');
    });

    it('reports overrun with its cost past 100%', () => {
        const r = laborProfitability(10, 12.5, 45);
        expect(r.status).toBe('over');
        expect(r.overrunHours).toBe(2.5);
        expect(r.overrunCost).toBe(112.5);
    });

    it('costs nothing when hourly rate is unknown', () => {
        expect(laborProfitability(10, 12, 0).overrunCost).toBe(0);
    });
});

describe('parseHoursInput', () => {
    it('reads decimal hours, French or English', () => {
        expect(parseHoursInput('3,5')).toBe(3.5);
        expect(parseHoursInput('3.5')).toBe(3.5);
        expect(parseHoursInput(' 7 ')).toBe(7);
        expect(parseHoursInput(2.25)).toBe(2.25);
    });

    it('reads the hours/minutes notation', () => {
        expect(parseHoursInput('3h30')).toBe(3.5);
        expect(parseHoursInput('3h')).toBe(3);
        expect(parseHoursInput('3h05')).toBe(3.08);
        expect(parseHoursInput('1 h 15')).toBe(1.25);
        expect(parseHoursInput('45min')).toBe(0.75);
        expect(parseHoursInput('30m')).toBe(0.5);
    });

    it('rejects what is not a duration', () => {
        expect(parseHoursInput('')).toBeNull();
        expect(parseHoursInput(null)).toBeNull();
        expect(parseHoursInput('abc')).toBeNull();
        expect(parseHoursInput('-2')).toBeNull();
        expect(parseHoursInput('0')).toBeNull();
        expect(parseHoursInput('3h75')).toBeNull();
    });
});

describe('hoursToInput', () => {
    it('formats decimal hours for the input field', () => {
        expect(hoursToInput(3.5)).toBe('3,5');
        expect(hoursToInput(7)).toBe('7');
        expect(hoursToInput('2.25')).toBe('2,25');
    });

    it('returns an empty string when there is nothing to edit', () => {
        expect(hoursToInput(0)).toBe('');
        expect(hoursToInput(null)).toBe('');
        expect(hoursToInput('abc')).toBe('');
    });
});

describe('week helpers', () => {
    it('startOfWeek returns the Monday of the week', () => {
        // Jeudi 2 juillet 2026 → lundi 29 juin 2026
        expect(toDateString(startOfWeek(new Date(2026, 6, 2)))).toBe('2026-06-29');
        // Un dimanche appartient à la semaine commencée le lundi précédent
        expect(toDateString(startOfWeek(new Date(2026, 6, 5)))).toBe('2026-06-29');
        // Un lundi reste lui-même
        expect(toDateString(startOfWeek(new Date(2026, 5, 29)))).toBe('2026-06-29');
    });

    it('weekDays lists the 7 dates of the week', () => {
        const days = weekDays(startOfWeek(new Date(2026, 6, 2)));
        expect(days).toHaveLength(7);
        expect(days[0]).toBe('2026-06-29');
        expect(days[6]).toBe('2026-07-05');
    });
});

describe('chantierHours — devis initial + avenants comptés ensemble', () => {
    const root = { id: 1, type: 'quote', status: 'accepted', total_ht: 1000, items: [{ unit: 'h', quantity: 10 }] };
    const signed = { id: 2, type: 'amendment', status: 'accepted', parent_quote_id: 1, total_ht: 400, items: [{ unit: 'h', quantity: 4 }] };
    const draft = { id: 3, type: 'amendment', status: 'draft', parent_quote_id: 1, total_ht: 200, items: [{ unit: 'h', quantity: 2 }] };
    const invoicedAmendment = { id: 4, type: 'invoice', status: 'paid', parent_quote_id: 1, total_ht: 100, items: [{ unit: 'h', quantity: 1 }] };

    it('rattache un avenant (même converti en facture) à son devis initial', () => {
        expect(chantierRootId(root)).toBe(1);
        expect(chantierRootId(signed)).toBe(1);
        expect(chantierRootId(invoicedAmendment)).toBe(1);
    });

    it('additionne heures prévues des avenants signés et heures pointées de tous les documents', () => {
        const spent = { 1: 6, 2: 3, 3: 1 };
        const h = chantierHours([root, signed, draft], spent).get(1);
        expect(h.estimated).toBe(14);      // 10 + 4, l'avenant brouillon n'engage pas
        expect(h.spent).toBe(10);          // 6 + 3 + 1 : le temps passé est réel
        expect(h.totalHt).toBe(1400);
        expect(h.amendmentCount).toBe(1);
        expect(h.docIds).toEqual([1, 2, 3]);
    });

    it('accepte une Map, ignore les doublons et compte l\'avenant facturé', () => {
        const h = chantierHours([root, signed, signed, invoicedAmendment], new Map([[1, 2], [4, 1]])).get(1);
        expect(h.estimated).toBe(15);
        expect(h.spent).toBe(3);
        expect(h.amendmentCount).toBe(2);
    });
});

describe('blocs de travaux', () => {
    beforeEach(() => localStorage.clear());

    it('normalise les clés de bloc', () => {
        expect(normalizeWorkBlock('tableau')).toBe('tableau');
        expect(normalizeWorkBlock('inconnu')).toBeNull();
        expect(normalizeWorkBlock('')).toBeNull();
        expect(normalizeWorkBlock(null)).toBeNull();
        expect(workBlockLabel('hors_pose')).toBe('Hors pose');
        expect(workBlockLabel(null)).toBe('Non précisé');
    });

    it('répartit les heures par bloc, dans l\'ordre des blocs, non précisé en dernier', () => {
        const res = hoursByWorkBlock([
            { hours_spent: 2, work_block: null },
            { hours_spent: 3, work_block: 'tableau', reconstructed: true },
            { hours_spent: '1.5', work_block: 'cables' },
            { hours_spent: 1, work_block: 'tableau' },
            { hours_spent: 0, work_block: 'imprevus' },
            { hours_spent: 1, work_block: 'bizarre' },
        ]);
        expect(res.blocks).toEqual([
            { id: 'cables', label: 'Câbles & cheminements', hours: 1.5 },
            { id: 'tableau', label: 'Tableau', hours: 4 },
            { id: null, label: 'Non précisé', hours: 3 },
        ]);
        expect(res.total).toBe(8.5);
        expect(res.reconstructedHours).toBe(3);
    });

    it('tolère une liste vide ou absente', () => {
        expect(hoursByWorkBlock(undefined)).toEqual({ blocks: [], total: 0, reconstructedHours: 0 });
    });

    it('calcule l\'écart pointé / chiffré en %', () => {
        expect(hoursGapPercent(20, 23)).toBe(15);
        expect(hoursGapPercent(20, 18)).toBe(-10);
        expect(hoursGapPercent(0, 5)).toBeNull();
    });

    it('mémorise le bloc du pointage en cours', () => {
        expect(setClockWorkBlock('tableau')).toBeNull();
        startClock({ quoteId: 7, quoteLabel: 'Chantier' });
        expect(getRunningClock().workBlock).toBeNull();
        expect(setClockWorkBlock('tableau').workBlock).toBe('tableau');
        expect(getRunningClock().workBlock).toBe('tableau');
        expect(setClockWorkBlock('n_importe_quoi').workBlock).toBeNull();
    });
});

describe('correctionCoefficients — par type de chantier', () => {
    it('cumule heures pointées / chiffrées des chantiers terminés par type', () => {
        const res = correctionCoefficients([
            { chantierType: 'renovation_complete', completed: true, estimated: 20, spent: 24 },
            { chantierType: 'renovation_complete', completed: true, estimated: 40, spent: 45 },
            { chantierType: 'neuf', completed: true, estimated: 30, spent: 27 },
            // ignorés : en cours, non classé, type inconnu, sans heures au devis, sans pointage
            { chantierType: 'neuf', completed: false, estimated: 10, spent: 30 },
            { chantierType: null, completed: true, estimated: 10, spent: 30 },
            { chantierType: 'piscine', completed: true, estimated: 10, spent: 30 },
            { chantierType: 'depannage', completed: true, estimated: 0, spent: 3 },
            { chantierType: 'depannage', completed: true, estimated: 2, spent: 0 },
        ]);
        expect(res).toEqual([
            { id: 'neuf', label: 'Neuf', count: 1, estimated: 30, spent: 27, coefficient: 0.9, reliable: false },
            { id: 'renovation_complete', label: 'Rénovation complète', count: 2, estimated: 60, spent: 69, coefficient: 1.15, reliable: false },
        ]);
    });

    it('juge le coefficient solide à partir de 4 chantiers', () => {
        const four = Array.from({ length: MIN_CHANTIERS_FOR_COEFFICIENT }, () => (
            { chantierType: 'depannage', completed: true, estimated: 2, spent: 2.5 }
        ));
        const [dep] = correctionCoefficients(four);
        expect(dep.coefficient).toBe(1.25);
        expect(dep.reliable).toBe(true);
    });

    it('tolère une liste absente', () => {
        expect(correctionCoefficients(undefined)).toEqual([]);
        expect(normalizeChantierType('neuf')).toBe('neuf');
        expect(normalizeChantierType('')).toBeNull();
    });
});
