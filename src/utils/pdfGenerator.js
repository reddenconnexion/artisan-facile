import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, PDFName, AFRelationship } from 'pdf-lib';
import { generateFacturXXML } from './facturxGenerator';
import { getTradeConfig } from '../constants/trades';

// Builds the XMP metadata packet required for Factur-X 1.08 / PDF/A-3B identification.
// Must use context.stream() (uncompressed) — PDF spec §14.3.2 forbids compressing the Metadata stream.
const buildFacturXXMP = (profile = 'EN 16931', fileName = 'factur-x.xml') => {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentFileName>${fileName}</fx:DocumentFileName>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${profile}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};

// Safe Date Helper
const formatDate = (dateString, locale) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString(locale);
    } catch (e) {
        return '';
    }
};

// Renders the artisan logo onto a square canvas with rounded corners and
// returns the resulting PNG data URL. Falls back to a centered "contain"
// fit so non-square logos aren't deformed.
const buildRoundedLogoDataUrl = async (url, sizePx = 256, radiusRatio = 0.18) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    const r = sizePx * radiusRatio;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(sizePx - r, 0);
    ctx.quadraticCurveTo(sizePx, 0, sizePx, r);
    ctx.lineTo(sizePx, sizePx - r);
    ctx.quadraticCurveTo(sizePx, sizePx, sizePx - r, sizePx);
    ctx.lineTo(r, sizePx);
    ctx.quadraticCurveTo(0, sizePx, 0, sizePx - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    const scale = Math.min(sizePx / img.width, sizePx / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (sizePx - w) / 2, (sizePx - h) / 2, w, h);
    return canvas.toDataURL('image/png');
};

