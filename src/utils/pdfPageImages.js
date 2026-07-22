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
 *   dans ce cas, sans callback onPage, les URLs déjà créées sont révoquées et
 *   [] est renvoyé.
 * @param {(url: string, index: number) => void} [onPage] Appelé après chaque
 *   page rendue, pour un affichage progressif (la page 1 apparaît sans attendre
 *   la fin du devis). Quand fourni, l'appelant possède le cycle de vie des URLs
 *   (aucune révocation automatique à l'annulation).
 * @returns {Promise<string[]>} blob URLs des pages, à révoquer par l'appelant.
 */
export const renderPdfBlobToPageImages = async (pdfBlob, isCancelled = () => false, onPage = null) => {
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
        // canvas.toBlob peut rappeler avec null (mémoire) et, sur certains
        // navigateurs mobiles, tarder ; on borne l'attente puis on se rabat sur
        // toDataURL pour ne jamais bloquer le rendu d'une page sur la suivante.
        const pageBlob = await new Promise(resolve => {
            let settled = false;
            const done = (b) => { if (!settled) { settled = true; resolve(b); } };
            const timer = setTimeout(() => done(null), 4000);
            canvas.toBlob(b => { clearTimeout(timer); done(b); }, 'image/jpeg', 0.85);
        });
        const url = pageBlob
            ? URL.createObjectURL(pageBlob)
            : canvas.toDataURL('image/jpeg', 0.85);
        urls.push(url);
        // Toujours notifier (même si annulé entre-temps) pour que l'appelant
        // enregistre l'URL et puisse la révoquer au nettoyage.
        if (onPage) onPage(url, i - 1);
    }
    if (isCancelled() && !onPage) {
        urls.forEach(u => URL.revokeObjectURL(u));
        return [];
    }
    return urls;
};
