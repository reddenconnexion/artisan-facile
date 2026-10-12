// Mise en page de l'impression des étiquettes de tableau (A4).

// Largeur imprimable = largeur du papier - 2×15 mm de marges (cf. @page dans
// printStyles() du module Étiquettes). Une rangée plus large repasse à la
// ligne (flex-wrap).
export const PRINT_MARGIN_MM = 15;
export const ORIENTATIONS = {
  portrait: { label: "A4 portrait", pageWidthMm: 210 - 2 * PRINT_MARGIN_MM },
  landscape: { label: "A4 paysage", pageWidthMm: 297 - 2 * PRINT_MARGIN_MM },
};

// Découpe d'une rangée en lignes imprimées, comme le fait flex-wrap : une
// étiquette qui ne tient plus sur la ligne passe à la suivante.
export function printLineWidths(items, modulePitch, pageWidthMm) {
  const lines = [];
  let line = 0;
  for (const { circuit } of items) {
    const w = (circuit.modules || 1) * modulePitch;
    if (line > 0 && line + w > pageWidthMm) {
      lines.push(line);
      line = 0;
    }
    line += w;
  }
  if (line > 0) lines.push(line);
  return lines;
}

// Sens de feuille « Auto » : celui qui coupe le moins les rangées (nombre
// total de lignes imprimées). À égalité, le portrait, qui loge plus de
// rangées par feuille. Ex. : rangées de 13 modules → paysage (une ligne
// chacune, 2 en portrait) ; rangées de 18 modules → portrait (2 lignes dans
// les deux sens, 10 + 8 au lieu de 14 + 4, et moins de feuilles).
export function pickPrintOrientation(rows, modulePitch) {
  const count = (key) =>
    rows.reduce((n, r) => n + printLineWidths(r.items, modulePitch, ORIENTATIONS[key].pageWidthMm).length, 0);
  return count("landscape") < count("portrait") ? "landscape" : "portrait";
}
