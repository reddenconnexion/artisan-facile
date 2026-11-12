// Lieu annoncé à voix haute au début d'une dictée : « Cuisine, trois prises à
// ajouter… », « Dans le garage, le tableau est à remplacer… ». Sur chantier,
// chercher la bonne pastille avant de parler est la manipulation de trop ; le
// lieu dit en premier suffit à ranger la dictée.
//
// Volontairement strict : seul le tout début de la dictée compte (après
// quelques mots de liaison), pour qu'une pièce citée au fil d'une phrase ne
// déplace rien. Module pur, testable sans React ni réseau.

/** Minuscules, sans accents : « Séjour » et « sejour » se valent. */
const fold = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const STOP = /[,.;:!?…—–\n]/;

/**
 * Découpe en mots, en retenant si une ponctuation suit chacun.
 * @returns {{word: string, stop: boolean}[]}
 */
const tokenize = (text, limit = 14) => {
    const tokens = [];
    const pattern = /([a-z0-9]+)([^a-z0-9]*)/g;
    // « W.C. » : l'abréviation ne doit pas se couper en deux mots.
    const folded = fold(text).replace(/\bw\.\s?c\b\.?/g, 'wc');
    let match = pattern.exec(folded);
    while (match && tokens.length < limit) {
        tokens.push({ word: match[1], stop: STOP.test(match[2]) });
        match = pattern.exec(folded);
    }
    return tokens;
};

const words = (name) => tokenize(name, 8).map((t) => t.word);

// Mots de liaison tolérés avant le lieu : « alors dans la cuisine… ».
const FILLERS = new Set([
    'alors', 'donc', 'bon', 'ben', 'euh', 'et', 'ok', 'voila', 'ensuite', 'puis', 'maintenant',
    'ici', 'la', 'le', 'les', 'l', 'un', 'une', 'du', 'de', 'des', 'd', 'dans', 'pour', 'au', 'aux',
    'a', 'en', 'sur', 'cote', 'niveau', 'concernant', 'on', 'est', 'je', 'suis', 'passe', 'passons',
    'nous', 'sommes', 'c',
]);
const MAX_FILLERS = 5;

// Pièces courantes absentes des pastilles : dites à voix haute, elles
// deviennent une pièce du relevé sous leur propre nom.
export const SPOKEN_ROOMS = [
    'Salon', 'Salle à manger', 'Salle d\'eau', 'Cellier', 'Dressing', 'Cave', 'Grenier', 'Sous-sol',
    'Véranda', 'Terrasse', 'Jardin', 'Atelier', 'Mezzanine', 'Palier', 'Escalier', 'Dégagement',
    'Hall', 'Chaufferie', 'Local technique', 'Abri de jardin', 'Étage', 'Rez-de-chaussée',
];

// Autres façons de dire un lieu connu. Un alias n'est retenu que si son lieu
// existe pour le métier (pastille, poste dicté ou pièce déjà relevée).
export const SPOKEN_ALIASES = {
    'Tableau électrique': ['tableau', 'coffret', 'coffret electrique', 'armoire electrique'],
    'Général': ['generalites', 'demande du client', 'demande client'],
    'Salle de bain': ['salle de bains', 'sdb'],
    WC: ['toilettes', 'toilette', 'w c'],
    'Extérieur': ['dehors', 'exterieurs'],
    Combles: ['comble'],
    'Séjour': ['piece de vie'],
};

const DIGITS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

const startsWithAt = (tokens, start, key) => {
    if (start + key.length > tokens.length) return false;
    return key.every((word, i) => (
        tokens[start + i].word === word
        // Pas de ponctuation au milieu du nom : « salle, de bain » n'en est pas un.
        && (i === key.length - 1 || !tokens[start + i].stop)
    ));
};

/**
 * Le lieu annoncé au début d'une dictée, ou '' s'il n'y en a pas.
 *
 * Ordre de priorité à nom égal : pièces déjà relevées (leur orthographe fait
 * foi), postes dictés, pastilles du métier, puis pièces courantes. Le nom le
 * plus long l'emporte : « Chambre parentale » avant « Chambre ».
 *
 * @param {string} text - transcription de la dictée
 * @param {object} places
 * @param {string[]} [places.zones]   - pièces déjà au relevé
 * @param {string[]} [places.topics]  - postes dictés (« Général », « Tableau électrique »)
 * @param {string[]} [places.presets] - pastilles de pièces du métier
 * @returns {string}
 */
export const detectSpokenZone = (text, { zones = [], topics = [], presets = [] } = {}) => {
    const tokens = tokenize(text);
    if (!tokens.length) return '';

    // Un candidat par façon de le dire ; `numbered` : « Chambre 2 » possible.
    const candidates = [];
    const seen = new Set();
    const add = (name, key, numbered) => {
        const id = key.join(' ');
        if (!key.length || seen.has(id)) return;
        seen.add(id);
        candidates.push({ name, key, numbered });
    };
    const clean = (list) => (list || []).map((n) => String(n ?? '').trim()).filter(Boolean);
    const known = [...clean(zones), ...clean(topics), ...clean(presets)];
    clean(zones).forEach((name) => add(name, words(name), false));
    clean(topics).forEach((name) => add(name, words(name), false));
    clean(presets).forEach((name) => add(name, words(name), true));
    SPOKEN_ROOMS.forEach((name) => add(name, words(name), true));
    for (const [target, aliases] of Object.entries(SPOKEN_ALIASES)) {
        const name = known.find((k) => fold(k) === fold(target));
        if (!name) continue;
        const numbered = !clean(topics).some((t) => fold(t) === fold(name));
        aliases.forEach((alias) => add(name, words(alias), numbered));
    }
    candidates.sort((a, b) => b.key.length - a.key.length);

    for (let start = 0; start <= Math.min(MAX_FILLERS, tokens.length - 1); start += 1) {
        const hit = candidates.find((c) => startsWithAt(tokens, start, c.key));
        if (hit) {
            // « Chambre 2, … » : le numéro fait partie du nom s'il est suivi d'une
            // pause. « Cuisine 3 prises » reste la cuisine.
            const last = tokens[start + hit.key.length - 1];
            const next = tokens[start + hit.key.length];
            const number = next && (/^[1-9]$/.test(next.word) ? Number(next.word) : DIGITS[next.word]);
            const isLastToken = start + hit.key.length === tokens.length - 1;
            if (hit.numbered && number && !last.stop && (next.stop || isLastToken) && !/\d$/.test(hit.name)) {
                const numberedName = `${hit.name} ${number}`;
                return clean(zones).find((z) => fold(z) === fold(numberedName)) || numberedName;
            }
            return hit.name;
        }
        if (!FILLERS.has(tokens[start].word)) break;
    }
    return '';
};
