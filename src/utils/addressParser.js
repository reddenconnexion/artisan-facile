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
