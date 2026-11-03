// Mail « acompte bien reçu » : dès que l'artisan valide l'encaissement d'un
// acompte, on lui propose un mail prêt à envoyer qui confirme la réception au
// client et l'informe que la commande du matériel est lancée. Fonctions pures :
// la modale charge les documents et affiche le résultat.

import { clientGreetingName } from './clientGreeting';
import { formatCurrency } from './format';

const DEPOSIT_RE = /acompte/i;
const CLOSING_RE = /cl[oô]ture/i;

/**
 * Facture d'acompte (acompte classique ou acompte matériel) — même règle que
 * le suivi d'affaire : titre ou ligne « acompte », hors facture de clôture
 * (qui déduit les acomptes déjà versés).
 */
export const isDepositInvoice = (doc) => {
    if (!doc || doc.type !== 'invoice' || doc.status === 'cancelled') return false;
    const title = doc.title || '';
    if (CLOSING_RE.test(title)) return false;
    if (DEPOSIT_RE.test(title)) return true;
    return Array.isArray(doc.items)
        && doc.items.some(it => DEPOSIT_RE.test(it?.description || '') && (parseFloat(it?.price) || 0) > 0);
};

// « Facture d'acompte matériel - Rénovation cuisine » → « Rénovation cuisine »
const stripDepositPrefix = (title) => (title || '')
    .replace(/^\s*(facture\s+d['’]\s*)?acompte(\s+mat[ée]riel)?(\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\))?\s*[-–—:]\s*/i, '')
    .trim();

/** Intitulé du chantier : celui du devis d'origine, sinon le titre de l'acompte sans son préfixe. */
export const depositProjectTitle = (deposit, parentQuote) => {
    const fromParent = (parentQuote?.title || '').trim();
    if (fromParent) return fromParent;
    const stripped = stripDepositPrefix(deposit?.title);
    return stripped && !DEPOSIT_RE.test(stripped) ? stripped : '';
};

// « réglé par virement », « en espèces »… ; rien pour « Autre » ou un mode inconnu.
const PAYMENT_PHRASES = {
    virement: ' par virement',
    wero: ' par Wero',
    especes: ' en espèces',
    cheque: ' par chèque',
    carte: ' par carte bancaire',
    paypal: ' par PayPal',
};
const paymentMethodPhrase = (method) => PAYMENT_PHRASES[method] || '';

/**
 * Objet et corps du mail de confirmation d'acompte.
 * @returns {{ subject: string, body: string }}
 */
export const buildDepositReceivedEmail = ({ deposit, parentQuote, client, userProfile } = {}) => {
    const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre artisan';
    const greetingName = clientGreetingName(client?.name || '', 'fr');
    const projectTitle = depositProjectTitle(deposit, parentQuote);
    const amount = Number(deposit?.total_ttc) || 0;
    const invoiceRef = deposit?.invoice_number || '';
    const quoteRef = parentQuote?.quote_number ? `devis n°${parentQuote.quote_number}` : '';

    const amountPart = amount > 0 ? ` de ${formatCurrency(amount)}` : '';
    const refPart = invoiceRef ? ` (facture ${invoiceRef})` : '';
    const projectPart = projectTitle
        ? ` pour votre chantier « ${projectTitle} »${quoteRef ? ` (${quoteRef})` : ''}`
        : quoteRef ? ` prévu au ${quoteRef}` : ' pour votre chantier';

    const signatureBlock = [
        companyName,
        userProfile?.full_name && userProfile.full_name !== companyName ? userProfile.full_name : '',
        userProfile?.phone || '',
        userProfile?.professional_email || userProfile?.email || '',
    ].filter(Boolean).join('\n');

    const subject = `Acompte bien reçu${projectTitle ? ` - ${projectTitle}` : ''} - ${companyName}`;
    const body = [
        greetingName ? `Bonjour ${greetingName},` : 'Bonjour,',
        `Je vous confirme la bonne réception de votre acompte${amountPart}${paymentMethodPhrase(deposit?.payment_method)}${refPart}. Merci pour votre confiance.`,
        `Je lance dès à présent la commande du matériel${projectPart}. Je reviens vers vous dès réception des fournitures pour convenir ensemble de la date d'intervention.`,
        `Je reste à votre disposition pour toute question.`,
        `Bien cordialement,`,
        '-- \n' + signatureBlock,
    ].join('\n\n');

    return { subject, body };
};
