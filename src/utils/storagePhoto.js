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

export const PHOTO_MISSING = 'PHOTO_MISSING';

/**
 * Erreur levée quand le fichier n'existe plus dans le bucket. La vignette
 * peut pourtant encore s'afficher, servie par le cache de l'appli : sans un
 * message à part, l'artisan réessaie sans comprendre.
 */
export const photoMissingError = () => Object.assign(
    new Error("Le fichier de cette photo n'existe plus sur le serveur (supprimé). Elle reste peut-être visible depuis le cache de l'appareil : enregistrez-la puis ajoutez-la de nouveau."),
    { code: PHOTO_MISSING },
);

/**
 * Le téléchargement a-t-il échoué parce que l'objet n'existe pas ? Le
 * stockage répond 400 avec `statusCode: "404"` dans le corps.
 */
export const isMissingObjectError = async (error) => {
    const res = error?.originalError;
    if (res?.status === 404) return true;
    if (res?.status !== 400 || typeof res.json !== 'function') return false;
    try {
        const body = await res.json();
        return String(body?.statusCode) === '404' || body?.error === 'not_found';
    } catch {
        return false;
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
    let missing = false;
    if (path) {
        // Import différé : les générateurs de PDF importent ce module, et le
        // client Supabase exige ses variables d'environnement dès son chargement.
        const { supabase } = await import('./supabase');
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
        if (!error && data) return data;
        missing = await isMissingObjectError(error);
    }
    // Même pour un fichier disparu, on tente l'URL publique : une copie encore
    // en cache dans le navigateur suffit à sauver la photo.
    let res;
    try {
        res = await fetch(url);
    } catch (err) {
        if (missing) throw photoMissingError();
        throw err;
    }
    if (!res.ok) throw missing ? photoMissingError() : new Error('Photo inaccessible');
    return res.blob();
};
