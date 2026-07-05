// Présentation client d'un devis (client_display_mode) — helpers partagés.
//
// Trois modes possibles :
//   • detailed     : ligne à ligne (défaut) ;
//   • grouped      : fournitures sans quantités ni prix unitaires (rendu PDF) ;
//   • poste_global : un poste fusionné par section (fusion CÔTÉ SERVEUR).
//
// En mode « poste_global », la fusion des lignes est faite exclusivement par le
// serveur (RPC get_client_facing_items → build_poste_global_items), pour garantir
// une source de vérité unique, le contrôle d'égalité somme-postes = somme-détail,
// et l'étanchéité aux champs internes. Le frontend ne réimplémente jamais la
// fusion : il demande au serveur la version que le client verra.

import { supabase } from './supabase';

// Défaut « à l'unité » (unité + section) — logique pure, testable sans Supabase.
export { isTechnicalSection, defaultPerUnit, isPerUnit } from './perUnit';

/**
 * Demande au serveur les items tels que le client les verra, selon le mode.
 * En mode poste_global, renvoie les postes fusionnés (contrôle d'égalité inclus
 * côté SQL — une incohérence remonte ici sous forme d'erreur). Les autres modes
 * renvoient les items inchangés (le rendu detailed/grouped reste côté PDF).
 *
 * @param {Array}  items Les lignes détaillées du devis (données artisan).
 * @param {string} mode  client_display_mode.
 * @returns {Promise<Array>} Les items à passer au générateur de PDF.
 */
export const clientFacingItems = async (items, mode) => {
  if (mode !== 'poste_global') return items;
  const { data, error } = await supabase.rpc('get_client_facing_items', {
    p_items: items ?? [],
    p_mode: mode,
  });
  if (error) throw error;
  return data ?? [];
};

/** Montant d'une ligne pour l'affichage : line_total (poste) sinon quantité × prix. */
export const lineAmount = (item) => {
  if (item?.line_total != null && item.line_total !== '') {
    return parseFloat(item.line_total) || 0;
  }
  return (parseFloat(item?.quantity) || 0) * (parseFloat(item?.price) || 0);
};
