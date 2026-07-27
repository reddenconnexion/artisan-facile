import { describe, it, expect } from 'vitest';
import {
    checklistSections,
    flatLines,
    isLineDone,
    toggleLine,
    toggleComponent,
    setAll,
    progressStats,
    lineMatches,
    mergeDone,
    mergeExtras,
    DEFAULT_SECTION,
} from './chantierProgress';

const items = [
    { id: 1, type: 'section', description: 'Cuisine' },
    { id: 2, type: 'material', description: 'Prise 16A', quantity: 4, unit: 'u', price: 25 },
    { id: 3, type: 'service', description: 'Pose tableau', quantity: 2, unit: 'h', price: 45 },
    { id: 4, type: 'section', description: 'Garage' },
    {
        id: 5, type: 'service', description: 'Éclairage garage', quantity: 1, unit: 'forfait', price: 300,
        components: [
            { id: 'a', description: 'Réglette LED', quantity: 2, unit: 'u', buying_price: 18 },
            { id: 'b', description: 'Interrupteur', quantity: 1, unit: 'u', buying_price: 6 },
        ],
    },
    { id: 6, type: 'material', description: 'Détecteur de mouvement', quantity: 1, unit: 'u', price: 90, is_optional: true },
];

describe('checklistSections', () => {
    it('groupe les lignes sous leur titre de section', () => {
        const sections = checklistSections(items);
        expect(sections.map((s) => s.title)).toEqual(['Cuisine', 'Garage']);
        expect(sections[0].lines.map((l) => l.description)).toEqual(['Prise 16A', 'Pose tableau']);
    });

    it('place les lignes sans section sous un titre par défaut', () => {
        const sections = checklistSections([{ id: 1, description: 'Dépose ancien tableau', price: 100 }]);
        expect(sections[0].title).toBe(DEFAULT_SECTION);
    });

    it('ignore les lignes vides et les sections sans ligne', () => {
        const sections = checklistSections([
            { id: 1, type: 'section', description: 'Vide' },
            { id: 2, type: 'section', description: 'Salon' },
            { id: 3, description: '', price: 0 },
            { id: 4, description: 'Point lumineux', quantity: 3, unit: 'u', price: 60 },
        ]);
        expect(sections).toHaveLength(1);
        expect(sections[0].title).toBe('Salon');
        expect(sections[0].lines).toHaveLength(1);
    });

    it('déplie les fournitures du chiffrage interne en sous-lignes', () => {
        const [, garage] = checklistSections(items);
        expect(garage.lines[0].components.map((c) => c.description))
            .toEqual(['Réglette LED', 'Interrupteur']);
        expect(garage.lines[0].components[0].key).toBe('comp:5:a');
    });

    it('marque les lignes optionnelles, le matériel et la main d\'œuvre au temps', () => {
        const lines = flatLines(checklistSections(items));
        const byName = Object.fromEntries(lines.map((l) => [l.description, l]));
        expect(byName['Détecteur de mouvement'].isOptional).toBe(true);
        expect(byName['Prise 16A'].type).toBe('material');
        expect(byName['Pose tableau'].isLabor).toBe(true);
        expect(byName['Prise 16A'].total).toBe(100);
    });

    it('reste stable sur des items absents ou invalides', () => {
        expect(checklistSections(null)).toEqual([]);
        expect(checklistSections([null, undefined])).toEqual([]);
    });
});

describe('cochage des lignes', () => {
    const sections = checklistSections(items);
    const prise = sections[0].lines[0];
    const garage = sections[1].lines[0];

    it('coche puis décoche une ligne simple', () => {
        const done = toggleLine({}, prise, '2026-07-27T08:00:00Z');
        expect(isLineDone(prise, done)).toBe(true);
        expect(done[prise.key]).toBe('2026-07-27T08:00:00Z');
        expect(isLineDone(prise, toggleLine(done, prise))).toBe(false);
    });

    it('propage la coche d\'une ligne groupée à ses fournitures', () => {
        const done = toggleLine({}, garage);
        garage.components.forEach((c) => expect(done[c.key]).toBeTruthy());
        const undone = toggleLine(done, garage);
        expect(Object.keys(undone)).toHaveLength(0);
    });

    it('considère la ligne faite quand toutes ses fournitures le sont', () => {
        let done = toggleComponent({}, garage, garage.components[0]);
        expect(isLineDone(garage, done)).toBe(false);
        done = toggleComponent(done, garage, garage.components[1]);
        expect(isLineDone(garage, done)).toBe(true);
    });

    it('libère la ligne parente quand on décoche une fourniture', () => {
        const all = toggleLine({}, garage);
        const partial = toggleComponent(all, garage, garage.components[0]);
        expect(isLineDone(garage, partial)).toBe(false);
        expect(partial[garage.components[1].key]).toBeTruthy();
    });

    it('coche tout sauf les options, et remet à zéro', () => {
        const done = setAll(sections, true);
        const optional = flatLines(sections).find((l) => l.isOptional);
        expect(done[optional.key]).toBeUndefined();
        expect(progressStats(sections, done).ratio).toBe(1);
        expect(setAll(sections, false)).toEqual({});
    });
});