// Libellés du PDF (devis / facture / avenant) traduits par langue.
// Permet d'émettre un document en français (défaut) ou en anglais
// sans dupliquer la logique de génération.
const PDF_I18N = {
    fr: {
        facture: 'FACTURE', devis: 'DEVIS', avenant: 'AVENANT',
        dateInvoice: 'Date de facturation', dateQuote: "Date d'émission",
        yourCompany: 'Votre Entreprise',
        phone: 'Tél', email: 'Email', web: 'Web', siret: 'SIRET',
        amendmentTitle: 'AVENANT - MODIFICATION TECHNIQUE',
        paid: 'ACQUITTÉE',
        validUntil: "Valable jusqu'au",
        category: 'Catégorie',
        catService: 'Prestation de services', catGoods: 'Livraison de biens', catMixed: 'Mixte',
        vatOnDebits: "Option pour le paiement de la TVA d'après les débits",
        client: 'Client', unknownClient: 'Client Inconnu',
        siren: 'SIREN', tvaIntra: 'TVA Intra',
        interventionPlace: "Lieu d'intervention",
        object: 'Objet',
        initialQuoteRef: (id, date) => `Devis initial N° ${id} du ${date}`,
        initialQuoteRefUnknown: 'Devis initial Référence Inconnue',
        fieldReport: 'CONSTAT TERRAIN',
        discoveredOn: (date) => `Lors de l'intervention du ${date}, découverte de :`,
        impossibility: (reason) => `» Impossibilité de réaliser la solution initiale pour cause de ${reason}`,
        newSolution: 'NOUVELLE SOLUTION',
        additionalMaterial: '- Matériel complémentaire :',
        technicalAddedValue: (v) => `- Plus-value technique : ${v}`,
        colDescription: 'Désignation', colQty: 'Qté', colUnitPrice: 'PU HT', colTotal: 'Total HT',
        colUnitPriceShort: 'PU HT',
        optionPrefix: '(Option)',
        tableLaborHeader: "Main d'œuvre", tableMaterialHeader: 'Fournitures et matériel',
        siteLabel: 'Chantier',
        sameAsClientAddress: "Identique à l'adresse client",
        offered: 'Offert',
        subtotalLabor: "Sous-total main d'œuvre",
        subtotalMaterial: 'Sous-total fournitures et matériel',
        vatShort: 'TVA',
        vatNotApplicableShort: 'Non applicable — art. 293 B du CGI',
        totalHTFinal: 'TOTAL HT',
        paymentConditions: 'Conditions de règlement',
        depositOnOrder: 'Acompte à la commande (100 % des fournitures)',
        balanceOnCompletion: "Solde à la fin des travaux (main d'œuvre)",
        depositSentence: "L'acompte correspondant aux fournitures doit être réglé avant tout approvisionnement du matériel. Le solde est dû à la réception des travaux.",
        forCompany: (name) => `Pour ${name}`,
        clientApproval: 'Bon pour accord — le client',
        readApproved: 'Date et mention « Lu et approuvé » :',
        pageOf: (i, n) => `page ${i}/${n}`,
        financialAdjustment: 'AJUSTEMENT FINANCIER',
        initialQuoteTTC: 'Devis Initial TTC', billedToDate: 'Facturé à ce jour (Situation)',
        includingDeposit: '(incluant acompte)', amendmentAmountTTC: 'Montant Avenant TTC',
        newProjectTotal: 'Nouveau Total Projet',
        balanceOnAmendment: (amt) => `(Solde à régler sur cet avenant : ${amt} €)`,
        depositPaid: 'Acompte versé', kept: '(conservé)',
        amendmentComplementTTC: 'Complément Avenant TTC',
        newBalanceDue: 'Nouveau Solde à Régler',
        projectTotal: (amt) => `(Total Projet : ${amt} € TTC)`,
        totalHT: 'Total HT', vat: (rate) => `TVA (${rate})`,
        vatNotApplicable: 'TVA non applicable, art. 293 B du CGI', totalTTC: 'Total TTC',
        materialDepositNote: (amt) => `\n\n--- ACOMPTE MATÉRIEL ---\nMontant des fournitures : ${amt} € TTC.\nUn acompte correspondant à la totalité du matériel est requis à la signature.`,
        beforeAfter: 'Montage Avant / Après',
        notesConditions: 'Notes / Conditions',
        bonPourAccord: 'Bon pour accord',
        signedOn: (date) => `Signé le ${date}`,
        paymentMethods: 'Moyens de paiement acceptés',
        transfer: 'Virement', iban: 'IBAN', weroLabel: 'Paylib / Wero',
        weroPhone: (num, name) => name ? `Tél : ${num} (${name})` : `Tél : ${num}`,
        paymentReference: (ref) => `Merci d'indiquer la référence "${ref}" lors du paiement.`,
        onReceipt: 'à réception',
        paymentSchedule: 'Échéancier de paiement',
        statusPaid: 'Payé', statusPartial: 'Partiel', statusPending: 'En attente',
        schedDate: 'Date', schedAmount: 'Montant', schedStatus: 'Statut',
        paymentByTransferOrCheck: (name) => `Le règlement s'effectue par virement bancaire ou chèque à l'ordre de ${name}.`,
        paymentByTransfer: `Le règlement s'effectue par virement bancaire.`,
        legalPayment: (due, method) => `Règlement : Le paiement est dû ${due}. ${method}`,
        dueOnDate: (d) => `le ${d}`, dueOnReceipt: 'à réception de la facture',
        legalLateFees: "Pénalités de retard : Tout retard de paiement donnera lieu à l'application de pénalités calculées au taux de 10 % annuel, exigibles le jour suivant la date d'échéance, sans qu'un rappel soit nécessaire.",
        legalRecovery: "Frais de recouvrement (Clients Pros) : Pour les clients professionnels, une indemnité forfaitaire de 40 € pour frais de recouvrement est due de plein droit en cas de retard de paiement (Art. L441-10 du Code de commerce).",
        legalProperty: "Réserve de propriété : Les marchandises et matériels installés restent la propriété du vendeur jusqu’au paiement intégral du prix.",
        legalTechnical: "Sous réserve technique : Ce devis est établi sous réserve de bonne faisabilité et de la conformité des réseaux ou supports existants (non visitables avant démontage).",
        footer: (type) => `${type} généré par Artisan Facile - Conforme Factur-X`,
        dateLocale: 'fr-FR',
    },
    en: {
        facture: 'INVOICE', devis: 'QUOTE', avenant: 'AMENDMENT',
        dateInvoice: 'Invoice date', dateQuote: 'Issue date',
        yourCompany: 'Your Company',
        phone: 'Tel', email: 'Email', web: 'Web', siret: 'SIRET',
        amendmentTitle: 'AMENDMENT - TECHNICAL MODIFICATION',
        paid: 'PAID',
        validUntil: 'Valid until',
        category: 'Category',
        catService: 'Provision of services', catGoods: 'Supply of goods', catMixed: 'Mixed',
        vatOnDebits: 'Option for VAT payment based on debits',
        client: 'Client', unknownClient: 'Unknown Client',
        siren: 'SIREN', tvaIntra: 'VAT No.',
        interventionPlace: 'Place of work',
        object: 'Subject',
        initialQuoteRef: (id, date) => `Initial quote No. ${id} dated ${date}`,
        initialQuoteRefUnknown: 'Initial quote — reference unknown',
        fieldReport: 'SITE FINDINGS',
        discoveredOn: (date) => `During the intervention on ${date}, the following was found:`,
        impossibility: (reason) => `» Unable to carry out the initial solution due to ${reason}`,
        newSolution: 'NEW SOLUTION',
        additionalMaterial: '- Additional materials:',
        technicalAddedValue: (v) => `- Technical added value: ${v}`,
        colDescription: 'Description', colQty: 'Qty', colUnitPrice: 'Unit Price', colTotal: 'Total (excl. VAT)',
        colUnitPriceShort: 'Unit Price',
        optionPrefix: '(Optional)',
        tableLaborHeader: 'Labour & services', tableMaterialHeader: 'Materials & supplies',
        siteLabel: 'Work site',
        sameAsClientAddress: 'Same as client address',
        offered: 'Free',
        subtotalLabor: 'Labour subtotal',
        subtotalMaterial: 'Materials subtotal',
        vatShort: 'VAT',
        vatNotApplicableShort: 'Not applicable — art. 293 B of the French Tax Code',
        totalHTFinal: 'TOTAL (excl. VAT)',
        paymentConditions: 'Payment terms',
        depositOnOrder: 'Deposit on order (100% of materials)',
        balanceOnCompletion: 'Balance on completion of works (labour)',
        depositSentence: 'The deposit covering the materials must be paid before any material is ordered. The balance is due upon completion of the works.',
        forCompany: (name) => `For ${name}`,
        clientApproval: 'Approved — the client',
        readApproved: 'Date and mention "Read and approved":',
        pageOf: (i, n) => `page ${i}/${n}`,
        financialAdjustment: 'FINANCIAL ADJUSTMENT',
        initialQuoteTTC: 'Initial Quote (incl. VAT)', billedToDate: 'Billed to date (Progress)',
        includingDeposit: '(including deposit)', amendmentAmountTTC: 'Amendment Amount (incl. VAT)',
        newProjectTotal: 'New Project Total',
        balanceOnAmendment: (amt) => `(Balance due on this amendment: €${amt})`,
        depositPaid: 'Deposit paid', kept: '(retained)',
        amendmentComplementTTC: 'Amendment Supplement (incl. VAT)',
        newBalanceDue: 'New Balance Due',
        projectTotal: (amt) => `(Project Total: €${amt} incl. VAT)`,
        totalHT: 'Total (excl. VAT)', vat: (rate) => `VAT (${rate})`,
        vatNotApplicable: 'VAT not applicable, art. 293 B of the French Tax Code', totalTTC: 'Total (incl. VAT)',
        materialDepositNote: (amt) => `\n\n--- MATERIALS DEPOSIT ---\nMaterials amount: €${amt} incl. VAT.\nA deposit covering the full cost of the materials is required upon signature.`,
        beforeAfter: 'Before / After',
        notesConditions: 'Notes / Terms',
        bonPourAccord: 'Approved for agreement',
        signedOn: (date) => `Signed on ${date}`,
        paymentMethods: 'Accepted payment methods',
        transfer: 'Bank transfer', iban: 'IBAN', weroLabel: 'Paylib / Wero',
        weroPhone: (num, name) => name ? `Tel: ${num} (${name})` : `Tel: ${num}`,
        paymentReference: (ref) => `Please quote the reference "${ref}" when making payment.`,
        onReceipt: 'upon receipt',
        paymentSchedule: 'Payment schedule',
        statusPaid: 'Paid', statusPartial: 'Partial', statusPending: 'Pending',
        schedDate: 'Date', schedAmount: 'Amount', schedStatus: 'Status',
        paymentByTransferOrCheck: (name) => `Payment is made by bank transfer or cheque payable to ${name}.`,
        paymentByTransfer: 'Payment is made by bank transfer.',
        legalPayment: (due, method) => `Payment terms: Payment is due ${due}. ${method}`,
        dueOnDate: (d) => `on ${d}`, dueOnReceipt: 'upon receipt of the invoice',
        legalLateFees: 'Late payment penalties: Any late payment will incur penalties calculated at an annual rate of 10%, payable the day after the due date, without the need for a reminder.',
        legalRecovery: 'Recovery costs (Business clients): For business clients, a fixed indemnity of €40 for recovery costs is due as of right in the event of late payment (Art. L441-10 of the French Commercial Code).',
        legalProperty: 'Retention of title: The goods and materials installed remain the property of the seller until full payment of the price.',
        legalTechnical: 'Subject to technical feasibility: This quote is issued subject to feasibility and the compliance of existing networks or supports (not inspectable before removal).',
        footer: (type) => `${type} generated by Artisan Facile - Factur-X compliant`,
        dateLocale: 'en-GB',
    },
};

