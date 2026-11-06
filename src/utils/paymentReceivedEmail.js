// Mails « règlement bien reçu » proposés à l'artisan dès qu'il valide un
// encaissement :
//   - acompte   : réception confirmée, commande du matériel lancée ;
//   - situation : réception confirmée, travaux qui se poursuivent ;
//   - solde     : réception confirmée, chantier entièrement réglé.
// Fonctions pures : la modale charge les documents et affiche le résultat.

import { clientGreetingName } from './clientGreeting';
import { formatCurrency } from './format';

const DEPOSIT_RE = /acompte/i;
const CLOSING_RE = /cl[oô]ture/i;
const DEDUCTION_RE = /acompte|d[ée]duction/i;
const SITUATION_RE = /situation/i;

const isLiveInvoice = (doc) => !!doc && doc.type === 'invoice' && doc.status !== 'cancelled';
const hasItem = (doc, test) => Array.isArray(doc?.items) && doc.items.some(test);

/**
 * Facture de situation de travaux : contexte d'avancement mémorisé à la
 * création, ou « situation » dans le titre (situations plus anciennes).
 */
export const isSituationInvoice = (doc) => isLiveInvoice(doc)
    && (!!doc.amendment_details?.situation || SITUATION_RE.test(doc.title || ''));

/**
 * Facture de solde : facture de clôture, ou facture qui déduit des acomptes
 * déjà versés (ligne « Déduction … acompte » à prix négatif).
 */
export const isBalanceInvoice = (doc) => {
    if (!isLiveInvoice(doc) || isSituationInvoice(doc)) return false;
    if (CLOSING_RE.test(doc.title || '')) return true;
    return hasItem(doc, it => DEDUCTION_RE.test(it?.description || '') && (parseFloat(it?.price) || 0) < 0);
};

/**
 * Facture d'acompte (acompte classique ou acompte matériel) — même règle que
 * le suivi d'affaire : titre ou ligne « acompte », hors situation et solde.
 */
export const isDepositInvoice = (doc) => {
    if (!isLiveInvoice(doc) || isSituationInvoice(doc) || isBalanceInvoice(doc)) return false;
    if (DEPOSIT_RE.test(doc.title || '')) return true;
    return hasItem(doc, it => DEPOSIT_RE.test(it?.description || '') && (parseFloat(it?.price) || 0) > 0);
};

/** 'deposit' | 'situation' | 'balance' | null : quel mail proposer après l'encaissement de ce document. */
export const paymentReceivedKind = (doc) => {
    if (isSituationInvoice(doc)) return 'situation';
    if (isDepositInvoice(doc)) return 'deposit';
    if (isBalanceInvoice(doc)) return 'balance';
    return null;
};

