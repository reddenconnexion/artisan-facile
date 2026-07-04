import * as pdfjsLib from 'pdfjs-dist';

// Rendu d'un PDF (blob) en images de pages, pour les navigateurs qui
// n'affichent pas les PDF blob: dans une <iframe> : iOS/iPadOS (qui ne rend
// que la première page, y compris sur iPad qui se déclare comme un Mac) et
// certaines versions d'Android Chrome. Utilisé par le lien public /q/:token
// et par l'aperçu avant envoi par email.

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/** Appareil iOS/iPadOS — l'iframe n'y affiche que la première page du PDF. */
export const isIosLikeDevice = () =>
    typeof navigator !== 'undefined' && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

/**
 * Rend chaque page d'un PDF en JPEG (blob URL).
 *
 * On passe les octets bruts à pdfjs (plus fiable que les blob URLs selon les
 * navigateurs mobiles) et on émet du JPEG via canvas.toBlob pour limiter la
 * mémoire sur les devis multi-pages.
 *
 * @param {Blob} pdfBlob PDF généré (jsPDF output 'blob')
 * @param {() => boolean} [isCancelled] Interrompt le rendu (démontage React) —
 *   dans ce cas les URLs déjà créées sont révoquées et [] est renvoyé.
 * @returns {Promise<string[]>} blob URLs des pages, à révoquer par l'appelant.
 */
export const renderPdfBlobToPageImages = async (pdfBlob, isCancelled = () => false) => {
    const arrayBuffer = await pdfBlob.arrayBuffer();
    if (isCancelled()) return [];
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.min(window.innerWidth, 1200);
    const urls = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        if (isCancelled()) break;
        const page = await pdf.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = (targetWidth / baseViewport.width) * dpr;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const pageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (pageBlob) urls.push(URL.createObjectURL(pageBlob));
    }
    if (isCancelled()) {
        urls.forEach(u => URL.revokeObjectURL(u));
        return [];
    }
    return urls;
};