// Converted to Async to support pdf-lib operations
export const generateDevisPDF = async (devis, client, userProfile, isInvoice = false, returnType = false, lang = 'fr') => {
    // ---------------------------------------------------------
    // 1. Generate Visual PDF with jsPDF (Existing Logic)
    // ---------------------------------------------------------
    const doc = new jsPDF();

    const L = PDF_I18N[lang] || PDF_I18N.fr;
    const fmtDate = (d) => formatDate(d, L.dateLocale);

    const typeDocument = isInvoice ? L.facture : (devis.type === 'amendment' ? L.avenant : L.devis);
    const dateLabel = isInvoice ? L.dateInvoice : L.dateQuote;
    const isAmendment = devis.type === 'amendment';

    // Translated free-text content (title / notes / per-line descriptions).
    // `content_en` is stored on the quote when the artisan sends it in English;
    // we fall back to the original French whenever a translation is missing so
    // the document is never left with blank lines. Amounts are never touched.
    const tr = (lang !== 'fr' && devis.content_en) ? devis.content_en : null;
    const trTitle = tr?.title || devis.title;
    const trNotes = (tr && typeof tr.notes === 'string' && tr.notes.trim()) ? tr.notes : devis.notes;
    const trLine = (desc) => (tr?.lines && tr.lines[desc]) ? tr.lines[desc] : desc;

    // ── Charte graphique : couleur d'accent (profil) + palette neutre ──
    const hexToRgb = (hex) => {
        const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const accent = hexToRgb(userProfile.brand_color) || (isInvoice ? [46, 125, 50] : [37, 99, 235]);
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
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accent);
    doc.text(companyName.toUpperCase(), leftX, cursorY);
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
    identityLines.forEach(line => {
        doc.text(line, leftX, cursorY);
        cursorY += 4.2;
    });

    // Cartouche document (droite) : type, numéro, dates
    const docRight = 196;
    let docY = 19;
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accent);
    doc.text(isAmendment ? L.avenant : typeDocument, docRight, docY, { align: 'right' });
    docY += 6.5;
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text(`N° ${devis.quote_number || devis.id || 'PROVISOIRE'}`, docRight, docY, { align: 'right' });
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

    if (isAmendment) {
        // --- AVENANT SECTIONS ---
        // 1. Reference
        const parentRef = devis.parent_quote_data
            ? L.initialQuoteRef(devis.parent_quote_data.id, fmtDate(devis.parent_quote_data.date))
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

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${L.fieldReport} :`, 14, currentY);
        currentY += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);

        if (details.constat_date) {
            const introLines = doc.splitTextToSize(
                L.discoveredOn(fmtDate(details.constat_date)),
                182
            );
            doc.text(introLines, 14, currentY);
            currentY += introLines.length * 5;
        }
        if (details.constat_description) {
            const descLines = doc.splitTextToSize(details.constat_description, 182);
            doc.text(descLines, 14, currentY);
            currentY += (descLines.length * 5) + 2;
        }

        if (details.constat_reason) {
            const reasonLines = doc.splitTextToSize(
                L.impossibility(details.constat_reason),
                182
            );
            doc.text(reasonLines, 14, currentY);
            currentY += (reasonLines.length * 5) + 5;
        } else {
            currentY += 5;
        }

        // 3. NOUVELLE SOLUTION
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${L.newSolution} :`, 14, currentY);
        currentY += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);

        if (details.solution_description) {
            const solLines = doc.splitTextToSize(`- ${details.solution_description}`, 182);
            doc.text(solLines, 14, currentY);
            currentY += (solLines.length * 5);
        }

        doc.text(L.additionalMaterial, 14, currentY);
        currentY += 5;

        if (details.solution_technical_value) {
            const valueLines = doc.splitTextToSize(
                L.technicalAddedValue(details.solution_technical_value),
                182
            );
            doc.text(valueLines, 14, currentY);
            currentY += (valueLines.length * 5) + 3;
        } else {
            currentY += 3;
        }

        tableStartY = currentY;
    }

    // ---------------------------------------------------------
    // Tableau des prestations
    // ---------------------------------------------------------

    const allItems = devis.items || [];
    const materials = allItems.filter(i => i.type === 'material');
    const tableColumn = [L.colDescription, L.colQty, L.colUnitPrice, L.colTotal];

    const fmtMoney = (n) => `${(Number(n) || 0).toFixed(2)} €`;
    // Une ligne à 0 € est affichée "Offert" plutôt que "0.00 €" (geste commercial lisible)
    const unitPriceCell = (item) => (parseFloat(item.price) || 0) === 0 ? L.offered : fmtMoney(item.price);
    const lineTotalCell = (item) => (parseFloat(item.price) || 0) === 0
        ? L.offered
        : fmtMoney((parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0));

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
        [{ content: label, colSpan: 4, styles: { fillColor: color, textColor: 255, halign: 'left', fontSize: 9.5, fontStyle: 'bold', cellPadding: 2.4 } }],
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

    {
        // Tableaux lettrés : A — Main d'œuvre, B — Fournitures (lettre seulement si
        // les deux existent). Les sections personnalisées du devis deviennent des
        // sous-titres teintés à l'intérieur du groupe où se trouvent leurs lignes.
        const services = allItems.filter(i => i.type === 'service' || !i.type);
        const bothGroups = services.length > 0 && materials.length > 0;

        const itemRow = (item) => [
            item.is_optional ? `${L.optionPrefix} ${trLine(item.description || '')}` : trLine(item.description || ''),
            item.quantity,
            unitPriceCell(item),
            lineTotalCell(item)
        ];
        // Parcourt tous les items dans l'ordre : émet les lignes du type demandé,
        // précédées du sous-titre de leur section personnalisée (une seule fois
        // par section et par tableau, même si la section mélange les types).
        const buildGroupRows = (matches) => {
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
                        colSpan: 4,
                        styles: { fontStyle: 'bold', fillColor: accentTint, textColor: accent, halign: 'left', fontSize: 9 }
                    }]);
                    emittedSection = currentSection;
                }
                rows.push(itemRow(item));
            }
            return rows;
        };

        if (services.length > 0) {
            const laborColumns = [L.colDescription, `${L.colQty} (h)`, L.colUnitPrice, L.colTotal];
            autoTable(doc, {
                startY: currentTableY,
                head: sectionHead(`${bothGroups ? 'A — ' : ''}${L.tableLaborHeader}`, accent, laborColumns),
                body: buildGroupRows(i => i.type === 'service' || !i.type),
                ...baseTableStyle,
                headStyles: headStylesFor(accent),
                didParseCell: styleOfferedCell,
            });
            currentTableY = doc.lastAutoTable.finalY + 6;
        }

        if (materials.length > 0) {
            autoTable(doc, {
                startY: currentTableY,
                head: sectionHead(`${bothGroups ? 'B — ' : ''}${L.tableMaterialHeader}`, tableDark),
                body: buildGroupRows(i => i.type === 'material'),
                ...baseTableStyle,
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
        const finalY = (currentTableY > tableStartY ? currentTableY : tableStartY) + 10;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${L.financialAdjustment} :`, 14, finalY);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        let financeY = finalY + 8;
        const initialTTC = devis.parent_quote_data?.total_ttc || 0;
        const amendmentTTC = devis.total_ttc || 0;
        const newTotalTTC = initialTTC + amendmentTTC;

        // Try to estimate deposit or assume 0 if not passed
        const deposit = details?.initial_deposit_amount || 0;

        // Progress invoices (Situations) already billed on parent quote
        const progressTotal = devis.parent_quote_data?.progress_total || 0;

        // SCENARIO CHECK: Has Progress (Situation) Invoice?
        // If yes, Situation replaces Initial Quote for billing baseline.
        // If no, we use Initial Quote + Amendment - Deposit.

        const leftX = 14;
        const rightValueX = 100;

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

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235); // Blue
            doc.text(`${L.amendmentAmountTTC} :`, leftX, financeY);
            doc.text(`+${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            doc.setFontSize(12);
            doc.text(`${L.newProjectTotal} :`, leftX, financeY);
            // New Total = Situation + Amendment
            doc.text(`${(progressTotal + amendmentTTC).toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
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

            if (deposit > 0) {
                doc.text(`${L.depositPaid} :`, leftX, financeY);
                doc.text(`${deposit.toFixed(2)} € ${L.kept}`, rightValueX, financeY, { align: 'right' });
                financeY += 6;
            }

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235);
            doc.text(`${L.amendmentComplementTTC} :`, leftX, financeY);
            doc.text(`+${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            // Balance Calculation
            const balance = initialTTC + amendmentTTC - deposit;

            doc.setFontSize(12);
            doc.text(`${L.newBalanceDue} :`, leftX, financeY);
            doc.text(`${balance.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(L.projectTotal((initialTTC + amendmentTTC).toFixed(2)), rightValueX, financeY, { align: 'right' });
        }

        // Update currentY for next sections
        currentTableY = financeY + 10;

    } else {
        // ── Bloc totaux (à droite) : sous-totaux, TVA, total en accent ──
        const laborItems = allItems.filter(i => i.type === 'service' || !i.type);
        const sumHT = (items) => items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0), 0);
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
        const grandLabel = devis.include_tva !== false ? L.totalTTC : L.totalHTFinal;
        const grandValue = fmtMoney(devis.total_ttc);

        const totX = 106, totRight = 196, rowH = 7;
        const blockH = (totalsRows.length + 1) * rowH + 3;

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

        currentTableY = rowY + rowH + 4;
    }

    // Position for Notes
    const finalTableY = isAmendment ? currentTableY + 4 : currentTableY;
    let currentY = finalTableY + 8;

    const allNotes = trNotes || '';

    // ── Conditions de règlement (acompte matériel) : tableau acompte / solde ──
    if (!isInvoice && materials.length > 0 && devis.has_material_deposit === true) {
        const materialHT = materials.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Calculate effective VAT rate (infer from totals to support manual adjustments or different rates)
        let vatRate = 0.20; // Default
        if (devis.total_ht > 0 && devis.total_tva >= 0) {
            vatRate = devis.total_tva / devis.total_ht;
        }

        // Calculate VAT part for materials using effective rate
        const materialTTC = devis.include_tva !== false ? materialHT * (1 + vatRate) : materialHT;
        const balanceTTC = Math.max((Number(devis.total_ttc) || 0) - materialTTC, 0);

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
            const { supabase } = await import('./supabase'); // dynamic import to avoid circ dependencies if utils

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
        const splitNotes = doc.splitTextToSize(allNotes, 180);

        // Check if header fits on current page
        if (currentY + 11 > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
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

        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        doc.text(L.forCompany(companyName), 14, approvalY);
        if (userProfile.full_name) {
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...subtle);
            doc.text(userProfile.full_name, 14, approvalY + 5);
        }

        doc.setFont(undefined, 'bold');
        doc.setTextColor(...ink);
        const bonPourAccordText = devis.bon_pour_accord ? devis.bon_pour_accord : L.clientApproval;
        doc.text(bonPourAccordText, 110, approvalY);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...subtle);

        if (devis.signature) {
            const signedDate = devis.signed_at ? new Date(devis.signed_at) : new Date(devis.updated_at || devis.date || new Date());
            doc.text(L.signedOn(signedDate.toLocaleDateString(L.dateLocale)), 110, approvalY + 5);
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

    // Informations de paiement (IBAN + Wero)
    const hasIban = userProfile.iban && userProfile.iban.trim().length > 0;
    const weroNumber = (userProfile.wero_phone && userProfile.wero_phone.trim().length > 0) ? userProfile.wero_phone : null;

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

        // Reference info - Only if NOT paid
        if (devis.status !== 'paid') {
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(L.paymentReference(`${typeDocument} ${devis.quote_number || devis.id}`), 20, elementY + 28);
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
            const { supabase } = await import('./supabase');
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

    for (const term of legalTerms) {
        // Roughly estimate height: 180 width, ~240 chars per line at size 7? 
        // Actually size 7 is small. 
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
    if (isInvoice && devis.status === 'paid') {
        const totalPages = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setTextColor(220, 38, 38);
            doc.setFontSize(30);
            doc.setFont(undefined, 'bold');
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.15 }));
            doc.text(L.paid, pageWidth / 2, pageHeight / 2, {
                align: 'center',
                angle: 45,
                renderingMode: 'fill'
            });
            doc.restoreGraphicsState();
        }
    }

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
        doc.setFontSize(6.8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...faint);
        doc.text(`${legalBits}${vatMention}`, 105, 287.5, { align: 'center' });
        doc.text(`${L.footer(isAmendment ? L.avenant : typeDocument)} — ${L.pageOf(i, pageCount)}`, 105, 291, { align: 'center' });
    }

    // ---------------------------------------------------------
    // 2. Factur-X Integration (pdf-lib)
    // ---------------------------------------------------------

    // Get jsPDF visual output as buffer
    const pdfBytes = doc.output('arraybuffer');

    let finalPdfBytes = pdfBytes;

    if (isInvoice) {
        try {
            // Load visual PDF into pdf-lib
            const pdfDoc = await PDFDocument.load(pdfBytes);

            // Generate XML content
            const xmlContent = generateFacturXXML(devis, client, userProfile);
            const xmlBytes = new TextEncoder().encode(xmlContent);

            // Attach XML with AFRelationship.Data (required by Factur-X 1.08 / PDF/A-3)
            await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
                mimeType: 'text/xml',
                description: 'Factur-X Invoice Data',
                creationDate: new Date(),
                modificationDate: new Date(),
                afRelationship: AFRelationship.Data,
            });

            // Inject XMP metadata into PDF catalog (identifies PDF as Factur-X 1.08)
            const xmpString = buildFacturXXMP('EN 16931', 'factur-x.xml');
            const xmpBytes = new TextEncoder().encode(xmpString);
            const metadataStream = pdfDoc.context.stream(xmpBytes, {
                Type: 'Metadata',
                Subtype: 'XML',
                Length: xmpBytes.length,
            });
            const metadataRef = pdfDoc.context.register(metadataStream);
            pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

            // Save modified PDF
            finalPdfBytes = await pdfDoc.save();
        } catch (e) {
            console.error("Factur-X Embedding Failed:", e);
            // Fallback to visual PDF (pdfBytes) if embedding fails to avoid blocking the user
        }
    }

    // ---------------------------------------------------------
    // 3. Return Logic
    // ---------------------------------------------------------

    const fileName = isInvoice ? `facture_${devis.quote_number || devis.id}.pdf` : `devis_${devis.quote_number || devis.id || 'brouillon'}.pdf`;

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

// ---------------------------------------------------------------
// Génération PDF pour les rapports d'intervention
// ---------------------------------------------------------------
export const generateInterventionReportPDF = async (report, userProfile = {}, returnBlob = false) => {
    const doc = new jsPDF();

    const blue = [37, 99, 235];
    const darkGray = [31, 41, 55];
    const lightGray = [156, 163, 175];
    const bgGray = [249, 250, 251];

    // ------ En-tête artisan ------
    let contentY = 15;
    if (userProfile?.logo_url) {
        try {
            const roundedLogo = await buildRoundedLogoDataUrl(userProfile.logo_url);
            doc.addImage(roundedLogo, 'PNG', 14, contentY, 20, 20);
            contentY = 40;
        } catch (e) { /* ignore */ }
    }

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...darkGray);
    doc.text(userProfile?.company_name || userProfile?.full_name || 'Artisan', 14, contentY);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...lightGray);
    let infoY = contentY + 6;
    if (userProfile?.address) { doc.text(userProfile.address, 14, infoY); infoY += 5; }
    if (userProfile?.postal_code || userProfile?.city) {
        doc.text(`${userProfile.postal_code || ''} ${userProfile.city || ''}`.trim(), 14, infoY);
        infoY += 5;
    }
    if (userProfile?.phone) { doc.text(`Tél : ${userProfile.phone}`, 14, infoY); infoY += 5; }
    if (userProfile?.siret) { doc.text(`SIRET : ${userProfile.siret}`, 14, infoY); }

    // ------ Titre du document ------
    const titleBoxY = contentY;
    doc.setFillColor(...blue);
    doc.roundedRect(120, titleBoxY, 76, 22, 3, 3, 'F');
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text("RAPPORT D'INTERVENTION", 158, titleBoxY + 9, { align: 'center' });

    if (report.report_number) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(`N° ${report.report_number}`, 158, titleBoxY + 17, { align: 'center' });
    }

    // ------ Ligne séparatrice ------
    const sepY = Math.max(infoY, titleBoxY + 28) + 4;
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.5);
    doc.line(14, sepY, 196, sepY);

    let y = sepY + 8;

    // ------ Titre de l'intervention ------
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...darkGray);
    doc.text(report.title || 'Rapport d\'intervention', 14, y);
    y += 8;

    // ------ Infos principales (2 colonnes) ------
    const col1 = 14;
    const col2 = 110;

    const addInfoRow = (label, value, x, currentY) => {
        if (!value) return currentY;
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...lightGray);
        doc.text(label, x, currentY);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...darkGray);
        doc.text(String(value), x, currentY + 4);
        return currentY + 10;
    };

    const infoStartY = y;
    let leftY = infoStartY;
    let rightY = infoStartY;

    leftY = addInfoRow('DATE', formatDate(report.date), col1, leftY);
    leftY = addInfoRow('CLIENT', report.client_name || '—', col1, leftY);

    const lieu = [report.intervention_address, report.intervention_postal_code, report.intervention_city].filter(Boolean).join(', ');
    if (lieu) leftY = addInfoRow("LIEU D'INTERVENTION", lieu, col1, leftY);

    if (report.start_time || report.end_time) {
        const horaires = [report.start_time, report.end_time].filter(Boolean).join(' → ');
        rightY = addInfoRow('HORAIRES', horaires, col2, rightY);
    }
    if (report.duration_hours) {
        rightY = addInfoRow('DURÉE', `${report.duration_hours} heure(s)`, col2, rightY);
    }
    if (report.status) {
        const statusLabels = { draft: 'Brouillon', completed: 'Terminé', signed: 'Signé' };
        rightY = addInfoRow('STATUT', statusLabels[report.status] || report.status, col2, rightY);
    }

    y = Math.max(leftY, rightY) + 4;

    // ------ Section description ------
    if (report.description) {
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('PROBLÈME CONSTATÉ', 18, y + 4.2);
        y += 10;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...darkGray);
        const descLines = doc.splitTextToSize(report.description, 178);
        doc.text(descLines, 14, y);
        y += descLines.length * 5 + 4;
    }

    // ------ Section travaux réalisés ------
    if (report.work_done) {
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('TRAVAUX RÉALISÉS', 18, y + 4.2);
        y += 10;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...darkGray);
        const workLines = doc.splitTextToSize(report.work_done, 178);
        doc.text(workLines, 14, y);
        y += workLines.length * 5 + 4;
    }

    // ------ Tableau des matériaux ------
    const usedMaterials = (report.materials_used || []).filter(m => m.description?.trim());
    if (usedMaterials.length > 0) {
        y += 2;
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('MATÉRIAUX UTILISÉS', 18, y + 4.2);
        y += 8;

        const total = usedMaterials.reduce((sum, m) =>
            sum + (parseFloat(m.quantity) || 0) * (parseFloat(m.price) || 0), 0);

        autoTable(doc, {
            startY: y,
            head: [['Désignation', 'Qté', 'Unité', 'P.U. (€)', 'Total (€)']],
            body: usedMaterials.map(m => [
                m.description,
                m.quantity,
                m.unit || 'unité',
                parseFloat(m.price || 0).toFixed(2),
                (parseFloat(m.quantity || 0) * parseFloat(m.price || 0)).toFixed(2),
            ]),
            foot: total > 0 ? [['', '', '', 'Total', `${total.toFixed(2)} €`]] : undefined,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: blue, textColor: 255 },
            footStyles: { fillColor: [229, 231, 235], textColor: darkGray, fontStyle: 'bold' },
            theme: 'grid',
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 6;
    }

    // ------ Photos ------
    const photos = (report.photos || []).filter(p => p?.url);
    if (photos.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('PHOTOS', 18, y + 4.2);
        y += 10;

        const cellW = 55;
        const cellH = 45;
        const gap = 6;
        const perRow = 3;

        // Draw image contained (no stretch) inside a cell
        // Use getImageProperties so ratio matches exactly what jsPDF embeds (raw, no EXIF rotation)
        const addPhotoCell = (dataUrl, cellX, cellY) => {
            try {
                const props = doc.getImageProperties(dataUrl);
                const ratio = props.width / props.height;
                let drawW, drawH, offsetX = 0, offsetY = 0;
                if (ratio >= cellW / cellH) {
                    drawW = cellW;
                    drawH = cellW / ratio;
                    offsetY = (cellH - drawH) / 2;
                } else {
                    drawH = cellH;
                    drawW = cellH * ratio;
                    offsetX = (cellW - drawW) / 2;
                }
                doc.addImage(dataUrl, cellX + offsetX, cellY + offsetY, drawW, drawH);
            } catch (e) {
                console.warn('addPhotoCell error', e);
            }
        };

        const fetchDataUrl = async (url) => {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        let pageStartIdx = 0;

        for (let i = 0; i < photos.length; i++) {
            const col = (i - pageStartIdx) % perRow;
            const row = Math.floor((i - pageStartIdx) / perRow);
            const x = 14 + col * (cellW + gap);
            const imgY = y + row * (cellH + gap);

            if (imgY + cellH > 280) {
                doc.addPage();
                y = 20;
                pageStartIdx = i;
                try {
                    const dataUrl = await fetchDataUrl(photos[i].url);
                    addPhotoCell(dataUrl, 14, y);
                } catch (e) { /* skip */ }
                continue;
            }

            try {
                const dataUrl = await fetchDataUrl(photos[i].url);
                addPhotoCell(dataUrl, x, imgY);
            } catch (e) { /* skip */ }
        }

        const photosOnLastPage = photos.length - pageStartIdx;
        const rowsOnLastPage = Math.ceil(photosOnLastPage / perRow);
        y += rowsOnLastPage * (cellH + gap) + 4;
        if (y > 270) { doc.addPage(); y = 20; }
    }

    // ------ Jalons d'avancement (preuves datées + géolocalisées) ------
    const milestones = (report.milestones || []).filter(m => m?.photo_url);
    if (milestones.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('JALONS D\'AVANCEMENT', 18, y + 4.2);
        y += 10;

        // Tri chronologique pour respecter la timeline
        const sortedMilestones = [...milestones].sort(
            (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
        );

        const fetchMilestonePhoto = async (url) => {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        const photoW = 40;
        const photoH = 30;
        const lineGap = 4;

        for (const m of sortedMilestones) {
            // Saut de page si on arrive en fin de feuille
            if (y + photoH + 6 > 280) {
                doc.addPage();
                y = 20;
            }

            // Photo à gauche
            try {
                const dataUrl = await fetchMilestonePhoto(m.photo_url);
                const props = doc.getImageProperties(dataUrl);
                const ratio = props.width / props.height;
                let drawW, drawH, offsetX = 0, offsetY = 0;
                if (ratio >= photoW / photoH) {
                    drawW = photoW;
                    drawH = photoW / ratio;
                    offsetY = (photoH - drawH) / 2;
                } else {
                    drawH = photoH;
                    drawW = photoH * ratio;
                    offsetX = (photoW - drawW) / 2;
                }
                doc.addImage(dataUrl, 14 + offsetX, y + offsetY, drawW, drawH);
            } catch { /* photo inaccessible — on continue avec le texte */ }

            // Texte à droite
            const textX = 14 + photoW + 5;
            doc.setFont(undefined, 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...darkGray);
            doc.text(m.label || 'Jalon', textX, y + 5);

            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(110, 110, 110);
            const dateStr = m.timestamp
                ? new Date(m.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                : '';
            doc.text(`📅 ${dateStr}`, textX, y + 10);

            if (m.latitude !== undefined && m.longitude !== undefined) {
                const accStr = m.accuracy ? ` (±${Math.round(m.accuracy)}m)` : '';
                doc.text(`📍 ${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}${accStr}`, textX, y + 14);
            } else {
                doc.text('📍 Position non enregistrée', textX, y + 14);
            }

            if (m.notes) {
                doc.setTextColor(...darkGray);
                const lines = doc.splitTextToSize(m.notes, 130);
                const slicedLines = lines.slice(0, 2); // max 2 lignes pour rester compact
                doc.text(slicedLines, textX, y + 19);
            }

            y += photoH + lineGap;
        }

        // Mention légale en italique sous les jalons
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'italic');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
            'Photos horodatées capturées sur place — preuves de bonne exécution des travaux.',
            14, y + 2,
        );
        y += 6;
        doc.setFont(undefined, 'normal');
    }

    // ------ Notes ------
    if (report.notes) {
        doc.setFillColor(...bgGray);
        doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...blue);
        doc.text('NOTES', 18, y + 4.2);
        y += 10;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...darkGray);
        const noteLines = doc.splitTextToSize(report.notes, 178);
        doc.text(noteLines, 14, y);
        y += noteLines.length * 5 + 4;
    }

    // ------ Signature ------
    y += 6;
    if (y > 230) { doc.addPage(); y = 20; }

    doc.setFillColor(...bgGray);
    doc.roundedRect(14, y, 182, 6, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...blue);
    doc.text('SIGNATURE CLIENT', 18, y + 4.2);
    y += 10;

    if (report.client_signature) {
        try {
            doc.addImage(report.client_signature, 'PNG', 14, y, 60, 25);
            y += 28;
        } catch (e) { /* ignore */ }
    } else {
        // Blank signature area
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(14, y, 80, 25);
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        doc.text('Signature', 54, y + 14, { align: 'center' });
        y += 28;
    }

    if (report.signer_name) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...darkGray);
        doc.text(`Lu et approuvé : ${report.signer_name}`, 14, y);
        y += 5;
    }
    if (report.signed_at) {
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        doc.text(`Signé le ${new Date(report.signed_at).toLocaleString('fr-FR')}`, 14, y);
    }

    // ------ Footer ------
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        doc.text(
            `${userProfile?.company_name || ''} — Rapport d'intervention — Page ${i}/${pageCount}`,
            105, 290, { align: 'center' }
        );
    }

    // ------ Téléchargement ou retour blob ------
    const fileName = `rapport-intervention-${report.report_number || report.date || 'sans-date'}.pdf`;
    if (returnBlob) {
        return doc.output('blob');
    }
    doc.save(fileName);
};
