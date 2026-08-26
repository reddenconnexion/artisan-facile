/**
 * Franchise en base de TVA (art. 293 B du CGI).
 *
 * Un artisan en franchise ne facture aucune TVA : le total « HT » du document
 * EST la somme que le client réglera. Écrire « TOTAL HT » en gros au bas d'un
 * devis fait pourtant douter les particuliers, qui raisonnent en TTC et
 * demandent s'il faut ajouter 20 % — la question revient sur presque chaque
 * envoi. On nomme donc le montant pour ce qu'il est (net à payer) et on ajoute
 * sous le total une phrase qui coupe court au doute, mention légale comprise.
 *
 * Les libellés vivent ici (et non dans les dictionnaires du générateur de PDF)
 * pour rester testables sans charger jsPDF et partagés avec le portail client.
 */

const LABELS = {
    fr: {
        quote: {
            label: 'MONTANT À RÉGLER',
            note: "Montant net à payer — TVA non applicable, art. 293 B du CGI : aucune TVA ne s'ajoute à ce montant.",
        },
        invoice: {
            label: 'NET À PAYER',
            note: "Montant net à payer — TVA non applicable, art. 293 B du CGI : aucune TVA ne s'ajoute à ce montant.",
        },
        creditNote: {
            label: "MONTANT DE L'AVOIR",
            note: "Montant net — TVA non applicable, art. 293 B du CGI : ce montant ne comporte aucune TVA.",
        },
    },
    en: {
        quote: {
            label: 'AMOUNT PAYABLE',
            note: 'Final amount payable — VAT not applicable, art. 293 B of the French Tax Code: no VAT is added to this amount.',
        },
        invoice: {
            label: 'AMOUNT PAYABLE',
            note: 'Final amount payable — VAT not applicable, art. 293 B of the French Tax Code: no VAT is added to this amount.',
        },
        creditNote: {
            label: 'CREDIT NOTE AMOUNT',
            note: 'VAT not applicable, art. 293 B of the French Tax Code: this amount includes no VAT.',
        },
    },
};

/** Vrai quand le document est établi en franchise de TVA. */
export const isVatFranchise = (devis) => devis?.include_tva === false;

/**
 * Libellé du total et phrase explicative pour un document en franchise.
 * Un avoir prime sur une facture : il ne se « règle » pas.
 */
export const vatFranchiseTotal = ({ isInvoice = false, isCreditNote = false, lang = 'fr' } = {}) => {
    const dict = LABELS[lang] || LABELS.fr;
    const kind = isCreditNote ? 'creditNote' : (isInvoice ? 'invoice' : 'quote');
    return dict[kind];
};
