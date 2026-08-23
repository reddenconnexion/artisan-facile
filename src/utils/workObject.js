// Objet des travaux : paragraphe de périmètre affiché sous le titre du devis.
//
// Le titre (quotes.title) reste le nom court du projet — il sert de nom de
// dossier projet, d'intitulé dans les emails et de base aux heuristiques de
// type (situation / clôture / acompte). L'objet des travaux porte la
// description : ce qui est compris, ce qui ne l'est pas, et les constats qui
// conditionnent le prix. C'est la référence du périmètre quand un avenant doit
// être justifié plus tard.
//
// Deux contraintes de mise en page, d'où ce module :
//   1. le bloc est rendu en un seul paragraphe — les retours à la ligne sont
//      aplatis — pour que sa hauteur ne dépende que du nombre de caractères ;
//   2. il est plafonné, sinon il repousse le tableau des prestations et fait
//      basculer le total en page 2 sur un devis court.

export const WORK_OBJECT_MAX_CHARS = 600;

// Aplatit en un paragraphe : espaces et retours à la ligne successifs deviennent
// une espace simple, les bords sont rognés.
export function normalizeWorkObject(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\s+/g, ' ').trim();
}

// Tronque sur une frontière de mot, sans couper au milieu d'un mot ni laisser
// une ponctuation orpheline avant les points de suspension.
export function capWorkObject(raw, max = WORK_OBJECT_MAX_CHARS) {
    const text = normalizeWorkObject(raw);
    if (text.length <= max) return text;

    // On garde une place pour le caractère de troncature.
    const slice = text.slice(0, max - 1);
    const lastSpace = slice.lastIndexOf(' ');
    // Un texte sans aucune espace (un seul « mot » très long) est coupé net :
    // mieux vaut un mot tronqué qu'un paragraphe vide.
    const kept = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    return `${kept.replace(/[\s.,;:!?—-]+$/, '')}…`;
}

// Nombre de caractères retenus (après aplatissement), pour le compteur du
// formulaire : c'est cette longueur-là qui est comparée au plafond.
export function workObjectLength(raw) {
    return normalizeWorkObject(raw).length;
}
