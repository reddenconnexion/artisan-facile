// Mode terrain comme écran d'accueil sur mobile.
//
// Sur le téléphone, l'artisan ouvre l'appli sur le chantier : il doit tomber
// directement sur les gros boutons du mode terrain, pas sur le tableau de bord
// de bureau. On ne redirige qu'une fois par session (ouverture de l'appli),
// sinon le bouton « Bureau » du mode terrain ramènerait aussitôt au terrain.
// Préférence désactivable depuis le mode terrain lui-même.

const PREF_KEY = 'terrain_home';          // 'on' (défaut) | 'off'
const SESSION_KEY = 'terrain_home_opened';

/**
 * Décision pure : faut-il ouvrir le mode terrain à la place du tableau de bord ?
 * @param {{ isMobile: boolean, pref: string|null, alreadyOpened: boolean }} ctx
 */
export const shouldOpenTerrainHome = ({ isMobile, pref, alreadyOpened }) =>
    !!isMobile && pref !== 'off' && !alreadyOpened;

/** Téléphone : petit écran ET pointeur tactile (exclut une fenêtre étroite sur PC). */
export const isPhoneDevice = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 767px)').matches
        && window.matchMedia('(pointer: coarse)').matches;
};

const read = (storage, key) => {
    try { return storage.getItem(key); } catch { return null; }
};
const write = (storage, key, value) => {
    try { storage.setItem(key, value); } catch { /* stockage indisponible */ }
};

export const isTerrainHomeEnabled = () =>
    typeof window !== 'undefined' && read(window.localStorage, PREF_KEY) !== 'off';

export const setTerrainHomeEnabled = (enabled) => {
    if (typeof window === 'undefined') return;
    write(window.localStorage, PREF_KEY, enabled ? 'on' : 'off');
};

/** À appeler à l'affichage du mode terrain : la session a « vu » l'accueil terrain. */
export const markTerrainHomeOpened = () => {
    if (typeof window === 'undefined') return;
    write(window.sessionStorage, SESSION_KEY, '1');
};

/** Lecture des stockages du navigateur pour la décision de redirection. */
export const shouldRedirectToTerrain = () => {
    if (typeof window === 'undefined') return false;
    return shouldOpenTerrainHome({
        isMobile: isPhoneDevice(),
        pref: read(window.localStorage, PREF_KEY),
        alreadyOpened: read(window.sessionStorage, SESSION_KEY) === '1',
    });
};
