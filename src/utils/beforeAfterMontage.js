// Montage avant/après, 1200×800 à l'échelle 1. Même dessin pour l'aperçu
// (scale 0.5) et pour l'image exportée : l'aperçu montre exactement ce qui
// sera téléchargé. Sans recadrage choisi, chaque photo est centrée.
export const drawBeforeAfter = (canvas, imgBefore, imgAfter, cropBefore, cropAfter, scale = 1) => {
    const ctx = canvas.getContext('2d');
    const width = 1200 * scale;
    const height = 800 * scale;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#111827';
    ctx.font = `bold ${36 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('AVANT / APRÈS', width / 2, 50 * scale);

    const padding = 20 * scale;
    const top = 80 * scale;
    const imgWidth = (width - padding * 3) / 2;
    const imgHeight = height - 100 * scale - padding;

    const drawPhoto = (img, crop, x) => {
        if (crop) {
            ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, x, top, imgWidth, imgHeight);
            return;
        }
        const aspectRatio = imgWidth / imgHeight;
        const imgRatio = img.width / img.height;
        let sx, sy, sw, sh;
        if (imgRatio > aspectRatio) {
            sh = img.height;
            sw = img.height * aspectRatio;
            sy = 0;
            sx = (img.width - sw) / 2;
        } else {
            sw = img.width;
            sh = img.width / aspectRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, top, imgWidth, imgHeight);
    };
    drawPhoto(imgBefore, cropBefore, padding);
    drawPhoto(imgAfter, cropAfter, padding * 2 + imgWidth);

    ctx.fillStyle = '#6B7280';
    ctx.font = `${14 * scale}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('Généré par Artisan Facile', width - padding, height - 10 * scale);
};
