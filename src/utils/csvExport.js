import Papa from 'papaparse';

/**
 * Prevent CSV formula injection in spreadsheet apps (Excel, LibreOffice, Numbers).
 * Cells starting with =, +, -, @, tab or CR are interpreted as formulas — we
 * prefix them with a single quote so spreadsheet apps treat the cell as text.
 * Exported for testability.
 */
export const sanitizeCell = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
    return str;
};

export const buildFilename = (prefix, now = new Date()) => {
    const stamp = now.toISOString().slice(0, 10);
    return `${prefix}_${stamp}.csv`;
};

/**
 * Build a CSV string from rows + column descriptors. Pure function: no DOM,
 * no download — easy to test. Use exportToCSV for the full download flow.
 */
export const buildCsv = (rows, columns) => {
    const data = rows.map((row) => {
        const out = {};
        for (const { key, label, format } of columns) {
            const raw = typeof key === 'function' ? key(row) : row[key];
            out[label] = sanitizeCell(format ? format(raw, row) : raw);
        }
        return out;
    });
    return Papa.unparse(data, { delimiter: ';' });
};

const triggerDownload = (csv, filename) => {
    // BOM so Excel detects UTF-8 correctly on French locales
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportToCSV = (rows, columns, filenamePrefix) => {
    const csv = buildCsv(rows, columns);
    triggerDownload(csv, buildFilename(filenamePrefix));
};
