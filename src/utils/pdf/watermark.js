// Filigranes appliqués en fin de génération, sur toutes les pages d'un PDF
// jsPDF déjà mis en page.

import { closedWatermarkKind } from '../quoteSignability';

const forEachPage = (doc, draw) => {
    const totalPages = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        draw(pageWidth, pageHeight);
    }
};

/**
 * Filigrane « ACQUITTÉE » d'une facture payée (en complément de la mention en
 * haut de la page 1).
 *
 * @param {jsPDF} doc
 * @param {string} label Libellé traduit (PDF_I18N[lang].paid).
 */
export const drawPaidWatermark = (doc, label) => {
    forEachPage(doc, (pageWidth, pageHeight) => {
        doc.setTextColor(220, 38, 38);
        doc.setFontSize(30);
        doc.setFont(undefined, 'bold');
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.text(label, pageWidth / 2, pageHeight / 2, {
            align: 'center',
            angle: 45,
            renderingMode: 'fill'
        });
        doc.restoreGraphicsState();
    });
};

/**
 * Filigrane « document fermé ».
 *
 * Un devis annulé, refusé, reporté, ou dont la signature a été suspendue,
 * se téléchargeait exactement comme un devis valide : rien sur le papier ne
 * disait qu'il n'engageait plus personne. Un client de bonne foi pouvait
 * l'imprimer et le signer à la main, hors de portée de tout contrôle
 * serveur. L'application ne peut pas empêcher ce geste ; elle peut au moins
 * faire partir la mention avec le document.
 *
 * La date affichée est celle du tirage, pas celle de la fermeture (l'app ne
 * l'enregistre pas) : « État au … » se lit sans ambiguïté et reste vrai.
 *
 * @param {jsPDF} doc
 * @param {object} p
 * @param {object} p.devis      Document (statut, suspension de signature).
 * @param {object} p.L          Libellés traduits (PDF_I18N[lang]).
 * @param {string} p.stampDate  Date du tirage, déjà formatée.
 * @param {boolean} p.signable  Le document attendait-il une signature ? La
 *        mention « ne peut plus être signé » n'a de sens que dans ce cas.
 * @returns {boolean} true si un filigrane a été apposé.
 */
export const drawClosedWatermark = (doc, { devis, L, stampDate, signable }) => {
    const closedKind = ({
        cancelled: 'wmCancelled',
        refused:   'wmRefused',
        postponed: 'wmPostponed',
        suspended: 'wmSuspended',
    })[closedWatermarkKind(devis)];
    if (!closedKind) return false;

    const stateLine = [
        L.wmStateOn(stampDate),
        signable ? L.wmNotSignable : null,
    ].filter(Boolean).join(' — ');

    forEachPage(doc, (pageWidth, pageHeight) => {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.setTextColor(220, 38, 38);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(46);
        doc.text(L[closedKind], pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
        // Seconde ligne décalée perpendiculairement au texte (angle 45°),
        // pour qu'elle se lise juste sous le filigrane et non en travers.
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(stateLine, pageWidth / 2 + 10, pageHeight / 2 + 10, { align: 'center', angle: 45 });
        doc.restoreGraphicsState();
    });
    return true;
};
