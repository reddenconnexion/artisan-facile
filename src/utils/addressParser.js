// ── Découpage d'une adresse française collée en un bloc ──
//
// Cas d'usage : l'artisan copie l'adresse depuis un SMS du client
// (« 13 rue Robert Boulin 33230 St Médard de Guizières ») et la colle dans le
// champ « Adresse » du formulaire client. Le code postal (5 chiffres) sert de
// repère pour répartir le texte entre rue / code postal / ville, plutôt que
// d'imposer trois copier-coller successifs.
//
// Retourne { address, postal_code, city } si un code postal est trouvé,
// null sinon (le collage doit alors rester un collage normal).
export function parseFrenchAddress(text) {
    if (!text) return null;

    // Normalise séparateurs : retours à la ligne et virgules deviennent des
    // espaces simples (les SMS mettent souvent l'adresse sur deux lignes).
    const flat = String(text).replace(/[\n\r,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!flat) return null;

    // Dernière séquence de 5 chiffres isolée : un numéro de rue fait 1 à 4
    // chiffres, le code postal est donc en pratique la dernière (et souvent la
    // seule) séquence de 5. « Isolée » : pas collée à d'autres chiffres
    // (exclut les numéros de téléphone à 10 chiffres).
    const matches = [...flat.matchAll(/(?<!\d)(\d{5})(?!\d)/g)];
    if (matches.length === 0) return null;

    const m = matches[matches.length - 1];
    const postal_code = m[1];
    const cleanEdges = (s) => s.replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim();
    const address = cleanEdges(flat.slice(0, m.index));
    // Un numéro de téléphone collé à la suite de l'adresse dans le SMS ne doit
    // pas finir dans la ville : coupe la queue dès qu'une séquence de type
    // téléphone (06 12 34 56 78, 0612345678…) commence.
    const city = cleanEdges(flat.slice(m.index + 5).replace(/\b0\d(?:[\s.]?\d{2}){4}\b.*$/, ''));

    // Rien autour du code postal : le texte collé n'est pas une adresse
    // complète, inutile de découper.
    if (!address && !city) return null;

    return { address, postal_code, city };
}

// Mots qui trahissent une voie : une ligne (ou un début de texte) qui en
// contient ne peut pas être le nom du client.
const STREET_WORDS = /\b(rue|avenue|av|impasse|chemin|route|rte|all[ée]e|place|pl|boulevard|bd|lotissement|lot|r[ée]sidence|lieu[- ]dit|quartier|hameau|square|cours|quai|voie|za|zi|zac|cit[ée])\b/i;

// Téléphone français : 0X ou +33 X puis 4 paires de chiffres, séparées ou
// non (06 12 34 56 78, 0612345678, 06.12.34.56.78, +33 6 12 34 56 78).
// Les gardes (?<!\d)/(?!\d) évitent de mordre dans un code postal ou un
// numéro de rue voisin.
const PHONE_RE = /(?<!\d)(?:\+33[\s.]?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// ── Bloc client complet collé d'un coup : nom + adresse + téléphone + email ──
//
// Le SMS type contient « Jean Dupont 13 rue Robert Boulin 33230 Ville
// 06 12 34 56 78 jean@mail.fr » (une ligne) ou chaque info sur sa ligne.
// Téléphone et email sont extraits en premier, où qu'ils soient ; le nom est
// ensuite la partie qui précède le début de la voie : première ligne sans
// chiffre ni mot de voie, ou texte avant le numéro de rue sur une ligne.
//
// Retourne { name, address, postal_code, city, phone, email } (chaque champ
// éventuellement vide) si le bloc contient au moins une adresse, un téléphone
// ou un email exploitables ; null sinon (le collage doit rester normal, sans
// perte de texte).
export function parseClientBlock(text) {
    if (!text) return null;
    let raw = String(text);
    const stripTail = (s) => s.replace(/[\s,;:]+$/, '').trim();

    const emailMatch = raw.match(EMAIL_RE);
    const email = emailMatch ? emailMatch[0] : '';
    if (emailMatch) raw = raw.replace(emailMatch[0], ' ');

    const phoneMatch = raw.match(PHONE_RE);
    const phone = phoneMatch ? phoneMatch[0].trim() : '';
    if (phoneMatch) raw = raw.replace(phoneMatch[0], ' ');

    let name = '';
    let rest = raw;
    const lines = raw.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2 && !/\d/.test(lines[0]) && !STREET_WORDS.test(lines[0])) {
        name = stripTail(lines[0]);
        rest = lines.slice(1).join(' ');
    }

    let parsed = parseFrenchAddress(rest);
    if (!parsed) {
        // Pas d'adresse détectée : le collage reste utile si téléphone ou
        // email ont été trouvés et que le reste du texte est vide ou fait un
        // nom plausible. Sinon, collage normal — on ne perd jamais de texte.
        if (!phone && !email) return null;
        const remainder = stripTail(rest.replace(/[\n\r,;]+/g, ' ').replace(/\s+/g, ' ').trim());
        if (!name) {
            if (remainder && (/\d/.test(remainder) || STREET_WORDS.test(remainder))) return null;
            name = remainder;
        } else if (remainder) {
            return null;
        }
        parsed = { address: '', postal_code: '', city: '' };
    } else if (!name && parsed.address) {
        // Une seule ligne : le nom est la partie avant le numéro de rue, si
        // elle ne ressemble pas elle-même à une voie (« Résidence Les Pins 13… »).
        const m = parsed.address.match(/^([^\d]+?)\s+(\d.*)$/);
        if (m && !STREET_WORDS.test(m[1])) {
            name = stripTail(m[1]);
            parsed = { ...parsed, address: m[2].trim() };
        }
    }

    return { name, ...parsed, phone, email };
}
