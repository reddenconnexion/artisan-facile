// Contrôle du numéro SIRET saisi dans le profil.
//
// Le SIRET est le seul identifiant qui vaille sur un devis ou une facture :
// 14 chiffres, le SIREN de l'entreprise (9) suivi du NIC de l'établissement (5).
// L'erreur classique est d'y saisir le SIREN — 9 chiffres, tout aussi
// « officiels », mais insuffisants sur un document qui engage juridiquement.
// Comme le numéro est imprimé tel quel en pied de page (pdfGenerator) et repris
// dans le XML Factur-X (facturxGenerator, schemeID 0009), une saisie fausse ne
// se voit qu'une fois le devis parti chez le client.
//
// D'où un contrôle à la saisie qui nomme l'erreur au lieu de dire « invalide ».

/** Retire ce que l'on colle avec un numéro : espaces (y compris fine et insécable), points, tirets. */
export const normalizeSiret = (value) =>
    // \s couvre aussi l'espace insécable et l'espace fine des copier-coller.
    String(value ?? '').replace(/[\s.-]/g, '');

/** « 92508288500029 » → « 925 082 885 000 29 » (lecture officielle SIREN + NIC). */
export const formatSiret = (value) => {
    const digits = normalizeSiret(value);
    if (digits.length !== 14) return digits;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)} ${digits.slice(12)}`;
};

const luhnSum = (digits) => {
    let sum = 0;
    // Doublement d'un chiffre sur deux en partant de la droite.
    for (let i = digits.length - 1, rank = 0; i >= 0; i -= 1, rank += 1) {
        let n = Number(digits[i]);
        if (rank % 2 === 1) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
    }
    return sum;
};

// La Poste est l'exception connue : ses établissements (SIREN 356 000 000) ne
// respectent pas la clé de Luhn, la règle officielle y est que la somme des
// chiffres est un multiple de 5. Sans ce cas, un facteur en auto-entreprise
// verrait son vrai SIRET refusé.
const LA_POSTE_SIREN = '356000000';

const hasValidChecksum = (digits) => {
    if (digits.startsWith(LA_POSTE_SIREN)) {
        const sum = digits.split('').reduce((acc, d) => acc + Number(d), 0);
        return sum % 5 === 0;
    }
    return luhnSum(digits) % 10 === 0;
};

/**
 * Vérifie un SIRET saisi.
 *
 * @param {string} value Saisie brute (espaces et points tolérés).
 * @returns {{level: 'empty'|'ok'|'error', code: string, message: string,
 *            siren?: string, nic?: string}}
 *   `level` = 'empty' (champ vide : accepté, c'est le profil incomplet qui
 *   prévient), 'ok', ou 'error' — auquel cas `message` dit ce qui cloche et
 *   `code` vaut 'chars', 'siren', 'length' ou 'checksum'.
 */
export const checkSiret = (value) => {
    const digits = normalizeSiret(value);

    if (!digits) {
        return { level: 'empty', code: 'empty', message: '' };
    }
    if (!/^\d+$/.test(digits)) {
        return {
            level: 'error',
            code: 'chars',
            message: 'Le SIRET ne contient que des chiffres (les espaces sont acceptés).',
        };
    }
    if (digits.length === 9) {
        return {
            level: 'error',
            code: 'siren',
            message: "9 chiffres, c'est votre SIREN — le SIRET en compte 14 : ce SIREN suivi des 5 chiffres de l'établissement (NIC). Il figure sur votre avis de situation Insee.",
        };
    }
    if (digits.length !== 14) {
        return {
            level: 'error',
            code: 'length',
            message: `Le SIRET compte 14 chiffres : ${digits.length} saisi${digits.length > 1 ? 's' : ''}.`,
        };
    }
    if (!hasValidChecksum(digits)) {
        return {
            level: 'error',
            code: 'checksum',
            message: 'Ces 14 chiffres ne forment pas un SIRET valide (clé de contrôle) — un chiffre a dû être mal recopié.',
        };
    }
    return {
        level: 'ok',
        code: 'ok',
        message: `SIRET valide — SIREN ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}, établissement ${digits.slice(9)}.`,
        siren: digits.slice(0, 9),
        nic: digits.slice(9),
    };
};

/** Raccourci : le numéro est-il exploitable sur un document légal ? */
export const isValidSiret = (value) => checkSiret(value).level === 'ok';
