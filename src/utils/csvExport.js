import Papa from 'papaparse';

const sanitizeCell = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    // Prevent CSV formula injection in spreadsheet apps (Excel, LibreOffice, Numbers).
    // Cells starting with =, +, -, @, tab or CR are interpreted as formulas.
    if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
    return str;
};

const buildFilename = (prefix) => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `${prefix}_${stamp}.csv`;
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
    const data = rows.map((row) => {
        const out = {};
        for (const { key, label, format } of columns) {
            const raw = typeof key === 'function' ? key(row) : row[key];
            out[label] = sanitizeCell(format ? format(raw, row) : raw);
        }
        return out;
    });

    const csv = Papa.unparse(data, { delimiter: ';' });
    triggerDownload(csv, buildFilename(filenamePrefix));
};
