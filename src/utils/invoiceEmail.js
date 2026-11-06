// Mail d'envoi d'une facture : le titre d'une facture reprend souvent son
// type (« Facture de Clôture - Cuisine », « Facture d'acompte (30%) - Garage »).
// Recopié tel quel dans « votre facture pour le projet "Facture de Clôture -
// Cuisine" », il fait doublon. On sépare donc le type de facture du nom du
// chantier, pour écrire « la facture de clôture du chantier « Cuisine » ».

import { isBalanceInvoice, isDepositInvoice, paymentProjectTitle } from './paymentReceivedEmail';

const CLOSING_RE = /cl[oô]ture/i;

// Titres traduits (content_en) : « Final invoice - Kitchen », « Deposit invoice (30%) - Garage »…
const EN_PREFIX_RE = /^\s*((final|closing|balance|deposit|down[- ]?payment|material\s+deposit|progress)\s+)*(invoice)?(\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\))?\s*[-–—:]\s*/i;
const EN_KIND_ONLY_RE = /^(final|closing|balance|deposit|down[- ]?payment|progress)?\s*invoice$/i;

/** 'closing' | 'balance' | 'deposit' | 'standard' — nature de la facture (hors situation). */
export const invoiceEmailKind = (doc) => {
    if (isBalanceInvoice(doc)) return CLOSING_RE.test(doc?.title || '') ? 'closing' : 'balance';
    if (isDepositInvoice(doc)) return 'deposit';
    return 'standard';
};

/**
 * Nom du chantier à citer dans le mail, sans le préfixe « Facture de … ».
 * Chaîne vide quand le titre ne contient que le type de facture.
 */
export const invoiceEmailProjectName = (doc, lang = 'fr', localizedTitle = '') => {
    if (lang === 'en' && localizedTitle) {
        const stripped = localizedTitle.replace(EN_PREFIX_RE, '').trim();
        return EN_KIND_ONLY_RE.test(stripped) ? '' : stripped;
    }
    const name = paymentProjectTitle(doc);
    return /^facture$/i.test(name) ? '' : name;
};

const LABELS = {
    fr: { closing: 'facture de clôture', balance: 'facture de solde', deposit: "facture d'acompte", standard: 'facture' },
    en: { closing: 'final invoice', balance: 'balance invoice', deposit: 'deposit invoice', standard: 'invoice' },
};

/** « facture de clôture », « deposit invoice »… */
export const invoiceEmailLabel = (kind, lang = 'fr') => (LABELS[lang] || LABELS.fr)[kind] || (LABELS[lang] || LABELS.fr).standard;

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Objet : « Facture de clôture N°123 - Cuisine - Entreprise ». */
export const invoiceEmailSubjectPrefix = (kind, lang = 'fr', paid = false) => {
    const label = capitalize(invoiceEmailLabel(kind, lang));
    if (!paid) return label;
    return lang === 'en' ? `${label} (paid)` : `${label} acquittée`;
};

/**
 * Introduction du mail d'une facture (hors situation, gérée à part).
 * @param {{ kind: string, projectName: string, greetingName: string, lang?: 'fr'|'en', paid?: boolean, paidDate?: string }} params
 */
export const buildInvoiceEmailIntro = ({ kind = 'standard', projectName = '', greetingName = '', lang = 'fr', paid = false, paidDate = '' }) => {
    const label = invoiceEmailLabel(kind, lang);
    if (lang === 'en') {
        const about = projectName ? ` for "${projectName}"` : '';
        if (paid) {
            return `Hello ${greetingName},\n\nYour payment${paidDate ? ` of ${paidDate}` : ''} has been received — thank you.\nPlease find your paid ${label}${about}, to keep as proof of payment.\nYou can view and download it from the link below.`;
        }
        const first = kind === 'closing' || kind === 'balance'
            ? `Now that the works${projectName ? ` "${projectName}"` : ''} are completed, please find the ${label}.`
            : `Please find the ${label}${about}.`;
        return `Hello ${greetingName},\n\n${first}\nYou can view and download it from the link below.`;
    }

    const travaux = projectName ? ` des travaux « ${projectName} »` : '';
    if (paid) {
        return `Bonjour ${greetingName},\n\nVotre règlement${paidDate ? ` du ${paidDate}` : ''} a bien été reçu, je vous en remercie.\nJe vous transmets la ${label} acquittée${travaux}, à conserver comme justificatif de paiement.\nVous pouvez la consulter et la télécharger via le lien ci-dessous.`;
    }
    let first;
    if (kind === 'closing' || kind === 'balance') {
        first = projectName
            ? `Les travaux « ${projectName} » étant terminés, je vous transmets la ${label} du chantier.`
            : `Les travaux étant terminés, je vous transmets la ${label} du chantier.`;
    } else if (kind === 'deposit') {
        first = `Comme convenu, je vous transmets la ${label}${projectName ? ` pour les travaux « ${projectName} »` : ''}.`;
    } else {
        first = projectName ? `Je vous transmets la ${label}${travaux}.` : 'Je vous transmets votre facture.';
    }
    return `Bonjour ${greetingName},\n\n${first}\nVous pouvez la consulter et la télécharger via le lien ci-dessous.`;
};