// « Facture d'acompte matériel (30%) - Cuisine » / « Facture de Clôture - Cuisine »
// / « Situation de travaux n°2 - Cuisine » → « Cuisine »
const stripInvoicePrefix = (title) => (title || '')
    .replace(/^\s*(facture\s+(d['’]\s*|de\s+)?)?(acompte(\s+mat[ée]riel)?(\s+compl[ée]mentaire)?|cl[oô]ture|solde|situation(\s+de\s+travaux)?(\s+n°\s*\d+)?)(\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\))?\s*[-–—:]\s*/i, '')
    .trim();

/** Intitulé du chantier : celui du devis d'origine, sinon le titre de la facture sans son préfixe. */
export const paymentProjectTitle = (invoice, parentQuote) => {
    const fromParent = (parentQuote?.title || invoice?.amendment_details?.situation?.parent_title || '').trim();
    if (fromParent) return fromParent;
    const stripped = stripInvoicePrefix(invoice?.title);
    return stripped && !DEPOSIT_RE.test(stripped) && !CLOSING_RE.test(stripped) && !SITUATION_RE.test(stripped) ? stripped : '';
};

/** Numéro de la situation (n°2…) : contexte mémorisé, sinon « n°X » dans le titre. */
const situationIndex = (invoice) => {
    const stored = Number(invoice?.amendment_details?.situation?.index);
    if (stored > 0) return stored;
    const match = (invoice?.title || '').match(/n°\s*(\d+)/i);
    return match ? Number(match[1]) : null;
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
 * Objet et corps du mail de confirmation de règlement.
 * @param {{ kind?: 'deposit'|'situation'|'balance', invoice?: object, parentQuote?: object, client?: object, userProfile?: object }} params
 * @returns {{ subject: string, body: string }}
 */
export const buildPaymentReceivedEmail = ({ kind = 'deposit', invoice, parentQuote, client, userProfile } = {}) => {
    const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre artisan';
    const greetingName = clientGreetingName(client?.name || '', 'fr', client?.civility);
    const projectTitle = paymentProjectTitle(invoice, parentQuote);
    const amount = Number(invoice?.total_ttc) || 0;
    const invoiceRef = invoice?.invoice_number || '';
    const quoteRef = parentQuote?.quote_number ? `devis n°${parentQuote.quote_number}` : '';

    const amountPart = amount > 0 ? ` de ${formatCurrency(amount)}` : '';
    const refPart = invoiceRef ? ` (facture ${invoiceRef})` : '';
    const received = `${amountPart}${paymentMethodPhrase(invoice?.payment_method)}${refPart}`;
    const chantier = projectTitle
        ? `votre chantier « ${projectTitle} »${quoteRef ? ` (${quoteRef})` : ''}`
        : 'votre chantier';

    const signatureBlock = [
        companyName,
        userProfile?.full_name && userProfile.full_name !== companyName ? userProfile.full_name : '',
        userProfile?.phone || '',
        userProfile?.professional_email || userProfile?.email || '',
    ].filter(Boolean).join('\n');

    const index = kind === 'situation' ? situationIndex(invoice) : null;
    const situationLabel = `situation de travaux${index ? ` n°${index}` : ''}`;
    const remaining = Number(invoice?.amendment_details?.situation?.remaining_ttc) || 0;

    const SUBJECTS = {
        deposit: 'Acompte bien reçu',
        situation: `Règlement bien reçu - Situation${index ? ` n°${index}` : ''}`,
        balance: 'Solde bien reçu',
    };
    const subject = `${SUBJECTS[kind] || SUBJECTS.deposit}${projectTitle ? ` - ${projectTitle}` : ''} - ${companyName}`;
    const PARAGRAPHS = {
        balance: [
            `Je vous confirme la bonne réception du règlement du solde${received}. ${chantier.charAt(0).toUpperCase()}${chantier.slice(1)} est désormais entièrement réglé.`,
            `Merci pour votre confiance, ce fut un plaisir de travailler pour vous.`,
            `Je reste à votre disposition pour toute question sur l'installation, ou pour vos futurs besoins en électricité (dépannage, extension, mise aux normes…).`,
        ],
        situation: [
            `Je vous confirme la bonne réception de votre règlement de la ${situationLabel}${received}. Merci.`,
            `Les travaux de ${chantier} se poursuivent : je vous tiens au courant de leur avancement.${remaining > 0 ? ` Pour mémoire, il reste ${formatCurrency(remaining)} à facturer d'ici la fin du chantier.` : ''}`,
            `Je reste à votre disposition pour toute question.`,
        ],
        deposit: [
            `Je vous confirme la bonne réception de votre acompte${received}. Merci pour votre confiance.`,
            `Je lance dès à présent la commande du matériel pour ${chantier}. Je reviens vers vous dès réception des fournitures pour convenir ensemble de la date d'intervention.`,
            `Je reste à votre disposition pour toute question.`,
        ],
    };
    const body = [
        greetingName ? `Bonjour ${greetingName},` : 'Bonjour,',
        ...(PARAGRAPHS[kind] || PARAGRAPHS.deposit),
        `Bien cordialement,`,
        '-- \n' + signatureBlock,
    ].join('\n\n');

    return { subject, body };
};
