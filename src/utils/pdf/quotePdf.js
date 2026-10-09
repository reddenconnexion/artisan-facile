// PDF des devis, avenants, factures et avoirs : une mise en page commune,
// déclinée selon le type de document (isInvoice, type = amendment/credit_note).
// Les parties propres à un type vivent à côté : ./facturx.js (factures),
// ./watermark.js (filigranes « acquittée » / « document fermé »).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getTradeConfig } from '../../constants/trades';
import { pluralizeFrenchHead } from '../frenchText';
import { materialDepositAmounts, quoteLineAmount } from '../materialDeposit';
import { splitQuoteOptionLines } from '../quoteOptionLines';
import { capWorkObject } from '../workObject';
import { amendmentIndexOf } from '../amendmentIndex';
import { amendmentProjectTotals } from '../amendmentBilling';
import { isVatFranchise, vatFranchiseTotal } from '../vatFranchise';
import { formatAmount, formatDate } from '../format';
import { PDF_I18N } from './i18n';
import { buildRoundedLogoDataUrl } from './logo';
import { drawPaidWatermark, drawClosedWatermark } from './watermark';
import { embedFacturX } from './facturx';
import { drawTransferQr } from './transferQr';
import { depositDue, paymentReference as depositReference } from '../depositPayment';

// Converted to Async to support pdf-lib operations
export const generateDevisPDF = async (devis, client, userProfile, isInvoice = false, returnType = false, lang = 'fr') => {
    // ---------------------------------------------------------
    // 1. Generate Visual PDF with jsPDF (Existing Logic)
    // ---------------------------------------------------------
    const doc = new jsPDF();

    const L = PDF_I18N[lang] || PDF_I18N.fr;
    const fmtDate = (d) => formatDate(d, { locale: L.dateLocale });

    // ── Utilitaires anti-débordement ──
    // Le rendu jsPDF écrit à une abscisse fixe sans limite de largeur : un nom de
    // société ou une adresse longue déborde alors sur le cartouche de droite, la
    // marge, ou la colonne voisine. Ces deux helpers contraignent le texte à une
    // largeur maximale (mm) en réduisant la police puis, en dernier recours, en
    // tronquant avec « … ». Ils reposent sur la police/taille/style posés juste
    // avant l'appel (doc.getTextWidth mesure avec l'état courant).
    const fitFontSize = (text, maxWidth, baseSize, minSize) => {
        let size = baseSize;
        doc.setFontSize(size);
        while (size > minSize && doc.getTextWidth(text) > maxWidth) {
            size = Math.max(minSize, size - 0.5);
            doc.setFontSize(size);
        }
        return size;
    };
    const ellipsize = (text, maxWidth) => {
        if (doc.getTextWidth(text) <= maxWidth) return text;
        let t = text;
        while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) t = t.slice(0, -1);
        return t.replace(/\s+$/, '') + '…';
    };

    // Avoir : détecté sur le document lui-même (les appelants passent souvent
    // isInvoice = type === 'invoice', donc false pour un avoir).
    const isCreditNote = devis.type === 'credit_note';
    const typeDocument = isCreditNote ? L.avoir : (isInvoice ? L.facture : (devis.type === 'amendment' ? L.avenant : L.devis));
    const dateLabel = isInvoice ? L.dateInvoice : L.dateQuote;
    const isAmendment = devis.type === 'amendment';
    // Copie interne : le même document rendu pour l'artisan seul (typiquement un
    // devis en présentation groupée / poste global qu'il veut relire ou emmener
    // sur le chantier ligne à ligne). L'appelant force `client_display_mode` à
    // 'detailed' et pose ce drapeau ; ici il ne change que la signalétique —
    // mention en pied de page et nom de fichier — pour qu'une copie de travail
    // ne puisse pas être confondue avec l'exemplaire remis (et signé par) le client.
    const isInternalCopy = devis.internal_copy === true;

    // Facture de situation : le contexte d'avancement (total du devis parent,
    // déjà facturé, n° de situation) est mémorisé sur la facture elle-même
    // (amendment_details.situation) à la création, pour que le PDF reste
    // complet partout (app, lien public, portail) sans recharger le parent.
    let situationInfo = null;
    if (isInvoice) {
        let situationDetails = devis.amendment_details;
        if (typeof situationDetails === 'string') {
            try { situationDetails = JSON.parse(situationDetails); } catch { situationDetails = null; }
        }
        if (situationDetails?.situation && typeof situationDetails.situation === 'object') {
            situationInfo = situationDetails.situation;
        }
    }
    const isSituation = !!situationInfo;

    // Translated free-text content (title / notes / per-line descriptions).
    // `content_en` is stored on the quote when the artisan sends it in English;
    // we fall back to the original French whenever a translation is missing so
    // the document is never left with blank lines. Amounts are never touched.
    const tr = (lang !== 'fr' && devis.content_en) ? devis.content_en : null;
    const trTitle = tr?.title || devis.title;
    const trNotes = (tr && typeof tr.notes === 'string' && tr.notes.trim()) ? tr.notes : devis.notes;
    const trWorkObject = (tr && typeof tr.work_object === 'string' && tr.work_object.trim())
        ? tr.work_object
        : devis.work_object;
    const trLine = (desc) => (tr?.lines && tr.lines[desc]) ? tr.lines[desc] : desc;

    // ── Charte graphique : couleur d'accent (profil) + palette neutre ──
    const hexToRgb = (hex) => {
        const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const accent = hexToRgb(userProfile.brand_color) || (devis.type === 'credit_note' ? [185, 28, 28] : (isInvoice ? [46, 125, 50] : [37, 99, 235]));
    const accentTint = accent.map(c => Math.round(c * 0.10 + 255 * 0.90));
    const ink = [17, 24, 39];         // texte principal
    const subtle = [107, 114, 128];   // texte secondaire
    const faint = [156, 163, 175];    // texte tertiaire
    const hairline = [229, 231, 235]; // filets
    const cardBg = [246, 247, 249];   // fonds de cartouches

    // ── En-tête épuré : identité à gauche, cartouche document à droite ──
    // Logo discret (16 mm, coins arrondis) aligné sur le bloc identité.
    let leftX = 14;
    let cursorY = 19;
    if (userProfile.logo_url) {
        try {
            const roundedLogo = await buildRoundedLogoDataUrl(userProfile.logo_url);
            doc.addImage(roundedLogo, 'PNG', 14, 13.5, 16, 16);
            leftX = 34;
        } catch {
            // Arrondi impossible (canvas indisponible) : on tente le logo brut
            try {
                doc.addImage(userProfile.logo_url, 'PNG', 14, 13.5, 16, 16);
                leftX = 34;
            } catch (e2) {
                console.warn("Could not add logo image to PDF", e2);
            }
        }
    }

    const companyName = userProfile.company_name || userProfile.full_name || L.yourCompany;
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accent);
    // Le grand titre partage la 1re ligne avec le libellé document (droite, ~166 mm+).
    // On borne à 156 mm, on réduit la police au besoin, puis on tronque en secours.
    const titleUpper = companyName.toUpperCase();
    const titleMaxWidth = 156 - leftX;
    fitFontSize(titleUpper, titleMaxWidth, 16, 11);
    doc.text(ellipsize(titleUpper, titleMaxWidth), leftX, cursorY);
    doc.setFontSize(16);
    cursorY += 5.5;

    const tradeLabel = userProfile.trade ? (getTradeConfig(userProfile.trade)?.label || '') : '';
    if (tradeLabel) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...subtle);
        doc.text(tradeLabel, leftX, cursorY);
        cursorY += 4.8;
    }

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...subtle);
    const emailToDisplay = userProfile.professional_email || userProfile.email;
    const identityLines = [
        userProfile.full_name && userProfile.full_name !== companyName ? userProfile.full_name : null,
        [userProfile.address, `${userProfile.postal_code || ''} ${userProfile.city || ''}`.trim()].filter(Boolean).join(', ') || null,
        [
            userProfile.phone ? `${L.phone}. ${userProfile.phone}` : null,
            emailToDisplay || null,
        ].filter(Boolean).join('  —  ') || null,
        [
            userProfile.website || null,
            userProfile.siret ? `${L.siret} ${userProfile.siret}` : null,
        ].filter(Boolean).join('  —  ') || null,
    ].filter(Boolean);
    // Les lignes d'identité longent verticalement le cartouche document (dates à
    // droite, bord gauche ~148 mm). On borne à 145 mm et on enroule au lieu de
    // déborder sur les dates ou hors marge.
    const identityMaxWidth = 145 - leftX;
    identityLines.forEach(line => {
        doc.splitTextToSize(line, identityMaxWidth).forEach(wrapped => {
            doc.text(wrapped, leftX, cursorY);
            cursorY += 4.2;
        });
    });

    // Cartouche document (droite) : type, numéro, dates
    const docRight = 196;
    let docY = 19;
    // Libellé plus long pour les situations : taille réduite pour éviter de
    // chevaucher le bloc identité à gauche.
    doc.setFontSize(isSituation ? 13.5 : 16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accent);
    // Avenant : numéroté à partir du second sur un même devis (AVENANT N°2…).
    const amendmentIndex = isAmendment ? amendmentIndexOf(devis) : null;
    const amendmentHeading = amendmentIndex && amendmentIndex >= 2 ? L.avenantNumbered(amendmentIndex) : L.avenant;
    doc.text(isAmendment ? amendmentHeading : (isSituation ? L.situationTitle : typeDocument), docRight, docY, { align: 'right' });
    docY += 6.5;
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    // Facture : uniquement le numéro légal (FAC-AAAA-NNNN, attribué à l'émission).
    // Tant qu'il n'est pas attribué (brouillon), le document est marqué PROVISOIRE
    // plutôt que d'afficher la référence interne comme un faux numéro de facture.
    const docNumber = (isInvoice || isCreditNote)
        ? (devis.invoice_number || 'PROVISOIRE')
        : (devis.quote_number || devis.id || 'PROVISOIRE');
    doc.text(`N° ${docNumber}`, docRight, docY, { align: 'right' });
    // Avoir : référence obligatoire à la facture rectifiée, juste sous le numéro.
    if (isCreditNote && devis.amendment_details?.credit_note?.parent_invoice_number) {
        const cn = devis.amendment_details.credit_note;
        docY += 4.8;
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);
        doc.text(L.creditNoteRef(cn.parent_invoice_number, cn.parent_invoice_date ? fmtDate(cn.parent_invoice_date) : ''), docRight, docY, { align: 'right' });
        doc.setFontSize(9);
        doc.setTextColor(...ink);
    }
    docY += 4.8;
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...subtle);
    doc.text(`${dateLabel} : ${fmtDate(devis.date)}`, docRight, docY, { align: 'right' });
    docY += 4.8;
    if (!isInvoice && devis.valid_until) {
        doc.text(`${L.validUntil} : ${fmtDate(devis.valid_until)}`, docRight, docY, { align: 'right' });
        docY += 4.8;
    }
    // Mention "ACQUITTÉE" bien visible en haut de la 1ère page
    if (isInvoice && devis.status === 'paid') {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text(L.paid, docRight, docY + 1.5, { align: 'right' });
        docY += 6.5;
    }

    // Double filet d'accent sous l'en-tête
    const headerBottom = Math.max(cursorY - 1, docY, 34);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.8);
    doc.line(14, headerBottom, 196, headerBottom);
    doc.setLineWidth(0.2);
    doc.line(14, headerBottom + 1.2, 196, headerBottom + 1.2);

    // ── Cartouches CLIENT / CHANTIER côte à côte ──
    const cardTop = headerBottom + 7;
    const cardW = 89, cardGap = 4, cardPad = 4;
    const cardLineH = 4.3;

    const clientLines = [{ text: client.name || L.unknownClient, bold: true }];
    if (client.address) {
        doc.setFontSize(9);
        doc.splitTextToSize(client.address, cardW - cardPad * 2).forEach(t => clientLines.push({ text: t }));
    }
    const clientCpCity = `${client.postal_code || ''} ${client.city || ''}`.trim();
    if (clientCpCity) clientLines.push({ text: clientCpCity });
    // SIREN/TVA si présents (cohérence visuelle Factur-X)
    if (client.siren) clientLines.push({ text: `${L.siren} : ${client.siren}` });
    if (client.tva_intracom) clientLines.push({ text: `${L.tvaIntra} : ${client.tva_intracom}` });

    const siteLines = [];
    if (devis.intervention_address) {
        doc.setFontSize(9);
        doc.splitTextToSize(devis.intervention_address, cardW - cardPad * 2).forEach(t => siteLines.push({ text: t }));
        const siteCpCity = `${devis.intervention_postal_code || ''} ${devis.intervention_city || ''}`.trim();
        if (siteCpCity) siteLines.push({ text: siteCpCity });
    } else {
        siteLines.push({ text: L.sameAsClientAddress, italic: true });
    }

    const cardH = 10 + Math.max(clientLines.length, siteLines.length) * cardLineH + 2;
    const drawCard = (x, label, lines) => {
        doc.setFillColor(...cardBg);
        doc.roundedRect(x, cardTop, cardW, cardH, 1.5, 1.5, 'F');
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...accent);
        doc.text(label.toUpperCase(), x + cardPad, cardTop + 5.5);
        let y = cardTop + 11;
        doc.setFontSize(9);
        lines.forEach(l => {
            doc.setFont(undefined, l.bold ? 'bold' : (l.italic ? 'italic' : 'normal'));
            doc.setTextColor(...(l.bold ? ink : subtle));
            doc.text(l.text, x + cardPad, y);
            y += cardLineH;
        });
    };
    drawCard(14, L.client, clientLines);
    drawCard(14 + cardW + cardGap, L.siteLabel, siteLines);

    let afterCards = cardTop + cardH + 7;

    // Infos Factur-X (catégorie d'opération) — factures uniquement
    if (isInvoice && devis.operation_category) {
        const catMap = { 'service': L.catService, 'goods': L.catGoods, 'mixed': L.catMixed };
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);
        doc.text(`${L.category} : ${catMap[devis.operation_category] || devis.operation_category}${devis.vat_on_debits ? ` — ${L.vatOnDebits}` : ''}`, 14, afterCards - 2);
        afterCards += 4;
    }

    // Titre / Objet (juste au-dessus du tableau)
    let tableStartY = afterCards;
    if (trTitle) {
        doc.setFontSize(10.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        const titleLines = doc.splitTextToSize(`${L.object} : ${trTitle}`, 182);
        doc.text(titleLines, 14, tableStartY);
        tableStartY += titleLines.length * 5.2 + 4;
    }

    // Objet des travaux : le paragraphe de périmètre, sous le titre qui lui sert
    // d'intitulé. Facultatif — sans lui, le rendu est exactement celui d'avant.
    // Exclu des avenants : le bloc Constat / Nouvelle solution ci-dessous y joue
    // déjà ce rôle, les deux feraient double emploi.
    const workObject = isAmendment ? '' : capWorkObject(trWorkObject);
    if (workObject) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);
        const objectLines = doc.splitTextToSize(workObject, 182);
        doc.text(objectLines, 14, tableStartY);
        tableStartY += objectLines.length * 4.4 + 4;
    }

    // Rattachement au devis initial : indispensable pour que le client situe
    // cette facture partielle dans le marché global.
    if (isSituation) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);
        doc.text(
            L.situationRef(
                situationInfo.index || 1,
                situationInfo.parent_quote_number || situationInfo.parent_quote_id || '—',
                situationInfo.parent_date ? fmtDate(situationInfo.parent_date) : ''
            ),
            14, tableStartY
        );
        tableStartY += 6;
    }

    if (isAmendment) {
        // --- AVENANT SECTIONS ---
        // 1. Reference
        // Le client doit reconnaître le devis cité : c'est son NUMÉRO qu'il a
        // reçu, pas l'identifiant interne de la base. Un avenant au devis n° 223
        // annonçait « Devis initial N° 271 », un numéro qui ne correspond à
        // aucun document entre ses mains. On retombe sur l'id si le numéro
        // manque (devis anciens, antérieurs à la numérotation par artisan).
        const parentRef = devis.parent_quote_data
            ? L.initialQuoteRef(
                devis.parent_quote_data.quote_number || devis.parent_quote_data.id,
                fmtDate(devis.parent_quote_data.date),
            )
            : L.initialQuoteRefUnknown;

        let currentY = tableStartY;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(parentRef, 14, currentY);
        currentY += 7;

        // 2. CONSTAT TERRAIN
        let details = devis.amendment_details || {};
        if (typeof details === 'string') {
            try {
                details = JSON.parse(details);
            } catch (e) {
                console.error("Error parsing amendment_details", e);
                details = {};
            }
        }

        // Une section vide (aucun champ rempli) n'apporte rien au client :
        // on ne l'imprime pas du tout, titre compris.
        const hasValue = (v) => (typeof v === 'string' ? v.trim() !== '' : !!v);
        const hasConstat = hasValue(details.constat_date)
            || hasValue(details.constat_description)
            || hasValue(details.constat_reason);
        const hasSolution = hasValue(details.solution_description)
            || hasValue(details.solution_technical_value);

        if (hasConstat) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`${L.fieldReport} :`, 14, currentY);
            currentY += 6;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(50, 50, 50);

            if (hasValue(details.constat_date)) {
                const introLines = doc.splitTextToSize(
                    L.discoveredOn(fmtDate(details.constat_date)),
                    182
                );
                doc.text(introLines, 14, currentY);
                currentY += introLines.length * 5;
            }
            if (hasValue(details.constat_description)) {
                const descLines = doc.splitTextToSize(details.constat_description, 182);
                doc.text(descLines, 14, currentY);
                currentY += (descLines.length * 5) + 2;
            }

            if (hasValue(details.constat_reason)) {
                const reasonLines = doc.splitTextToSize(
                    L.impossibility(details.constat_reason),
                    182
                );
                doc.text(reasonLines, 14, currentY);
                currentY += (reasonLines.length * 5) + 5;
            } else {
                currentY += 5;
            }
        }

        // 3. NOUVELLE SOLUTION
        if (hasSolution) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`${L.newSolution} :`, 14, currentY);
            currentY += 6;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(50, 50, 50);

            if (hasValue(details.solution_description)) {
                const solLines = doc.splitTextToSize(`- ${details.solution_description}`, 182);
                doc.text(solLines, 14, currentY);
                currentY += (solLines.length * 5);
            }

            // Ce libellé annonce les fournitures de l'avenant : il n'a de sens
            // que s'il y en a. Il s'imprimait systématiquement, y compris sur un
            // avenant de pure main d'œuvre, où il annonçait un poste inexistant.
            // (Les lignes sont relues ici : `materials` n'est constitué que plus
            // bas, au moment des tableaux.)
            const hasMaterialLines = (devis.items || []).some(i => i.type === 'material');
            if (hasMaterialLines) {
                doc.text(L.additionalMaterial, 14, currentY);
                currentY += 5;
            }

            if (hasValue(details.solution_technical_value)) {
                const valueLines = doc.splitTextToSize(
                    L.technicalAddedValue(details.solution_technical_value),
                    182
                );
                doc.text(valueLines, 14, currentY);
                currentY += (valueLines.length * 5) + 3;
            } else {
                currentY += 3;
            }
        }

        tableStartY = currentY;
    }

    // ---------------------------------------------------------
    // Tableau des prestations
    // ---------------------------------------------------------

    // Les tableaux A / B ne portent que le chiffrage ferme ; les options
    // proposées sortent dans leur propre bloc, après les totaux (cf.
    // quoteOptionLines.js). Une colonne de montants du tableau est ainsi
    // toujours entièrement due, et sous-total main d'œuvre + sous-total
    // fournitures retombe sur le TOTAL sans écart à expliquer.
    const { firmItems: allItems, offeredOptions } = splitQuoteOptionLines(devis.items);
    const materials = allItems.filter(i => i.type === 'material');
    const tableColumn = [L.colDescription, L.colQty, L.colUnitPrice, L.colTotal];

    const fmtMoney = formatAmount;
    // Montant d'une ligne (cf. materialDeposit.js : gère aussi les postes
    // fusionnés line_total du mode « poste global »).
    const lineAmountOf = quoteLineAmount;
    // Une ligne à 0 € est affichée "Offert" plutôt que "0.00 €" (geste commercial lisible)
    const unitPriceCell = (item) => (parseFloat(item.price) || 0) === 0 ? L.offered : fmtMoney(item.price);
    const lineTotalCell = (item) => lineAmountOf(item) === 0 ? L.offered : fmtMoney(lineAmountOf(item));

    // Style commun : filets discrets, zébrage léger, montants alignés à droite.
    // La couleur d'en-tête (bandeau + ligne Désignation) est fixée par tableau :
    // rouge accent pour A — Main d'œuvre, noir pour B — Fournitures (cf. modèle).
    const tableDark = [51, 51, 51];
    const baseTableStyle = {
        theme: 'grid',
        styles: { fontSize: 9, overflow: 'linebreak', cellWidth: 'wrap', cellPadding: 2.2, lineColor: hairline, lineWidth: 0.15, textColor: ink },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 16, halign: 'right' },
            2: { cellWidth: 26, halign: 'right' },
            3: { cellWidth: 26, halign: 'right' },
        },
        margin: { left: 14, right: 14 },
        tableWidth: 'auto',
    };
    // Bandeau de section (lettré) au-dessus des libellés de colonnes, dans la
    // même couleur que la ligne de libellés
    const sectionHead = (label, color, columns = tableColumn) => ([
        [{ content: label, colSpan: columns.length, styles: { fillColor: color, textColor: 255, halign: 'left', fontSize: 9.5, fontStyle: 'bold', cellPadding: 2.4 } }],
        columns,
    ]);
    const headStylesFor = (color) => ({ fillColor: color, textColor: 255, fontSize: 8.5, fontStyle: 'bold' });
    const styleOfferedCell = (data) => {
        if (data.section === 'body' && data.cell.raw === L.offered) {
            data.cell.styles.fontStyle = 'italic';
            data.cell.styles.textColor = subtle;
        }
    };

    // Track current Y position for multiple tables
    let currentTableY = tableStartY;

    // Présentation « groupée » choisie par l'artisan pour ce client : chaque
    // poste reste expliqué (la description détaille ce qu'il couvre) mais les
    // FOURNITURES s'affichent sans quantités ni prix unitaires — un montant par
    // poste. Le devis ne peut pas servir de liste de courses, la main d'œuvre
    // reste détaillée (heures, taux). Les factures de situation gardent le
    // détail complet (le % d'avancement y est par poste).
    const groupedDisplay = devis.client_display_mode === 'grouped' && !isSituation;
    // Présentation « poste global » : les items reçus sont DÉJÀ fusionnés côté
    // serveur (un poste par section : libellé + total, sans détail). Le rendu se
    // contente d'afficher désignation + total ; les éléments à l'unité gardent
    // leur quantité en suffixe (« Prises encastrées — 17 u »).
    const posteGlobalDisplay = devis.client_display_mode === 'poste_global' && !isSituation;

    {
        // Tableaux lettrés : A — Main d'œuvre, B — Fournitures (lettre seulement si
        // les deux existent). Les sections personnalisées du devis deviennent des
        // sous-titres teintés à l'intérieur du groupe où se trouvent leurs lignes.
        const services = allItems.filter(i => i.type === 'service' || !i.type);
        const bothGroups = services.length > 0 && materials.length > 0;

        // Seules les options RETENUES parviennent jusqu'ici : elles sont dues,
        // donc comptées partout. Le libellé « (Option retenue) » garde lisible
        // qu'elles viennent d'un choix du client — sans lui, une option
        // acceptée redevenait une ligne ordinaire dont on ne savait plus si le
        // client l'avait demandée. Les options proposées et les options
        // écartées sont, elles, dans le bloc « Options » après les totaux.
        const itemLabel = (item) => {
            const desc = trLine(item.description || '');
            return item.option_accepted ? `${L.optionAcceptedPrefix} ${desc}` : desc;
        };
        const itemRow = (item) => [
            itemLabel(item),
            item.quantity,
            unitPriceCell(item),
            lineTotalCell(item)
        ];
        // Ligne fourniture en présentation groupée : désignation complète +
        // montant de la ligne, sans aucun quantitatif (ni quantité, ni prix
        // unitaire). C'est la désignation qui décrit le contenu — « Tableau
        // 4 rangées Schneider XE précâblé comprenant parafoudre, 4 inter diff
        // 63 A et 25 disjoncteurs », « 12 spots LED encastrés »…
        //
        // Comme la quantité est masquée, on accorde le nom de tête au pluriel
        // quand il y en a plusieurs, pour que le client ne croie pas n'acheter
        // qu'une pièce (« Disjoncteur 16A » → « Disjoncteurs 16A »).
        const groupedMaterialLabel = (item) => {
            let desc = trLine(item.description || '');
            if ((parseFloat(item.quantity) || 0) > 1) desc = pluralizeFrenchHead(desc);
            return item.option_accepted ? `${L.optionAcceptedPrefix} ${desc}` : desc;
        };
        const groupedMaterialRow = (item) => [groupedMaterialLabel(item), lineTotalCell(item)];
        // Présentation « poste global » : le libellé du poste + son total. Les
        // lignes vendues à l'unité (per_unit) gardent leur quantité en suffixe.
        const posteLabel = (item) => {
            const base = itemLabel(item);
            if (!item.per_unit) return base;
            const q = parseFloat(item.quantity) || 0;
            const qStr = Number.isInteger(q) ? String(q) : q.toLocaleString('fr-FR');
            return `${base} — ${qStr} ${item.unit || 'u'}`;
        };
        const posteRow = (item) => [posteLabel(item), lineTotalCell(item)];
        // Parcourt tous les items dans l'ordre : émet les lignes du type demandé,
        // précédées du sous-titre de leur section personnalisée (une seule fois
        // par section et par tableau, même si la section mélange les types).
        const buildGroupRows = (matches, rowFn = itemRow, colCount = 4) => {
            const rows = [];
            let currentSection = null;
            let emittedSection = null;
            for (const item of allItems) {
                if (item.type === 'section') {
                    currentSection = trLine(item.description || '').trim();
                    continue;
                }
                if (!matches(item)) continue;
                if (currentSection && currentSection !== emittedSection) {
                    rows.push([{
                        content: currentSection,
                        colSpan: colCount,
                        styles: { fontStyle: 'bold', fillColor: accentTint, textColor: accent, halign: 'left', fontSize: 9 }
                    }]);
                    emittedSection = currentSection;
                }
                rows.push(rowFn(item));
            }
            return rows;
        };

        // Colonnes réduites (Désignation + Total) partagées par « groupé » et
        // « poste global » : aucune quantité ni prix unitaire de fourniture.
        const twoColStyle = {
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 30, halign: 'right' },
            },
        };

        if (services.length > 0) {
            // En « poste global », la main d'œuvre est réduite à une ligne par
            // section (libellé + total) ; sinon détail heures / taux / total.
            const laborColumns = posteGlobalDisplay
                ? [L.colDescription, L.colTotal]
                : [L.colDescription, `${L.colQty} (h)`, L.colUnitPrice, L.colTotal];
            autoTable(doc, {
                startY: currentTableY,
                head: sectionHead(`${bothGroups ? 'A — ' : ''}${L.tableLaborHeader}`, accent, laborColumns),
                body: posteGlobalDisplay
                    ? buildGroupRows(i => i.type === 'service' || !i.type, posteRow, 2)
                    : buildGroupRows(i => i.type === 'service' || !i.type),
                ...baseTableStyle,
                ...(posteGlobalDisplay ? twoColStyle : {}),
                headStyles: headStylesFor(accent),
                didParseCell: styleOfferedCell,
            });
            currentTableY = doc.lastAutoTable.finalY + 6;
        }

        if (materials.length > 0) {
            const twoColMaterial = groupedDisplay || posteGlobalDisplay;
            const materialColumns = twoColMaterial ? [L.colDescription, L.colTotal] : tableColumn;
            autoTable(doc, {
                startY: currentTableY,
                head: sectionHead(`${bothGroups ? 'B — ' : ''}${L.tableMaterialHeader}`, tableDark, materialColumns),
                body: posteGlobalDisplay
                    ? buildGroupRows(i => i.type === 'material', posteRow, 2)
                    : groupedDisplay
                        ? buildGroupRows(i => i.type === 'material', groupedMaterialRow, 2)
                        : buildGroupRows(i => i.type === 'material'),
                ...baseTableStyle,
                ...(twoColMaterial ? twoColStyle : {}),
                headStyles: headStylesFor(tableDark),
                didParseCell: styleOfferedCell,
            });
            currentTableY = doc.lastAutoTable.finalY + 6;
        }
        currentTableY += 2;
    }

    if (isAmendment) {
        // AJUSTEMENT FINANCIER
        const details = devis.amendment_details || {};
        let finalY = (currentTableY > tableStartY ? currentTableY : tableStartY) + 10;

        // Le bloc « Ajustement Financier » occupe ~45 à 57 mm (titre + 4 à 7 lignes).
        // S'il ne tient pas en bas de la page courante, on passe à une nouvelle
        // page pour ne pas le tronquer (constat + solution + tableau peuvent
        // pousser ce bloc tout en bas).
        const pageHeightMm = doc.internal.pageSize.getHeight();
        if (finalY + 62 > pageHeightMm - 15) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${L.financialAdjustment} :`, 14, finalY);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        let financeY = finalY + 8;

        // Acompte(s) déjà versé(s) sur le devis initial : un avenant COMPLÈTE le
        // devis, l'acompte est une avance à déduire du solde (il ne remplace pas
        // le devis). deposit_total est calculé côté formulaire (somme des factures
        // d'acompte, hors situations) ; on retombe sur initial_deposit_amount si
        // cette valeur n'a pas été fournie.
        const deposit = (devis.parent_quote_data?.deposit_total || 0)
            || (details?.initial_deposit_amount || 0);

        // Même calcul que l'encadré de l'éditeur (amendmentProjectTotals) :
        // devis initial ou situations facturées, avenants précédents signés,
        // montant de cet avenant, puis acompte et avenants déjà facturés déduits.
        const totals = amendmentProjectTotals(
            { ...(devis.parent_quote_data || {}), deposit_total: deposit },
            parseFloat(devis.total_ttc) || 0,
        );
        const { initialTTC, amendmentTTC, progressTotal, previousAmendmentsTTC,
            previousAmendmentsBilledTTC, previousAmendmentsCount, newTotal } = totals;
        const leftX = 14;
        const rightValueX = 100;
        const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} €`;
        const drawPreviousAmendments = () => {
            if (previousAmendmentsCount === 0) return;
            doc.text(`${L.previousAmendments(previousAmendmentsCount)} :`, leftX, financeY);
            doc.text(signed(previousAmendmentsTTC), rightValueX, financeY, { align: 'right' });
            financeY += 6;
        };

        // SCENARIO CHECK: Has Progress (Situation) Invoice?
        // If yes, Situation replaces Initial Quote for billing baseline.
        // If no, we use Initial Quote + Amendment - Deposit.


        if (progressTotal > 0) {
            // SCENARIO A: WITH SITUATION 
            // Display: Initial (Ref), Situation (Billed), Amendment (New), Global Total (Sit + Amend)
            // Balance = Amendment Total (as Situation is billed separately)

            doc.text(`${L.initialQuoteTTC} :`, leftX, financeY);
            doc.text(`${initialTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.text(`${L.billedToDate} :`, leftX, financeY);
            doc.text(`${progressTotal.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(L.includingDeposit, rightValueX, financeY + 3, { align: 'right' });
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            drawPreviousAmendments();

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235); // Blue
            doc.text(`${L.amendmentAmountTTC} :`, leftX, financeY);
            doc.text(`${amendmentTTC >= 0 ? '+' : ''}${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            doc.setFontSize(12);
            doc.text(`${L.newProjectTotal} :`, leftX, financeY);
            // Nouveau total = situations + avenants précédents signés + cet avenant
            doc.text(`${newTotal.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(L.balanceOnAmendment(amendmentTTC.toFixed(2)), rightValueX, financeY, { align: 'right' });

        } else {
            // SCENARIO B: NO SITUATION (Standard Additive)
            // Balance = Initial + Amendment - Deposit

            doc.text(`${L.initialQuoteTTC} :`, leftX, financeY);
            doc.text(`${initialTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            drawPreviousAmendments();

            if (deposit > 0) {
                doc.text(`${L.depositPaid} :`, leftX, financeY);
                doc.text(`${deposit.toFixed(2)} € ${L.kept}`, rightValueX, financeY, { align: 'right' });
                financeY += 6;
            }

            if (previousAmendmentsBilledTTC > 0) {
                doc.text(`${L.previousAmendmentsBilled} :`, leftX, financeY);
                doc.text(`-${previousAmendmentsBilledTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
                financeY += 6;
            }

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235);
            doc.text(`${L.amendmentComplementTTC} :`, leftX, financeY);
            doc.text(`${amendmentTTC >= 0 ? '+' : ''}${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            // Solde = devis initial + avenants précédents + cet avenant
            //         − acompte − avenants précédents déjà facturés
            const balance = totals.remaining;

            doc.setFontSize(12);
            doc.text(`${L.newBalanceDue} :`, leftX, financeY);
            doc.text(`${balance.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(L.projectTotal(newTotal.toFixed(2)), rightValueX, financeY, { align: 'right' });
        }

        // Update currentY for next sections
        currentTableY = financeY + 10;

    } else {
        // ── Bloc totaux (à droite) : sous-totaux, TVA, total en accent ──
        const laborItems = allItems.filter(i => i.type === 'service' || !i.type);
        // lineAmountOf gère aussi les postes fusionnés (line_total) du mode global.
        // allItems ne contient déjà plus que des lignes fermes : sous-total main
        // d'œuvre + sous-total fournitures = TOTAL, et chaque sous-total est bien
        // la somme de la colonne du tableau au-dessus.
        const sumHT = (items) => items.reduce((s, i) => s + lineAmountOf(i), 0);
        const showSubtotals = laborItems.length > 0 && materials.length > 0;

        const totalsRows = [];
        if (showSubtotals) {
            totalsRows.push([L.subtotalLabor, fmtMoney(sumHT(laborItems))]);
            totalsRows.push([L.subtotalMaterial, fmtMoney(sumHT(materials))]);
        } else if (devis.include_tva !== false) {
            // Sans TVA, la ligne "Total HT" serait identique au TOTAL HT final
            totalsRows.push([L.totalHT, fmtMoney(devis.total_ht)]);
        }
        totalsRows.push(devis.include_tva !== false
            ? [L.vat('20%'), fmtMoney(devis.total_tva)]
            : [L.vatShort, L.vatNotApplicableShort]);
        // En franchise de TVA, le total « HT » est la somme réellement due :
        // on le nomme donc pour ce qu'il est, et la phrase sous le bloc évite
        // au client de se demander s'il faut encore ajouter 20 %.
        const franchise = isVatFranchise(devis)
            ? vatFranchiseTotal({ isInvoice, isCreditNote, lang })
            : null;
        const grandLabel = franchise ? franchise.label : L.totalTTC;
        const grandValue = fmtMoney(devis.total_ttc);

        const totX = 106, totRight = 196, rowH = 7;
        let franchiseNoteLines = [];
        if (franchise) {
            // La découpe dépend de la police courante : on fixe celle du rendu
            // avant de mesurer, sinon la note déborde de la colonne des totaux.
            doc.setFontSize(7.2);
            doc.setFont(undefined, 'italic');
            franchiseNoteLines = doc.splitTextToSize(franchise.note, totRight - totX - 2);
        }
        const blockH = (totalsRows.length + 1) * rowH + 3 + franchiseNoteLines.length * 3.4;

        let finalY = currentTableY > tableStartY ? currentTableY : 150;
        if (finalY + blockH > 282) {
            doc.addPage();
            finalY = 20;
        }

        let rowY = finalY + 2;
        totalsRows.forEach(([label, value]) => {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(label, totX, rowY + 2.5);
            const isVatMention = value === L.vatNotApplicableShort;
            doc.setFontSize(isVatMention ? 7.8 : 9.5);
            doc.setFont(undefined, isVatMention ? 'italic' : 'normal');
            doc.setTextColor(...(isVatMention ? subtle : ink));
            doc.text(value, totRight - 2, rowY + 2.5, { align: 'right' });
            doc.setDrawColor(...hairline);
            doc.setLineWidth(0.15);
            doc.line(totX, rowY + 5, totRight, rowY + 5);
            rowY += rowH;
        });

        // Ligne du total : fond teinté accent, montant en gras
        doc.setFillColor(...accentTint);
        doc.roundedRect(totX - 2, rowY - 1.5, totRight - totX + 4, rowH + 1.5, 1.2, 1.2, 'F');
        doc.setFontSize(10.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...accent);
        doc.text(grandLabel, totX, rowY + 3.5);
        doc.setFontSize(11.5);
        doc.text(grandValue, totRight - 2, rowY + 3.5, { align: 'right' });

        let noteY = rowY + rowH + 3.5;
        if (franchiseNoteLines.length > 0) {
            doc.setFontSize(7.2);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(...subtle);
            franchiseNoteLines.forEach((line) => {
                doc.text(line, totRight - 2, noteY, { align: 'right' });
                noteY += 3.4;
            });
            noteY += 1;
        }

        currentTableY = Math.max(rowY + rowH + 4, noteY);
    }

    // ── Options proposées, hors total ──
    //
    // Placé APRÈS le total, jamais avant : le client lit d'abord ce qu'il doit,
    // puis ce qu'on lui propose en plus. Le bloc porte son propre en-tête, une
    // colonne « Montant si retenue » qui nomme la condition, et une phrase qui
    // dit en toutes lettres que rien de tout cela n'est dû — c'est exactement ce
    // qu'un préfixe « (Option) » perdu au milieu d'une colonne de montants ne
    // disait pas.
    //
    // Une option écartée à la signature (option_declined) est barrée : le devis
    // signé garde la trace de ce qui avait été proposé, sans laisser croire une
    // seconde qu'il a été facturé.
    if (offeredOptions.length > 0) {
        // rowMeta suit optionRows ligne pour ligne : l'option correspondante,
        // ou null pour un sous-titre de section. didDrawCell retrouve ainsi son
        // option par simple index, sans avoir à recompter les lignes.
        // Une option est soit retenue — elle a rejoint les tableaux comme ligne
        // ferme —, soit écartée : ce bloc est donc homogène, tout entier au
        // présent avant signature et tout entier au passé après. D'où un titre,
        // un intitulé de colonne et une phrase qui suivent cet état, plutôt
        // qu'une mention « Non retenue » répétée sur chaque ligne, qui doublait
        // le texte barré et le poussait à la ligne.
        const optionsDeclined = offeredOptions.some(i => i.option_declined);

        const optionRows = [];
        const rowMeta = [];
        let emittedSection = null;
        for (const item of offeredOptions) {
            const sectionName = item.option_section ? trLine(item.option_section).trim() : null;
            if (sectionName && sectionName !== emittedSection) {
                optionRows.push([{
                    content: sectionName,
                    colSpan: 2,
                    styles: { fontStyle: 'bold', fillColor: [245, 245, 245], textColor: tableDark, halign: 'left', fontSize: 9 }
                }]);
                rowMeta.push(null);
                emittedSection = sectionName;
            }
            optionRows.push([trLine(item.description || ''), lineTotalCell(item)]);
            rowMeta.push(item);
        }

        const optionNote = optionsDeclined ? L.optionsBlockNoteSigned : L.optionsBlockNote;

        doc.setFontSize(7.6);
        doc.setFont(undefined, 'italic');
        const optionNoteLines = doc.splitTextToSize(optionNote, 182);

        // Un bloc coupé par un saut de page perdrait sa phrase d'avertissement :
        // on estime sa hauteur (bandeau + libellés + lignes + note) pour le
        // pousser entier sur la page suivante s'il ne tient pas.
        const optionsBlockH = 18 + optionRows.length * 8 + optionNoteLines.length * 3.4 + 6;
        let optionsY = currentTableY + 6;
        if (optionsY + optionsBlockH > 280) {
            doc.addPage();
            optionsY = 20;
        }

        autoTable(doc, {
            startY: optionsY,
            head: sectionHead(
                optionsDeclined ? L.optionsBlockTitleSigned : L.optionsBlockTitle,
                tableDark,
                [L.colDescription, optionsDeclined ? L.colOptionAmountSigned : L.colOptionAmount],
            ),
            body: optionRows,
            ...baseTableStyle,
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 34, halign: 'right' },
            },
            headStyles: headStylesFor(tableDark),
            // Une option n'est pas due : son montant reste lisible — le client
            // en a besoin pour décider — mais en gris, jamais dans le noir des
            // lignes à payer.
            didParseCell: (data) => {
                styleOfferedCell(data);
                if (data.section === 'body' && rowMeta[data.row.index]) {
                    data.cell.styles.textColor = subtle;
                }
            },
            didDrawCell: (data) => {
                if (data.section !== 'body' || data.column.index !== 0) return;
                if (!rowMeta[data.row.index]?.option_declined) return;
                const lines = data.cell.text || [];
                if (lines.length === 0) return;

                // Le trait suit la ligne de base d'autoTable : celle-ci descend
                // du haut du texte de fontSize × (2 − 1,15), puis d'une hauteur
                // de ligne par ligne supplémentaire (cf. autoTableText). On
                // remonte ensuite d'un tiers de corps pour barrer le texte à
                // mi-hauteur plutôt qu'à ses pieds.
                const fontSize = data.cell.styles.fontSize / doc.internal.scaleFactor;
                const lineHeight = fontSize * (doc.getLineHeightFactor?.() ?? 1.15);
                const textPos = data.cell.getTextPos();
                let baseline = textPos.y + fontSize * 0.85;
                if (data.cell.styles.valign === 'middle') baseline -= (lines.length / 2) * lineHeight;
                else if (data.cell.styles.valign === 'bottom') baseline -= lines.length * lineHeight;

                // Chaque ligne est barrée sur sa largeur réelle : un trait tiré
                // sur toute la cellule traverserait aussi le vide à droite.
                doc.setFontSize(data.cell.styles.fontSize);
                doc.setDrawColor(...subtle);
                doc.setLineWidth(0.3);
                const left = data.cell.x + data.cell.padding('left');
                lines.forEach((text, i) => {
                    const y = baseline + i * lineHeight - fontSize / 3;
                    doc.line(left, y, left + doc.getTextWidth(text), y);
                });
            },
        });

        let optionNoteY = doc.lastAutoTable.finalY + 4;
        doc.setFontSize(7.6);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...subtle);
        optionNoteLines.forEach((line) => {
            doc.text(line, 14, optionNoteY);
            optionNoteY += 3.4;
        });
        currentTableY = optionNoteY + 2;
    }

    // Position for Notes
    const finalTableY = isAmendment ? currentTableY + 4 : currentTableY;
    let currentY = finalTableY + 8;

    const allNotes = trNotes || '';

    // ── Avancement du chantier (facture de situation) : situe la facture dans
    // le marché global — total du devis, déjà facturé, présente situation,
    // reste à facturer. Le reste est recalculé ici pour rester cohérent avec
    // le total affiché même si la facture a été modifiée après création. ──
    if (isSituation && (Number(situationInfo.parent_total_ttc) || 0) > 0) {
        const parentTotal = Number(situationInfo.parent_total_ttc) || 0;
        const previouslyBilled = Number(situationInfo.previously_billed_ttc) || 0;
        const thisInvoiceTTC = Number(devis.total_ttc) || 0;
        const remaining = Math.max(parentTotal - previouslyBilled - thisInvoiceTTC, 0);
        const parentRef = situationInfo.parent_quote_number || situationInfo.parent_quote_id || '—';

        const explainLines = doc.splitTextToSize(L.situationExplain, 182);
        const recapRows = [
            [L.situationQuoteTotal(parentRef), fmtMoney(parentTotal), false],
            [L.situationThisInvoice, fmtMoney(thisInvoiceTTC), true],
            [L.situationRemaining, fmtMoney(remaining), false],
        ];
        // Ligne "déjà facturé" seulement à partir de la 2e situation (sinon 0 €)
        if (previouslyBilled > 0) {
            recapRows.splice(1, 0, [L.situationPreviouslyBilled, fmtMoney(previouslyBilled), false]);
        }
        const recapBlockH = 8 + recapRows.length * 7 + explainLines.length * 3.6 + 6;
        if (currentY + recapBlockH > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        doc.text(L.situationRecapTitle(devis.include_tva !== false), 14, currentY);
        currentY += 5.5;

        recapRows.forEach(([label, value, highlight]) => {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(label, 14, currentY + 2.5);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...(highlight ? accent : ink));
            doc.text(value, 196, currentY + 2.5, { align: 'right' });
            doc.setDrawColor(...hairline);
            doc.setLineWidth(0.15);
            doc.line(14, currentY + 5, 196, currentY + 5);
            currentY += 7;
        });

        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...subtle);
        doc.text(explainLines, 14, currentY + 3);
        currentY += explainLines.length * 3.6 + 8;
    }

    // ── Conditions de règlement (acompte matériel) : tableau acompte / solde ──
    // Les fournitures optionnelles sont exclues de l'acompte (cf.
    // materialDeposit.js) : tant qu'une option n'est pas retenue, elle ne fait
    // pas partie du chiffrage ferme (même règle que le total et que l'acompte
    // généré depuis le formulaire). Sans ce filtre, le solde (total ferme −
    // acompte) ne correspond plus à la main d'œuvre.
    const depositAmounts = (!isInvoice && devis.has_material_deposit === true)
        ? materialDepositAmounts(devis)
        : null;
    if (depositAmounts) {
        const { materialTTC, balanceTTC } = depositAmounts;

        const sentenceLines = doc.splitTextToSize(L.depositSentence, 182);
        const depositBlockH = 8 + 2 * 7 + sentenceLines.length * 3.6 + 6;
        if (currentY + depositBlockH > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        doc.text(L.paymentConditions, 14, currentY);
        currentY += 5.5;

        const depositRows = [
            [L.depositOnOrder, fmtMoney(materialTTC), true],
            [L.balanceOnCompletion, fmtMoney(balanceTTC), false],
        ];
        depositRows.forEach(([label, value, highlight]) => {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(label, 14, currentY + 2.5);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...(highlight ? accent : ink));
            doc.text(value, 196, currentY + 2.5, { align: 'right' });
            doc.setDrawColor(...hairline);
            doc.setLineWidth(0.15);
            doc.line(14, currentY + 5, 196, currentY + 5);
            currentY += 7;
        });

        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...subtle);
        doc.text(sentenceLines, 14, currentY + 3);
        currentY += sentenceLines.length * 3.6 + 8;
    }

    // ── Conditions de règlement (acompte en % du total) : tableau acompte / solde ──
    // Affiché pour les devis avec un acompte demandé, sauf si le tableau d'acompte
    // matériel ci-dessus est déjà rendu (pour éviter deux tableaux contradictoires).
    const materialDepositShown = depositAmounts != null;
    const depositPct = Number(devis.deposit_percentage) || 0;
    if (!isInvoice && !materialDepositShown && depositPct > 0) {
        const totalTTC = Number(devis.total_ttc) || 0;
        const depositTTC = totalTTC * depositPct / 100;
        const balanceTTC = Math.max(totalTTC - depositTTC, 0);

        const sentenceLines = doc.splitTextToSize(L.depositSentenceGeneric, 182);
        const depositBlockH = 8 + 2 * 7 + sentenceLines.length * 3.6 + 6;
        if (currentY + depositBlockH > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        doc.text(L.paymentConditions, 14, currentY);
        currentY += 5.5;

        const depositRows = [
            [L.depositOnSignature(depositPct), fmtMoney(depositTTC), true],
            [L.balanceOnCompletion, fmtMoney(balanceTTC), false],
        ];
        depositRows.forEach(([label, value, highlight]) => {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(label, 14, currentY + 2.5);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...(highlight ? accent : ink));
            doc.text(value, 196, currentY + 2.5, { align: 'right' });
            doc.setDrawColor(...hairline);
            doc.setLineWidth(0.15);
            doc.line(14, currentY + 5, 196, currentY + 5);
            currentY += 7;
        });

        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(...subtle);
        doc.text(sentenceLines, 14, currentY + 3);
        currentY += sentenceLines.length * 3.6 + 8;
    }

    // --- NEW: Add Before/After Montage to PDF if title matches ---
    if (isInvoice && devis.title) {
        try {
            // Fetch montage if it exists for this project (based on title matching)
            // Ideally we should have a direct link, but user asked for "title match" or connection.
            // Let's assume we can fetch by client_id and description filter + title correlation?
            // Or simpler: fetch ANY "Montage" for this client created recently?
            // User request: "les montages avant/apres qui sont en rapport avec le nom de la facture."
            // This implies we need to Query Supabase HERE directly? 
            // pdfGenerator isn't a component, but we can import supabase.

            // However, doing async fetch inside here is fine as function is async.
            const { supabase } = await import('../supabase'); // dynamic import to avoid circ dependencies if utils

            // We search in project_photos for this user/client where description contains 'Montage' AND matches quote title keywords?
            // Actually, user said: "dans la liste des dossiers photos chantier, ajoute automatiquement le titre du devis signé... pour que je puisse y ajouter facilement les photos correspondantes et que le bon montage aille dans la bonne facture"
            // This suggests the "Project Name" (dossier photo) == "Quote Title".

            // So we look for a project (folder) named exactly like devis.title? Or photos linked to project_id where project.name == devis.title.
            // In current schema, photos have project_id. Projects have name.

            // Let's Find the Project first.
            const { data: project } = await supabase
                .from('projects')
                .select('id')
                .eq('name', devis.title) // Assuming title matches project name exactly as per user request
                .eq('client_id', devis.client_id)
                .single();

            if (project) {
                const { data: photos } = await supabase
                    .from('project_photos')
                    .select('photo_url')
                    .eq('project_id', project.id)
                    .ilike('description', '%Montage Avant / Après%')
                    .limit(1); // One montage per invoice usually sufficient?

                if (photos && photos.length > 0) {
                    const montageUrl = photos[0].photo_url;
                    // Add page for montage
                    doc.addPage();

                    // Title
                    doc.setFontSize(16);
                    doc.setTextColor(0, 0, 0);
                    doc.text(L.beforeAfter, 105, 20, { align: 'center' });

                    // Image
                    // doc.addImage(montageUrl, 'JPEG', x, y, w, h);
                    // Need to handle async image loading / base64 for jsPDF
                    // Since we reuse logic, let's try addImage if URL works (depends on Supabase CORS).
                    // Ideally we fetch blob.

                    try {
                        const imgBlob = await fetch(montageUrl).then(r => r.blob());
                        const reader = new FileReader();
                        const base64data = await new Promise((resolve) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(imgBlob);
                        });

                        // Fit to page (A4 w=210)
                        const imgProps = doc.getImageProperties(base64data);
                        const pdfWidth = 180;
                        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                        doc.addImage(base64data, 'JPEG', 15, 40, pdfWidth, pdfHeight);
                    } catch (err) {
                        console.error("Failed to embed montage", err);
                    }
                }
            }
        } catch (e) {
            console.warn("Error auto-adding montage", e);
        }
    }



    // Notes / Conditions Display
    if (allNotes) {
        // La taille de police doit être fixée AVANT splitTextToSize : le découpage
        // mesure la largeur avec la police courante. Sans ça, le texte hérite d'une
        // police plus petite (8pt) du bloc précédent, est découpé trop large, puis
        // rendu en 10pt — et dépasse alors la marge droite.
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const splitNotes = doc.splitTextToSize(allNotes, 180);

        // Check if header fits on current page
        if (currentY + 11 > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setTextColor(100, 100, 100);
        doc.text(`${L.notesConditions} :`, 14, currentY);
        currentY += 6;

        // Render line by line to handle notes spanning multiple pages
        for (const line of splitNotes) {
            if (currentY + 5 > 280) {
                doc.addPage();
                currentY = 20;
            }
            doc.text(line, 14, currentY);
            currentY += 5;
        }
        currentY += 10;
    }

    // ── Bloc d'accord à deux colonnes : artisan / "Bon pour accord — le client" ──
    // Toujours affiché sur un devis (zone de signature même en impression papier).
    // Masqué si payé : "Bon pour accord" n'a plus de sens sur une quittance.
    const showApprovalBlock = devis.status !== 'paid' && (!isInvoice || devis.signature);
    if (showApprovalBlock) {
        const approvalH = devis.signature ? 48 : 26;
        if (currentY + approvalH > 280) {
            doc.addPage();
            currentY = 20;
        }

        const approvalY = currentY + 6;

        // Colonne gauche bornée avant la colonne droite (x=110) pour éviter le
        // chevauchement avec « Bon pour accord — le client ».
        const approvalColWidth = 110 - 14 - 4;
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        const forCompanyText = L.forCompany(companyName);
        fitFontSize(forCompanyText, approvalColWidth, 9, 7);
        doc.text(ellipsize(forCompanyText, approvalColWidth), 14, approvalY);
        if (userProfile.full_name) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(ellipsize(userProfile.full_name, approvalColWidth), 14, approvalY + 5);
        }
        doc.setFontSize(9);

        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        const bonPourAccordText = devis.bon_pour_accord ? devis.bon_pour_accord : L.clientApproval;
        doc.text(bonPourAccordText, 110, approvalY);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);

        if (devis.signature) {
            const signedDate = devis.signed_at ? new Date(devis.signed_at) : new Date(devis.updated_at || devis.date || new Date());
            doc.text(L.signedOn(formatDate(signedDate, { locale: L.dateLocale })), 110, approvalY + 5);
            try {
                doc.addImage(devis.signature, 'PNG', 110, approvalY + 8, 50, 25);
            } catch (e) {
                console.warn("Could not add signature to PDF", e);
            }
        } else {
            doc.text(L.readApproved, 110, approvalY + 5);
        }

        currentY += approvalH;
    }

    // Informations de paiement (IBAN + Wero) — pas sur un avoir : c'est
    // l'artisan qui doit (remboursement ou imputation), pas le client.
    const hasIban = !isCreditNote && userProfile.iban && userProfile.iban.trim().length > 0;
    const weroNumber = (!isCreditNote && userProfile.wero_phone && userProfile.wero_phone.trim().length > 0) ? userProfile.wero_phone : null;

    // Determine content start Y (after Notes/Approval block)
    let elementY = currentY + 6;

    if (hasIban || weroNumber) {
        const boxHeight = 32;

        // Check if box fits
        if (elementY + boxHeight > 285) {
            doc.addPage();
            elementY = 20;
        }

        // Box
        doc.setDrawColor(...hairline);
        doc.setLineWidth(0.2);
        doc.setFillColor(...cardBg);
        doc.roundedRect(14, elementY, 182, boxHeight, 1.5, 1.5, 'FD');

        // Title
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        doc.text(`${L.paymentMethods} :`, 20, elementY + 8);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');

        let lineOffset = 16;

        // IBAN Line
        if (hasIban) {
            doc.text(L.transfer, 20, elementY + lineOffset);
            doc.setFont(undefined, 'bold');
            doc.text(`${L.iban} : ${userProfile.iban}`, 55, elementY + lineOffset);
            doc.setFont(undefined, 'normal');
            lineOffset += 6;
        }

        // Wero Line
        // Wero Line
        if (weroNumber && weroNumber.trim().length > 0) {
            doc.text(L.weroLabel, 20, elementY + lineOffset);
            doc.setFont(undefined, 'bold');
            const weroText = L.weroPhone(weroNumber, userProfile.full_name || userProfile.company_name || '');
            doc.text(weroText, 55, elementY + lineOffset);
        }

        // QR de virement SEPA pour l'acompte : utile quand le PDF est lu sur
        // un autre écran que celui de la banque (ordinateur, devis imprimé).
        const due = (hasIban && devis.type !== 'amendment' && devis.status !== 'paid') ? depositDue(devis) : null;
        if (due) {
            drawTransferQr(doc, {
                x: 168, y: elementY + 4, size: 24,
                iban: userProfile.iban,
                name: userProfile.company_name || userProfile.full_name,
                amount: due.amount,
                reference: depositReference(devis),
            });
        }

        // Reference info - Only if NOT paid
        if (devis.status !== 'paid') {
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(L.paymentReference(`${typeDocument} ${docNumber}`), 20, elementY + 28);
        }

        elementY += boxHeight + 10;
    } else {
        // Just add some spacing if no payment box
        elementY += 10;
    }

    // Conditions de règlement & Mentions légales
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.setFont(undefined, 'normal');

    // Calcule la date d'échance : soit c'est une facture et on a valid_until, soit c'est aujourd'hui (réception)
    const dueDate = (isInvoice && devis.valid_until)
        ? fmtDate(devis.valid_until)
        : L.onReceipt;

    // --- NEW: Fetch Installments Schedule ---
    let installments = [];
    if (isInvoice && devis.id) {
        try {
            const { supabase } = await import('../supabase');
            const { data } = await supabase
                .from('invoice_installments')
                .select('*')
                .eq('quote_id', devis.id)
                .order('due_date', { ascending: true });
            installments = data || [];
        } catch (e) {
            console.warn("Failed to fetch installments", e);
        }
    }

    // Render Schedule Table if exists
    if (installments.length > 0) {
        if (currentY + (installments.length * 8) + 20 > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${L.paymentSchedule} :`, 14, currentY);

        const scheduleBody = installments.map(inst => [
            fmtDate(inst.due_date),
            `${inst.amount.toFixed(2)} €`,
            inst.status === 'paid' ? L.statusPaid : (inst.status === 'partial' ? L.statusPartial : L.statusPending)
        ]);

        autoTable(doc, {
            startY: currentY + 3,
            head: [[L.schedDate, L.schedAmount, L.schedStatus]],
            body: scheduleBody,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 1 },
            headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240] },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 40 },
                2: { cellWidth: 40 }
            },
            margin: { left: 14 }
        });

        currentY = doc.lastAutoTable.finalY + 15;
    }

    // Notes / Conditions Display
    // ... (rest of notes logic) ...

    // Logic: Checks allowed only for installments (Acompte, Solde, or Note mention OR DB Schedule)
    // Logic: Checks allowed only for installments (DB Schedule OR Note mention)
    // Removed 'acompte|solde' title match as user wants checks ONLY for explicit installments
    const isInstallment = isInvoice && (
        installments.length > 0 ||
        (devis.notes && /(plusieurs fois|mensualité|échéance|paiement en \d+ fois)/i.test(devis.notes))
    );

    const checkOrderName = userProfile.full_name || companyName;

    const paymentMethodText = isInstallment
        ? L.paymentByTransferOrCheck(checkOrderName)
        : L.paymentByTransfer;

    const legalTerms = [
        L.legalPayment(isInvoice && devis.valid_until ? L.dueOnDate(dueDate) : L.dueOnReceipt, paymentMethodText),
        L.legalLateFees,
        L.legalRecovery,
        L.legalProperty
    ];

    // Ajout de la mention "Sous réserve de..." pour les devis uniquement
    if (!isInvoice) {
        legalTerms.splice(1, 0, L.legalTechnical);
    }

    // Mention d'assurance (loi Pinel) : obligatoire sur devis ET factures
    // dès que l'assureur est renseigné dans le profil.
    if (userProfile.insurance_company) {
        legalTerms.push(L.legalInsurance(
            userProfile.insurance_company,
            userProfile.insurance_contract_number,
            userProfile.insurance_company_address,
            userProfile.insurance_coverage_area
        ));
    }

    // Réaffirme la police avant de mesurer : un tableau d'échéances (autoTable)
    // ou le bloc de paiement précédent a pu changer la taille courante, ce qui
    // ferait déborder les mentions hors de la marge droite.
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(110, 110, 110);

    for (const term of legalTerms) {
        const splitTerm = doc.splitTextToSize(term, 180);
        const termHeight = splitTerm.length * 3 + 2; // 3 units per line height

        if (elementY + termHeight > 285) {
            doc.addPage();
            elementY = 20;
        }

        doc.text(splitTerm, 14, elementY);

        elementY += termHeight + 2;
    }
    // Debug: Ensure content is flushed
    if (elementY > 285) doc.addPage();


    // Filigrane "ACQUITTÉE" sur toutes les pages (en complément du texte en haut de page 1)
    if (isInvoice && devis.status === 'paid') drawPaidWatermark(doc, L.paid);

    // Filigrane « document fermé » (annulé, refusé, reporté, signature suspendue)
    // sur toutes les pages — voir ./watermark.js.
    drawClosedWatermark(doc, {
        devis,
        L,
        stampDate: fmtDate(new Date().toISOString()),
        // Une facture ou un avoir ne se signe pas.
        signable: !(isInvoice || isCreditNote),
    });

    // ── Pied de page : filet accent, ligne légale, pagination ──
    const pageCount = doc.internal.getNumberOfPages();
    const legalBits = [
        companyName,
        userProfile.full_name && userProfile.full_name !== companyName ? userProfile.full_name : null,
        userProfile.city || null,
        userProfile.siret ? `${L.siret} ${userProfile.siret}` : null,
    ].filter(Boolean).join(' — ');
    const vatMention = devis.include_tva === false ? ` — ${L.vatNotApplicable}` : '';
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.4);
        doc.line(14, 284, 196, 284);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...faint);
        // Ligne légale centrée : bornée à la largeur utile (182 mm) pour ne pas
        // être rognée aux deux marges quand raison sociale + nom + SIRET sont longs.
        const footerLine = `${legalBits}${vatMention}`;
        fitFontSize(footerLine, 182, 6.8, 5.5);
        doc.text(ellipsize(footerLine, 182), 105, 287.5, { align: 'center' });
        doc.setFontSize(6.8);
        if (isInternalCopy) {
            // La mention remplace la ligne « généré par » : c'est l'information
            // utile sur ce tirage, et elle reste lisible même imprimée en N&B.
            doc.setTextColor(180, 83, 9);
            const internalLine = `${L.internalCopy} — ${L.pageOf(i, pageCount)}`;
            fitFontSize(internalLine, 182, 6.8, 5.5);
            doc.text(ellipsize(internalLine, 182), 105, 291, { align: 'center' });
        } else {
            doc.text(`${L.footer(isAmendment ? L.avenant : typeDocument)} — ${L.pageOf(i, pageCount)}`, 105, 291, { align: 'center' });
        }
    }

    // ---------------------------------------------------------
    // 2. Factur-X Integration (pdf-lib)
    // ---------------------------------------------------------

    // Get jsPDF visual output as buffer
    const pdfBytes = doc.output('arraybuffer');

    let finalPdfBytes = pdfBytes;

    if (isInvoice) {
        finalPdfBytes = await embedFacturX(pdfBytes, devis, client, userProfile);
    }

    // ---------------------------------------------------------
    // 3. Return Logic
    // ---------------------------------------------------------

    const suffix = isInternalCopy ? '_detail_interne' : '';
    const fileName = isCreditNote
        ? `avoir_${devis.invoice_number || devis.id}${suffix}.pdf`
        : isInvoice
            ? `facture_${devis.invoice_number || devis.quote_number || devis.id}${suffix}.pdf`
            : `devis_${devis.quote_number || devis.id || 'brouillon'}${suffix}.pdf`;

    if (returnType === 'blob') {
        return new Blob([finalPdfBytes], { type: 'application/pdf' });
    }

    if (returnType === 'bloburl' || returnType === true) {
        const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
    }

    if (returnType === 'dataurl') {
        return new Promise((resolve) => {
            const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }

    // Download behavior
    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
