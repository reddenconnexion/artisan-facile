import { describe, it, expect } from 'vitest';
import { isTechnicalSection, defaultPerUnit, isPerUnit } from './perUnit';

// Ce miroir JS du défaut SQL alimente la case « à l'unité » de l'UI ; il DOIT
// coïncider avec build_poste_global_items (testé côté SQL dans posteGlobal.sql.test.js).

describe('isTechnicalSection', () => {
  it('reconnaît les sections d\'ensembles techniques', () => {
    for (const t of ['Tableau électrique', 'Coffret de communication', 'Armoire', 'GTL', 'Appareillage modulaire', 'Distribution']) {
      expect(isTechnicalSection(t), t).toBe(true);
    }
  });
  it('ne classe pas les sections de finition comme techniques', () => {
    for (const t of ['Prises et éclairage', 'Salle de bain', 'Cuisine', '', undefined]) {
      expect(isTechnicalSection(t), String(t)).toBe(false);
    }
  });
});

describe('defaultPerUnit', () => {
  it('pré-coche les unités countables hors section technique', () => {
    expect(defaultPerUnit('u', 'Prises et éclairage')).toBe(true);
    expect(defaultPerUnit('point', 'Éclairage')).toBe(true);
    expect(defaultPerUnit('pièce', undefined)).toBe(true);
  });
  it('ne pré-coche pas une unité non countable', () => {
    expect(defaultPerUnit('m', 'Prises et éclairage')).toBe(false);
    expect(defaultPerUnit('forfait', 'Éclairage')).toBe(false);
  });
  it('ne pré-coche jamais un composant d\'une section technique', () => {
    expect(defaultPerUnit('u', 'Tableau électrique')).toBe(false);
    expect(defaultPerUnit('u', 'Coffret')).toBe(false);
  });
});

describe('isPerUnit', () => {
  it('la surcharge explicite prime sur le défaut', () => {
    expect(isPerUnit({ unit: 'u', display_per_unit: false }, 'Prises')).toBe(false);
    expect(isPerUnit({ unit: 'u', display_per_unit: true }, 'Tableau électrique')).toBe(true);
  });
  it('à défaut, applique la règle unité + section', () => {
    expect(isPerUnit({ unit: 'u' }, 'Prises et éclairage')).toBe(true);
    expect(isPerUnit({ unit: 'u' }, 'Tableau électrique')).toBe(false);
  });
});
