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
