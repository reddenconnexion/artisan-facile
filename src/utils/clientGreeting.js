// Salutation des emails client à partir du nom de la fiche client.
//
// Il n'existe pas de champ « civilité » sur les clients : quand l'artisan en
// saisit une, elle est en tête du nom (« M. Cohignac Erwan », « madame
// Dupont »…). Quand une civilité est détectée, on salue avec la civilité
// normalisée suivie du nom de famille seul (« Bonjour M. Cohignac ») — les
// fiches sont saisies « Nom Prénom », le premier mot après la civilité est
// donc le nom. Sans civilité, on ne devine pas : le nom complet est renvoyé
// tel quel.
const CIVILITIES = [
    // Les formes composées d'abord, sinon « M. et Mme » matcherait « M. » seul.
    { re: /^(?:monsieur|mr\.?|m\.?)\s+et\s+(?:madame|mme\.?)\s+/i, fr: 'M. et Mme', en: 'Mr and Mrs' },
    { re: /^(?:monsieur|mr\.?|m\.?)\s+/i, fr: 'M.', en: 'Mr' },
    { re: /^(?:madame|mme\.?)\s+/i, fr: 'Mme', en: 'Mrs' },
    { re: /^(?:mademoiselle|mlle\.?)\s+/i, fr: 'Mlle', en: 'Miss' },
];

export const clientGreetingName = (name, lang = 'fr') => {
    const trimmed = (name || '').trim();
    for (const civility of CIVILITIES) {
        const match = trimmed.match(civility.re);
        if (!match) continue;
        const rest = trimmed.slice(match[0].length).trim();
        if (!rest) break; // civilité seule : on retombe sur le nom complet
        const lastName = rest.split(/\s+/)[0];
        const capitalized = lastName.charAt(0).toUpperCase() + lastName.slice(1);
        return `${lang === 'en' ? civility.en : civility.fr} ${capitalized}`;
    }
    return trimmed;
};
