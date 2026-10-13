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

// Mots de conversation : un « nom » qui en contient vient d'un SMS rédigé en
// phrases (« Bonjour je suis Jean Dupont j'habite au… »), pas d'un bloc.
const CHAT_WORDS = /(?:^|[\s,.'’])(bonjour|bonsoir|salut|je|j|suis|m'appelle|appelle|habite|mon|ma|mes|adresse|merci|svp|stp|pour|au|aux|c|voici|tel|tél|téléphone|portable|numéro|num|cordialement)(?=$|[\s,.:'’!?])/i;

// Civilités en tête de nom.
const CIVILITY = "(?:M\\.|Mr\\.?|Mme|Mlle|Monsieur|Madame|Mademoiselle)";
// Un mot de nom propre : commence par une majuscule (Dupont, Le-Gall, D'Artois).
const NAME_WORD = "[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]+";

function isPlausibleName(s) {
    if (!s) return false;
    const words = s.trim().split(/\s+/);
    return words.length <= 5 && !CHAT_WORDS.test(s) && !/\d/.test(s);
}

// Nom dans un SMS rédigé : « je suis Jean Dupont », « je m'appelle Martin »,
// « c'est Mme Martin », « Nom : Dupont », ou une signature seule sur la
// dernière ligne (« Cordialement,\nJean Dupont »).
function findNameInMessage(text) {
    const patterns = [
        new RegExp(`\\bnom\\s*:\\s*(${CIVILITY}?\\s*${NAME_WORD}(?:\\s+${NAME_WORD}){0,2})`, 'i'),
        new RegExp(`\\bje\\s+m['’]appelle\\s+(${CIVILITY}?\\s*${NAME_WORD}(?:\\s+${NAME_WORD}){0,2})`, 'i'),
        new RegExp(`\\b(?:je\\s+suis|c['’]est|ici)\\s+(${CIVILITY}?\\s*${NAME_WORD}(?:\\s+${NAME_WORD}){0,2})`),
        new RegExp(`(${CIVILITY}\\s+${NAME_WORD}(?:\\s+${NAME_WORD}){0,1})`),
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && isPlausibleName(m[1])) {
            return m[1].replace(/\s+/g, ' ').trim();
        }
    }
    // Signature : dernière ligne faite uniquement de 1 à 3 mots en majuscule.
    const lines = text.split(/[\n\r]+/).map(l => l.replace(/[\s,.;!]+$/, '').trim()).filter(Boolean);
    if (lines.length >= 2) {
        const last = lines[lines.length - 1];
        if (new RegExp(`^${CIVILITY}?\\s*${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}$`).test(last) && isPlausibleName(last)) {
            return last;
        }
    }
    return '';
}

// ── SMS du client collé tel quel dans le champ dédié ──
//
// Contrairement au collage dans « Nom » / « Adresse » (bloc structuré, aucune
// perte de texte tolérée), le champ dédié conserve le SMS complet sous les
// yeux de l'artisan : on peut donc extraire ce qui est reconnaissable même au
// milieu de phrases (« Bonjour, je suis Jean Dupont, j'habite au 13 rue du
// Port 33230 Coutras. Mon 06 12 34 56 78. Plus de courant dans la cuisine »).
//
// Retourne { name, address, postal_code, city, phone, email } (champs
// éventuellement vides) ; null si rien n'a été reconnu.
export function parseClientSms(text) {
    if (!text || !String(text).trim()) return null;

    // Bloc structuré (nom / adresse / tél.) : le parseur strict suffit.
    const block = parseClientBlock(text);
    if (block && (!block.name || isPlausibleName(block.name)) && !CHAT_WORDS.test(block.address) && !CHAT_WORDS.test(block.city)) {
        return block;
    }

    let raw = String(text);
    const emailMatch = raw.match(EMAIL_RE);
    const email = emailMatch ? emailMatch[0] : '';
    if (emailMatch) raw = raw.replace(emailMatch[0], ' ');
    const phoneMatch = raw.match(PHONE_RE);
    const phone = phoneMatch ? phoneMatch[0].trim() : '';
    if (phoneMatch) raw = raw.replace(phoneMatch[0], ' ');

    const name = findNameInMessage(raw);

    let address = '', postal_code = '', city = '';
    const flat = raw.replace(/[\n\r]+/g, ' , ').replace(/\s+/g, ' ');
    const cps = [...flat.matchAll(/(?<!\d)(\d{5})(?!\d)/g)];
    if (cps.length) {
        const cp = cps[cps.length - 1];
        postal_code = cp[1];
        const before = flat.slice(0, cp.index);
        // Début de la voie : dernier « numéro + mot de voie », sinon dernier
        // mot de voie seul (lieu-dit, lotissement sans numéro).
        const numbered = [...before.matchAll(new RegExp(`\\b\\d{1,4}\\s*(?:bis|ter|[a-d])?\\s*,?\\s+(?=${STREET_WORDS.source})`, 'gi'))];
        let start = numbered.length ? numbered[numbered.length - 1].index : -1;
        if (start < 0) {
            const words = [...before.matchAll(new RegExp(STREET_WORDS.source, 'gi'))];
            if (words.length) start = words[words.length - 1].index;
        }
        if (start >= 0) {
            address = before.slice(start).replace(/[\s,;:.\-–]+$/, '').trim();
        }
        // Ville : jusqu'à la fin de la phrase, 6 mots au plus.
        // Ville : jusqu'à la fin de la phrase ou au premier mot de
        // conversation, 6 mots au plus.
        const cityWords = [];
        for (const w of flat.slice(cp.index + 5).split(/[,.;:!?()]/)[0].trim().split(/\s+/).filter(Boolean)) {
            if (cityWords.length >= 6 || CHAT_WORDS.test(w)) break;
            cityWords.push(w);
        }
        city = cityWords.join(' ').replace(/^[-–]+/, '').trim();
    }

    if (!name && !address && !postal_code && !phone && !email) return null;
    return { name, address, postal_code, city, phone, email };
}
