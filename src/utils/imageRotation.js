// Rotation d'images par quarts de tour, sur canvas.
//
// Sert à redresser une photo au moment de la prise (téléphone couché alors
// que l'écran est resté en portrait) comme après coup, sur une photo déjà
// enregistrée. Convention unique : degrés dans le sens des aiguilles d'une
// montre, comme `transform: rotate()` en CSS — l'aperçu et le fichier final
// tournent donc dans le même sens.

/** Ramène un angle quelconque à 0, 90, 180 ou 270. */
export const normalizeQuarterTurn = (deg) => {
    const n = Math.round((Number(deg) || 0) / 90) * 90;
    return ((n % 360) + 360) % 360;
};

/** Dimensions de l'image une fois tournée. */
export const rotatedSize = (width, height, deg) => {
    const turn = normalizeQuarterTurn(deg);
    return turn === 90 || turn === 270
        ? { width: height, height: width }
        : { width, height };
};

/**
 * Prépare `ctx` pour qu'un `drawImage(source, 0, 0, width, height)` dessine
 * l'image tournée de `deg` dans un canvas aux dimensions de `rotatedSize`.
 */
export const applyRotation = (ctx, width, height, deg) => {
    const turn = normalizeQuarterTurn(deg);
    if (turn === 90) {
        ctx.translate(height, 0);
        ctx.rotate(Math.PI / 2);
    } else if (turn === 180) {
        ctx.translate(width, height);
        ctx.rotate(Math.PI);
    } else if (turn === 270) {
        ctx.translate(0, width);
        ctx.rotate(-Math.PI / 2);
    }
};

const loadImage = (blob) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
});

/**
 * Tourne une image et la rend en JPEG. L'orientation EXIF éventuelle est déjà
 * appliquée par le navigateur au décodage : on tourne ce qui est affiché.
 * @param {Blob} blob
 * @param {number} deg - sens horaire
 * @param {object} [options] - { quality = 0.9, maxDim = 4096 }
 * @returns {Promise<Blob>}
 */
export const rotateImageBlob = async (blob, deg, { quality = 0.9, maxDim = 4096 } = {}) => {
    const img = await loadImage(blob);
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!w || !h) throw new Error('Image vide');
    // Plafond : un canvas géant dépasse la mémoire autorisée sur mobile.
    if (w > maxDim || h > maxDim) {
        const ratio = maxDim / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }
    const size = rotatedSize(w, h, deg);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    applyRotation(ctx, w, h, deg);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (out) => (out ? resolve(out) : reject(new Error('Conversion impossible'))),
            'image/jpeg',
            quality
        );
    });
};

/**
 * Style d'aperçu d'une rotation en attente (avant enregistrement). Sur un
 * quart de tour, la largeur affichée devient la hauteur : on borne l'image
 * en conséquence pour qu'elle tienne encore dans l'écran.
 */
export const rotationPreviewStyle = (deg) => {
    const turn = normalizeQuarterTurn(deg);
    if (!turn) return undefined;
    const quarter = turn === 90 || turn === 270;
    return {
        transform: `rotate(${turn}deg)`,
        transition: 'transform 150ms ease-out',
        ...(quarter ? { maxWidth: '85vh', maxHeight: '85vw' } : {}),
    };
};
