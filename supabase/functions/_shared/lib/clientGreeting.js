// Salutation des emails client à partir de la fiche client.
//
// La civilité se choisit sur la fiche (champ `civility` : 'm', 'mme',
// 'm_et_mme'). Les fiches plus anciennes peuvent l'avoir en tête du nom
// (« M. Cohignac Erwan », « madame Dupont »…), elle est alors reconnue aussi.
//   - Avec une civilité : civilité + nom de famille seul (« Bonjour Mme Lafitte »).
//   - Sans civilité : prénom puis nom (« Bonjour Marie Lafitte »).
// Le nom de famille est le mot écrit en MAJUSCULES quand il y en a un ; sinon,
// le premier mot (convention « Nom Prénom »), sauf s'il s'agit d'un prénom
// courant (« Marie Dupont » reste tel quel). Les NOMS en majuscules sont remis
// en minuscules (« LAFITTE » → « Lafitte »). Les sociétés et les noms qu'on ne
// sait pas découper (plus de deux mots sans repère) ne sont pas réordonnés.

/** Choix proposés sur la fiche client. */
export const CIVILITY_OPTIONS = [
    { value: 'm', label: 'M.' },
    { value: 'mme', label: 'Mme' },
    { value: 'm_et_mme', label: 'M. et Mme' },
];

const CIVILITY_LABELS = {
    m: { fr: 'M.', en: 'Mr' },
    mme: { fr: 'Mme', en: 'Mrs' },
    m_et_mme: { fr: 'M. et Mme', en: 'Mr and Mrs' },
};

const CIVILITIES = [
    // Les formes composées d'abord, sinon « M. et Mme » matcherait « M. » seul.
    { re: /^(?:monsieur|mr\.?|m\.?)\s+et\s+(?:madame|mme\.?)\s+/i, fr: 'M. et Mme', en: 'Mr and Mrs' },
    { re: /^(?:monsieur|mr\.?|m\.?)\s+/i, fr: 'M.', en: 'Mr' },
    { re: /^(?:madame|mme\.?)\s+/i, fr: 'Mme', en: 'Mrs' },
    { re: /^(?:mademoiselle|mlle\.?)\s+/i, fr: 'Mlle', en: 'Miss' },
];

// Sociétés, collectivités, syndics… : on ne touche ni à l'ordre ni à la casse.
const COMPANY_RE = /\b(sarl|sas|sasu|eurl|sci|sa|snc|scop|scp|ei|eirl|gaec|earl|ste|soci[ée]t[ée]|entreprise|ets|[ée]tablissements?|mairie|commune|syndic|copropri[ée]t[ée]|agence|cabinet|association|asso|groupe|holding|immobili[eè]re?|office|camping|h[ôo]tel|restaurant|garage|boulangerie|ehpad|[ée]cole|coll[èe]ge|lyc[ée]e|club|conseil|d[ée]partement|r[ée]gion|cie)\b|[&@]|\d/i;

// Prénoms courants : évite d'inverser « Marie Dupont » saisi « Prénom Nom ».
const COMMON_FIRST_NAMES = new Set(`
alain alexandre alexis alice alicia amandine amelie anais andre andree angelique anne annick annie antoine arnaud arthur aurelie aurelien baptiste beatrice benjamin benoit bernadette bernard brigitte bruno camille carole caroline catherine cecile celine chantal charles charlotte christian christiane christine christophe claire claude claudine clement colette corinne cyril damien daniel danielle david delphine denis denise didier dominique edith elisabeth elise elodie emilie emma emmanuel emmanuelle eric estelle etienne eve fabien fabienne fabrice florence florian franck francois francoise frederic gabriel gael genevieve georges gerald gerard gilbert gilles gisele guillaume guy helene henri herve hugo hugues isabelle jacqueline jacques jean jeanne jeremy jerome joel johan jonathan joseph josette josiane julie julien juliette justine karine kevin laetitia laura laurence laurent lea leo liliane lionel louis louise luc lucas lucie ludovic manon marc marcel marguerite marie marine martine mathieu mathilde matthieu maurice maxime melanie michel micheline michele mickael monique muriel nadine nathalie nicolas nicole noel odette odile olivier pascal pascale patrice patricia patrick paul paulette philippe pierre quentin raymond regis remi renee richard robert roger roland romain sabine sandra sandrine sebastien serge simone solange sophie stephane stephanie suzanne sylvain sylvie therese thierry thomas valerie vanessa veronique victor vincent virginie xavier yann yannick yves yvette yvonne
`.trim().split(/\s+/));

