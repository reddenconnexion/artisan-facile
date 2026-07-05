// Petits helpers de texte français.

/**
 * Met au pluriel le NOM DE TÊTE (premier mot) d'une désignation.
 *
 * Utilisé en présentation « groupée » : les fournitures y sont affichées sans
 * quantité (« Disjoncteur 16A — 106,80 € »), ce qui peut laisser croire au
 * client qu'il n'achète qu'une pièce. Quand il y en a plusieurs, on accorde le
 * nom de tête au pluriel (« Disjoncteurs 16A »), sans révéler la quantité.
 *
 * On n'accorde que le premier mot (le nom), pas les compléments/spécifications
 * qui suivent (« 16A », « 3G2.5 », « LED encastré ») : les règles d'accord d'une
 * désignation technique libre sont trop variables pour être fiables, et le
 * premier mot porte l'essentiel du sens. L'artisan garde la main sur le libellé.
 *
 * Règles : finit par s/x/z → invariable ; -eau/-au/-eu → +x ; -al → -aux ;
 * sinon +s.
 *
 * @param {string} label
 * @returns {string}
 */
export const pluralizeFrenchHead = (label) => {
  if (!label || typeof label !== 'string') return label;
  const trimmed = label.trimStart();
  const lead = label.slice(0, label.length - trimmed.length); // espaces de tête éventuels
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);
  if (!head) return label;

  const lower = head.toLowerCase();
  let plural;
  if (/[sxz]$/.test(lower)) {
    plural = head; // déjà pluriel ou invariable
  } else if (/(eau|au|eu)$/.test(lower)) {
    plural = `${head}x`;
  } else if (/al$/.test(lower)) {
    plural = `${head.slice(0, -2)}aux`;
  } else {
    plural = `${head}s`;
  }
  return `${lead}${plural}${rest}`;
};
