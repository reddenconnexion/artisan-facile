// Export des étiquettes de tableau pour une Cricut (fonction « Imprimer puis
// découper » de Design Space).
//
// Chaque rangée devient une bande d'étiquettes bord à bord, exportée en PNG
// (fond blanc opaque : Design Space découpe le contour du rectangle). Une
// bande ne peut pas dépasser la zone « Imprimer puis découper » de la
// Cricut Maker 3 (6,75 × 9,25 pouces ≈ 171 × 235 mm) : une rangée plus
// longue est partagée en morceaux de longueurs équilibrées (ex. 18 modules
// → 9 + 9). Un morceau plus long que 171 mm est tourné d'un quart de tour
// pour tenir dans la hauteur de la zone.

export const CRICUT_PTC_MAX_MM = { short: 171, long: 234 };

// Résolution des PNG (Design Space réduit les images trop lourdes, 300 ppp
// suffit largement pour du texte de quelques millimètres).
export const CRICUT_DPI = 300;
const PX_PER_MM = CRICUT_DPI / 25.4;

const itemWidthMm = (item, modulePitch) => (item.circuit.modules || 1) * modulePitch;

/**
 * Découpe les étiquettes d'une rangée en morceaux de longueur ≤ maxMm,
 * en équilibrant les longueurs (18 modules → 9 + 9 plutôt que 13 + 5).
 * Retourne un tableau de tableaux d'items (ordre conservé).
 */
export function splitRowForCricut(items, modulePitch, maxMm = CRICUT_PTC_MAX_MM.long) {
  if (!items.length) return [];
  const widths = items.map((it) => itemWidthMm(it, modulePitch));
  const total = widths.reduce((a, b) => a + b, 0);
  const minPieces = Math.max(1, Math.ceil(total / maxMm));

  // On cherche le plus petit nombre de morceaux n (≥ minPieces) tel qu'un
  // remplissage glouton avec la limite total/n (arrondie au-dessus, bornée à
  // maxMm et à l'étiquette la plus large) donne au plus n morceaux.
  for (let n = minPieces; n <= items.length; n++) {
    const limit = Math.min(maxMm, Math.max(Math.max(...widths), Math.ceil(total / n / modulePitch) * modulePitch));
    const pieces = [];
    let current = [];
    let len = 0;
    items.forEach((it, i) => {
      if (current.length && len + widths[i] > limit + 1e-6) {
        pieces.push(current);
        current = [];
        len = 0;
      }
      current.push(it);
      len += widths[i];
    });
    if (current.length) pieces.push(current);
    if (pieces.length <= n) return pieces;
  }
  return items.map((it) => [it]);
}

/**
 * Liste des bandes à exporter pour tout le tableau.
 * rows : [{ items: [{ circuit, slot }], used }] (cf. EtiquettesTableau).
 */
export function buildCricutStrips(rows, dims) {
  const strips = [];
  rows.forEach((row, r) => {
    const pieces = splitRowForCricut(row.items, dims.modulePitch);
    pieces.forEach((items, p) => {
      const lengthMm = items.reduce((a, it) => a + itemWidthMm(it, dims.modulePitch), 0);
      const rotated = lengthMm > CRICUT_PTC_MAX_MM.short;
      strips.push({
        rowIndex: r + 1,
        pieceIndex: p + 1,
        pieceCount: pieces.length,
        items,
        lengthMm,
        heightMm: dims.height,
        rotated,
        // Taille à saisir dans Design Space (après import, avant impression).
        widthMm: rotated ? dims.height : lengthMm,
        tallMm: rotated ? lengthMm : dims.height,
      });
    });
  });
  return strips;
}

export function cricutStripFileName(strip, clientName = "") {
  const base = (clientName || "tableau").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "tableau";
  const piece = strip.pieceCount > 1 ? `-${strip.pieceIndex}sur${strip.pieceCount}` : "";
  const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
  return `etiquettes-${base}-rangee${strip.rowIndex}${piece}-${fmt(strip.widthMm)}x${fmt(strip.tallMm)}mm.png`;
}

