// Renders the artisan logo onto a square canvas with rounded corners and
// returns the resulting PNG data URL. Falls back to a centered "contain"
// fit so non-square logos aren't deformed.
export const buildRoundedLogoDataUrl = async (url, sizePx = 256, radiusRatio = 0.18) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        // Garde-fou anti-blocage : sur mobile (réseau instable), un <img> dont
        // le chargement stagne ne déclenche parfois ni onload ni onerror, ce qui
        // ferait tourner indéfiniment le spinner de la page publique du devis.
        // On borne l'attente et on bascule alors sur le repli (logo brut / sans
        // logo) au lieu de figer toute la génération du PDF.
        const timer = setTimeout(() => reject(new Error('logo load timeout')), 6000);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('logo load error')); };
        img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    const r = sizePx * radiusRatio;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(sizePx - r, 0);
    ctx.quadraticCurveTo(sizePx, 0, sizePx, r);
    ctx.lineTo(sizePx, sizePx - r);
    ctx.quadraticCurveTo(sizePx, sizePx, sizePx - r, sizePx);
    ctx.lineTo(r, sizePx);
    ctx.quadraticCurveTo(0, sizePx, 0, sizePx - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    const scale = Math.min(sizePx / img.width, sizePx / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (sizePx - w) / 2, (sizePx - h) / 2, w, h);
    return canvas.toDataURL('image/png');
};
