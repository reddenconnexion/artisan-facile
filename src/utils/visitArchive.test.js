import { describe, it, expect } from 'vitest';
import {
    visitDateKey,
    visitTitle,
    visitReportNumber,
    visitPhotoPath,
    buildVisitRecord,
} from './visitArchive';

const DATE = new Date(2026, 7, 19, 9, 30); // 19 août 2026, heure locale

describe('visitDateKey', () => {
    it('rend la date locale, pas la date UTC', () => {
        expect(visitDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
        expect(visitDateKey(DATE)).toBe('2026-08-19');
    });
});

describe('visitTitle', () => {
    it('nomme la visite par son client et sa date', () => {
        expect(visitTitle({ clientName: 'Mme Dupont', date: DATE }))
            .toBe('Visite prédevis — Mme Dupont — 19/08/2026');
    });

    it('se rabat sur l\'adresse quand le client n\'est pas renseigné', () => {
        expect(visitTitle({ address: '12 rue des Lilas', date: DATE }))
            .toBe('Visite prédevis — 12 rue des Lilas — 19/08/2026');
    });

    it('reste lisible sans client ni adresse', () => {
        expect(visitTitle({ date: DATE })).toBe('Visite prédevis — 19/08/2026');
    });
});

describe('visitReportNumber / visitPhotoPath', () => {
    it('compose un numéro et un chemin stables', () => {
        expect(visitReportNumber(DATE, '4821')).toBe('VT-2026-4821');
        expect(visitPhotoPath('user-1', 'abc')).toBe('visites/user-1/abc.jpg');
    });
});

describe('buildVisitRecord', () => {
    const base = {
        userId: 'user-1',
        clientId: 'cli-9',
        clientName: 'Mme Dupont',
        address: '12 rue des Lilas',
        reportText: '# COMPTE RENDU DE VISITE PRÉDEVIS\n…',
        date: DATE,
        reportNumber: 'VT-2026-4821',
    };

    it('compose une ligne de rapport de visite exploitable', () => {
        const record = buildVisitRecord({
            ...base,
            survey: { demande: 'refaire le tableau' },
            timelineLines: ['09:05 · Cuisine'],
            transcripts: { 'seg-1': 'le client veut six prises' },
            photos: [{ url: 'https://…/a.jpg', path: 'visites/user-1/a.jpg', name: 'visite.jpg' }],
        });

        expect(record).toMatchObject({
            user_id: 'user-1',
            client_id: 'cli-9',
            client_name: 'Mme Dupont',
            intervention_address: '12 rue des Lilas',
            report_type: 'site_visit',
            report_number: 'VT-2026-4821',
            status: 'draft',
            date: '2026-08-19',
        });
        expect(record.title).toBe('Visite prédevis — Mme Dupont — 19/08/2026');
        expect(record.description).toContain('COMPTE RENDU DE VISITE PRÉDEVIS');
        expect(record.photos).toHaveLength(1);

        const notes = JSON.parse(record.notes);
        expect(notes.source).toBe('visite_predevis');
        expect(notes.survey.demande).toBe('refaire le tableau');
        expect(notes.timeline).toEqual(['09:05 · Cuisine']);
        expect(notes.transcripts['seg-1']).toBe('le client veut six prises');
    });

    it('n\'écrit pas de sections vides dans les notes', () => {
        const notes = JSON.parse(buildVisitRecord(base).notes);
        expect(notes).toEqual({ source: 'visite_predevis' });
    });

    it('met à null les champs vides plutôt que des chaînes vides', () => {
        const record = buildVisitRecord({
            ...base, clientId: '', clientName: '  ', address: '', reportText: '   ',
        });
        expect(record.client_id).toBeNull();
        expect(record.client_name).toBeNull();
        expect(record.intervention_address).toBeNull();
        expect(record.description).toBeNull();
    });

    it('ne conserve jamais l\'audio', () => {
        const record = buildVisitRecord({ ...base, transcripts: { 'seg-1': 'texte' } });
        expect(JSON.stringify(record)).not.toContain('blob');
        expect(record).not.toHaveProperty('audio');
    });
});