/* ─── Rendu canvas ─────────────────────────────────────────────────────── */

function loadSvgImage(markup) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

// Découpe le libellé en 1 ou 2 lignes et cherche la plus grande police qui
// tient dans maxW × maxH (même logique que FitText à l'écran).
function fitText(ctx, text, maxW, maxH, fontFamily, maxPx) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const layout = (size) => {
    ctx.font = `700 ${size}px ${fontFamily}`;
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    const lineH = size * 1.1;
    const fits = lines.every((l) => ctx.measureText(l).width <= maxW) && lines.length * lineH <= maxH;
    return { lines, lineH, fits };
  };
  let lo = 4;
  let hi = maxPx;
  let best = layout(lo);
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const res = layout(mid);
    if (res.fits) {
      best = { ...res, size: mid };
      lo = mid;
    } else hi = mid;
  }
  return { size: best.size ?? lo, lines: best.lines, lineH: best.lineH };
}

/**
 * Dessine une bande en PNG. `categoryOf(circuit)` renvoie { color, unit,
 * iconSvg } où iconSvg est le balisage SVG de l'icône (stroke currentColor).
 */
export async function renderCricutStrip(strip, dims, categoryOf, fontFamily = "sans-serif") {
  const mm = (v) => v * PX_PER_MM;
  const lengthPx = Math.round(mm(strip.lengthMm));
  const heightPx = Math.round(mm(dims.height));

  const canvas = document.createElement("canvas");
  canvas.width = strip.rotated ? heightPx : lengthPx;
  canvas.height = strip.rotated ? lengthPx : heightPx;
  const ctx = canvas.getContext("2d");
  if (strip.rotated) {
    // Lecture de bas en haut : la bande se remet à l'endroit d'un quart de
    // tour vers la droite après découpe.
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lengthPx, heightPx);

  const line = Math.max(2, Math.round(mm(0.25)));
  let x = 0;
  for (const { circuit, slot } of strip.items) {
    const w = mm(itemWidthMm({ circuit }, dims.modulePitch));
    if (!circuit.isSpacer) {
      const cat = categoryOf(circuit);
      // Bandeau de couleur
      ctx.fillStyle = cat.color;
      ctx.fillRect(x, 0, w, mm(0.9));
      // Repère rangée.emplacement
      ctx.fillStyle = "#64748b";
      ctx.font = `700 ${mm(1.6)}px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(`${strip.rowIndex}.${slot}`, x + mm(0.6), mm(1.3));
      // Icône
      const iconSize = Math.max(mm(3), heightPx * 0.2);
      try {
        const img = await loadSvgImage(cat.iconSvg.replace(/currentColor/g, cat.color));
        ctx.drawImage(img, x + (w - iconSize) / 2, mm(1.6), iconSize, iconSize);
      } catch {
        // Icône indisponible : le libellé suffit.
      }
      // Calibre en bas
      const subSize = mm(1.9);
      ctx.fillStyle = "#475569";
      ctx.font = `500 ${subSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const modules = circuit.modules || 1;
      ctx.fillText(
        `${circuit.breaker} ${cat.unit || "A"}${modules > 1 ? ` · ${modules}P` : ""}`,
        x + w / 2,
        heightPx - mm(0.8)
      );
      // Libellé ajusté entre l'icône et le calibre
      const top = mm(1.6) + iconSize + mm(0.5);
      const bottom = heightPx - mm(0.8) - subSize - mm(0.4);
      const fit = fitText(ctx, circuit.label, w - mm(1.2), bottom - top, fontFamily, mm(6));
      ctx.fillStyle = "#0f172a";
      ctx.font = `700 ${fit.size}px ${fontFamily}`;
      ctx.textBaseline = "top";
      const blockH = fit.lines.length * fit.lineH;
      let y = top + (bottom - top - blockH) / 2;
      for (const l of fit.lines) {
        ctx.fillText(l, x + w / 2, y);
        y += fit.lineH;
      }
    }
    // Séparation entre étiquettes (guide de coupe au cutter si besoin)
    if (x > 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(x - line / 2, 0, line, heightPx);
    }
    x += w;
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
