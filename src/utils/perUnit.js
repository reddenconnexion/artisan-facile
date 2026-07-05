// Défaut « afficher à l'unité » d'une ligne matériel en présentation « poste
// global » — logique PURE (aucune dépendance), partagée par l'UI (bascule dans
// DevisForm) et miroir du défaut SQL de build_poste_global_items.
//
// ⚠️ Ces deux listes DOIVENT rester synchronisées avec la migration SQL
// (20260705140000_poste_global_section_aware_per_unit.sql). Toute divergence
// ferait diverger l'aperçu (calculé côté serveur) de l'état pré-coché de la case.

// Unités « comptées à l'unité » par le client (prises, spots, points lumineux…).
const PER_UNIT_UNITS = new Set([
  'u', 'unité', 'unite', 'pièce', 'piece', 'pce', 'pc', 'point', 'pt', 'points',
]);

// Sections « techniques » (ensembles/assemblages) dont les lignes matériel sont
// des COMPOSANTS, pas des articles vendus à l'unité : un tableau électrique et
// ses disjoncteurs/parafoudre/contacteur fusionnent dans le poste plutôt que de
// rester détaillés parce qu'ils sont en unité « u ». Liste volontairement courte
// et ajustable ; l'artisan peut toujours surcharger ligne par ligne.
const TECHNICAL_SECTION_RE =
  /(tableau|coffret|armoire|gtl|goulotte technique|distribution|modulaire|appareillage)/i;

/** Une section (par son titre) est-elle un ensemble technique/assemblage ? */
export const isTechnicalSection = (sectionTitle) =>
  TECHNICAL_SECTION_RE.test((sectionTitle || '').trim());

/** Unité « comptée à l'unité » par le client ? */
export const isCountableUnit = (unit) =>
  PER_UNIT_UNITS.has((unit || '').trim().toLowerCase());

/**
 * Valeur par défaut du flag « afficher à l'unité » pour une ligne matériel.
 * Déduite de l'unité ET de la section : une unité countable (u/pièce/point…)
 * est pré-cochée « à l'unité », SAUF si la ligne appartient à une section
 * technique (tableau…), où elle fusionne dans le poste. L'artisan peut surcharger
 * via item.display_per_unit.
 */
export const defaultPerUnit = (unit, sectionTitle) =>
  isCountableUnit(unit) && !isTechnicalSection(sectionTitle);

/**
 * État effectif « à l'unité » d'une ligne : surcharge explicite si présente,
 * sinon défaut déduit de l'unité et de la section.
 */
export const isPerUnit = (item, sectionTitle) =>
  typeof item?.display_per_unit === 'boolean'
    ? item.display_per_unit
    : defaultPerUnit(item?.unit, sectionTitle);