describe('progressStats', () => {
    const sections = checklistSections(items);

    it('compte les feuilles : fournitures internes si présentes, sinon la ligne', () => {
        // Prise + Pose tableau + 2 fournitures du forfait garage = 4 ; l'option est hors décompte.
        const stats = progressStats(sections, {});
        expect(stats.totalUnits).toBe(4);
        expect(stats.doneUnits).toBe(0);
        expect(stats.optionalCount).toBe(1);
    });

    it('avance au rythme des coches', () => {
        const done = toggleLine({}, sections[0].lines[0]);
        const stats = progressStats(sections, done);
        expect(stats.doneUnits).toBe(1);
        expect(stats.ratio).toBeCloseTo(0.25);
        expect(stats.remainingLines.map((l) => l.description))
            .toEqual(['Pose tableau', 'Éclairage garage']);
    });

    it('chiffre le montant réalisé hors options', () => {
        const stats = progressStats(sections, {});
        expect(stats.totalAmount).toBe(100 + 90 + 300); // l'option à 90 € n'est pas comptée
        expect(stats.totalAmount).toBe(490);

        const done = toggleLine({}, sections[1].lines[0]);
        expect(progressStats(sections, done).doneAmount).toBe(300);
    });

    it('ne divise pas par zéro sur un devis vide', () => {
        const stats = progressStats([], {});
        expect(stats.ratio).toBe(0);
        expect(stats.amountRatio).toBe(0);
    });
});

describe('lineMatches', () => {
    const garage = checklistSections(items)[1].lines[0];

    it('trouve sans tenir compte des accents ni de la casse', () => {
        expect(lineMatches(garage, 'ECLAIRAGE')).toBe(true);
        expect(lineMatches(garage, 'éclairage garage')).toBe(true);
    });

    it('cherche aussi dans les fournitures internes', () => {
        expect(lineMatches(garage, 'réglette')).toBe(true);
    });

    it('exige tous les mots et renvoie tout sur une recherche vide', () => {
        expect(lineMatches(garage, 'garage cuisine')).toBe(false);
        expect(lineMatches(garage, '   ')).toBe(true);
    });
});

describe('fusion local / distant', () => {
    it('garde toutes les coches, avec l\'horodatage le plus ancien', () => {
        const merged = mergeDone(
            { 'line:1': '2026-07-27T10:00:00Z', 'line:2': '2026-07-27T11:00:00Z' },
            { 'line:1': '2026-07-27T09:00:00Z', 'line:3': '2026-07-27T12:00:00Z' },
        );
        expect(merged).toEqual({
            'line:1': '2026-07-27T09:00:00Z',
            'line:2': '2026-07-27T11:00:00Z',
            'line:3': '2026-07-27T12:00:00Z',
        });
    });

    it('dédoublonne les hors devis et respecte les suppressions', () => {
        const merged = mergeExtras(
            [{ id: 'a', description: 'Saignée', created_at: '1', updated_at: '1' }],
            [
                { id: 'a', description: 'Saignée mur porteur', created_at: '1', updated_at: '2' },
                { id: 'b', description: 'Déplacement prise', created_at: '2', updated_at: '2' },
                { id: 'c', description: 'Annulé', created_at: '3', updated_at: '3', deleted: true },
            ],
        );
        expect(merged.map((e) => e.description)).toEqual(['Saignée mur porteur', 'Déplacement prise']);
    });
});
