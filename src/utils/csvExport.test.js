import { describe, it, expect } from 'vitest';
import { sanitizeCell, buildCsv, buildFilename } from './csvExport';

describe('sanitizeCell', () => {
    it('returns empty string for null and undefined', () => {
        expect(sanitizeCell(null)).toBe('');
        expect(sanitizeCell(undefined)).toBe('');
    });

    it('passes safe values through unchanged', () => {
        expect(sanitizeCell('Jean Dupont')).toBe('Jean Dupont');
        expect(sanitizeCell(42)).toBe('42');
        expect(sanitizeCell(0)).toBe('0');
        expect(sanitizeCell('')).toBe('');
    });

    it.each([
        ['=SUM(A1:A10)', "'=SUM(A1:A10)"],
        ['+1234', "'+1234"],
        ['-1234', "'-1234"],
        ['@import', "'@import"],
        ['\trogue', "'\trogue"],
        ['\rrogue', "'\rrogue"],
    ])('prefixes formula-injection payloads (%s)', (input, expected) => {
        // Each spreadsheet-formula trigger must be neutralised by a leading quote.
        expect(sanitizeCell(input)).toBe(expected);
    });

    it('coerces non-string values to string before checking', () => {
        // Boolean, number etc. shouldn't trip the sanitizer.
        expect(sanitizeCell(false)).toBe('false');
        expect(sanitizeCell(true)).toBe('true');
    });
});

describe('buildCsv', () => {
    const COLS = [
        { key: 'name', label: 'Nom' },
        { key: 'amount', label: 'Montant' },
    ];

    it('renders rows in column order using semicolon delimiter', () => {
        const csv = buildCsv(
            [
                { name: 'Alice', amount: 100 },
                { name: 'Bob', amount: 200 },
            ],
            COLS
        );
        const lines = csv.split(/\r?\n/);
        expect(lines[0]).toBe('Nom;Montant');
        expect(lines[1]).toBe('Alice;100');
        expect(lines[2]).toBe('Bob;200');
    });

    it('applies the format function when provided and gets the row as second arg', () => {
        const csv = buildCsv(
            [{ name: 'Alice', amount: 100 }],
            [
                { key: 'name', label: 'Nom' },
                { key: 'amount', label: 'Montant TTC', format: (v) => `${v} €` },
                {
                    key: (row) => `${row.name} (${row.amount})`,
                    label: 'Combo',
                },
            ]
        );
        const lines = csv.split(/\r?\n/);
        expect(lines[1]).toBe('Alice;100 €;Alice (100)');
    });

    it('sanitises injected formulas in cell values', () => {
        const csv = buildCsv(
            [{ name: '=cmd|"/c calc"!A1', amount: 10 }],
            COLS
        );
        // Papa quotes cells containing leading single quote; what matters is
        // that the cell starts with a quote so Excel treats it as text.
        expect(csv).toContain("'=cmd");
        expect(csv).not.toMatch(/^[^']*=cmd/m);
    });
});

describe('buildFilename', () => {
    it('appends an ISO date stamp to the prefix', () => {
        const filename = buildFilename('clients', new Date('2026-05-06T10:30:00Z'));
        expect(filename).toBe('clients_2026-05-06.csv');
    });
});
