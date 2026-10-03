// Enregistrement des photos de chantier sur l'appareil (galerie du téléphone
// ou dossier Téléchargements de l'ordinateur).

const CATEGORY_SLUGS = { before: 'avant', during: 'pendant', after: 'apres' };

const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/gif': 'gif',
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * Nom de fichier lisible une fois dans la galerie :
 * « chantier-avant-2026-10-03-1.jpg » plutôt qu'un identifiant opaque.
 */
export const photoFileName = (photo = {}, index = 0, mimeType = 'image/jpeg') => {
    const parts = ['chantier'];
    const slug = CATEGORY_SLUGS[photo.category];
    if (slug) parts.push(slug);
    const date = photo.created_at ? new Date(photo.created_at) : null;
    if (date && !Number.isNaN(date.getTime())) {
        parts.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
    }
    parts.push(String(index + 1));
    const ext = EXTENSIONS[String(mimeType).split(';')[0].trim().toLowerCase()] || 'jpg';
    return `${parts.join('-')}.${ext}`;
};

const triggerDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Enregistre une ou plusieurs photos.
 *
 * Sur téléphone, la feuille de partage propose « Enregistrer les images » :
 * c'est le seul moyen fiable d'atterrir dans la galerie (iOS ignore
 * l'attribut download). Sur ordinateur, téléchargements successifs, espacés
 * pour que le navigateur ne bloque pas les suivants.
 *
 * @param {{ blob: Blob, name: string }[]} files
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export const savePhotoFiles = async (files) => {
    if (!files.length) return 'cancelled';
    const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
        const shareFiles = files.map(({ blob, name }) => new File([blob], name, { type: blob.type || 'image/jpeg' }));
        if (navigator.canShare?.({ files: shareFiles })) {
            try {
                await navigator.share({ files: shareFiles });
                return 'shared';
            } catch (err) {
                if (err?.name === 'AbortError') return 'cancelled';
                // Autre échec (geste utilisateur expiré…) : on retombe sur le téléchargement.
            }
        }
    }
    for (let i = 0; i < files.length; i++) {
        if (i > 0) await wait(350);
        triggerDownload(files[i].blob, files[i].name);
    }
    return 'downloaded';
};
