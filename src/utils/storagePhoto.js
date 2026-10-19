// Lecture des octets d'une photo du bucket `project-photos`.
//
// Pourquoi pas un simple `fetch(urlPublique)` : l'appli installée met en
// cache les images du stockage pour les afficher hors réseau. Le cache garde
// la réponse chargée par la balise <img>, une réponse « opaque » que le code
// n'a pas le droit de lire. Une fois la photo affichée, un `fetch` de la même
// URL reçoit cette réponse et échoue (« Failed to fetch ») : la copie
// d'image se rabattait sur le lien, les photos manquaient dans les PDF.
// L'API de téléchargement du stockage passe par une autre adresse, que ce
// cache ne touche pas.

export const PHOTO_BUCKET = 'project-photos';
const PUBLIC_MARKER = `/storage/v1/object/public/${PHOTO_BUCKET}/`;

/** Chemin dans le bucket d'après l'URL publique (null si hors bucket). */
export const storagePathFromUrl = (url) => {
    const value = String(url ?? '');
    const idx = value.indexOf(PUBLIC_MARKER);
    if (idx === -1) return null;
    const path = value.slice(idx + PUBLIC_MARKER.length).split(/[?#]/)[0];
    try {
        return decodeURIComponent(path) || null;
    } catch {
        return path || null;
    }
};

/**
 * Octets d'une photo : téléchargement par l'API du stockage quand l'URL est
 * celle du bucket (réservé au propriétaire), sinon — ou en cas de refus — un
 * fetch classique.
 * @param {string} url
 * @returns {Promise<Blob>}
 */
export const fetchStoredPhoto = async (url) => {
    const path = storagePathFromUrl(url);
    if (path) {
        // Import différé : les générateurs de PDF importent ce module, et le
        // client Supabase exige ses variables d'environnement dès son chargement.
        const { supabase } = await import('./supabase');
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
        if (!error && data) return data;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Photo inaccessible');
    return res.blob();
};