const normalize = (word) => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isFirstName = (word) => word.split('-').every(part => COMMON_FIRST_NAMES.has(normalize(part)));

// « LAFITTE » / « DUPONT-MOREL » / « D'ARTAGNAN » : au moins deux lettres, toutes en majuscules.
const isUpperWord = (word) => /\p{L}.*\p{L}/u.test(word) && word === word.toUpperCase() && word !== word.toLowerCase();

const capitalizeWord = (word) => word.charAt(0).toUpperCase() + word.slice(1);
// « LAFITTE » → « Lafitte », « JEAN-PIERRE » → « Jean-Pierre », « dupont » → « Dupont ».
const nameCase = (word) => {
    const base = isUpperWord(word) ? word.toLowerCase() : word;
    return base.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
};

/**
 * Découpe « NOM Prénom » en { lastName, firstName }, ou null si le nom ne se
 * laisse pas découper avec assez de certitude.
 */
const splitPersonName = (words) => {
    if (words.length === 1) return { lastName: nameCase(words[0]), firstName: '' };
    const upper = words.filter(isUpperWord);
    const lower = words.filter(w => !isUpperWord(w));
    if (upper.length && lower.length) {
        return { lastName: upper.map(nameCase).join(' '), firstName: lower.map(capitalizeWord).join(' ') };
    }
    if (words.length !== 2) return null;
    const [a, b] = words;
    // « Marie Dupont » : saisi « Prénom Nom », on garde l'ordre.
    if (isFirstName(a) && !isFirstName(b)) return { lastName: nameCase(b), firstName: nameCase(a) };
    return { lastName: nameCase(a), firstName: nameCase(b) };
};

// Nom de famille seul, à placer après la civilité.
const lastNameOf = (words) => {
    const upper = words.filter(isUpperWord);
    if (upper.length && upper.length < words.length) return upper.map(nameCase).join(' ');
    if (words.length === 2 && isFirstName(words[0]) && !isFirstName(words[1])) return nameCase(words[1]);
    return nameCase(words[0]);
};

/**
 * @param {string} name   nom de la fiche client
 * @param {'fr'|'en'} [lang]
 * @param {string} [civility] civilité choisie sur la fiche ('m', 'mme', 'm_et_mme')
 */
export const clientGreetingName = (name, lang = 'fr', civility = null) => {
    let rest = (name || '').trim().replace(/\s+/g, ' ');
    if (!rest) return '';

    // Civilité saisie en tête du nom (fiches anciennes) : on la retire du nom.
    let prefixLabel = null;
    for (const c of CIVILITIES) {
        const match = rest.match(c.re);
        if (!match) continue;
        const after = rest.slice(match[0].length).trim();
        if (!after) break; // civilité seule : on retombe sur le nom complet
        prefixLabel = lang === 'en' ? c.en : c.fr;
        rest = after;
        break;
    }

    const chosen = CIVILITY_LABELS[civility];
    const label = chosen ? chosen[lang === 'en' ? 'en' : 'fr'] : prefixLabel;
    if (label && !COMPANY_RE.test(rest)) {
        return `${label} ${lastNameOf(rest.split(' '))}`;
    }

    if (COMPANY_RE.test(rest)) return rest;
    const parts = splitPersonName(rest.split(' '));
    if (!parts) return rest;
    return [parts.firstName, parts.lastName].filter(Boolean).join(' ');
};
