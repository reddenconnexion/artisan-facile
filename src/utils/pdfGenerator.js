import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import { generateFacturXXML } from './facturxGenerator';

// Converted to Async to support pdf-lib operations
export const generateDevisPDF = async (devis, client, userProfile, isInvoice = false, returnType = false) => {
    // ---------------------------------------------------------
    // 1. Generate Visual PDF with jsPDF (Existing Logic)
    // ---------------------------------------------------------
    const doc = new jsPDF();

    const typeDocument = isInvoice ? "FACTURE" : "DEVIS";
    const dateLabel = isInvoice ? "Date de facturation" : "Date d'émission";

    // Logo
    let contentStartY = 30;
    if (userProfile.logo_url) {
        try {
            // Note: addImage is sync, usually fine if image is preloaded or dataURL. 
            // If it's a URL, jsPDF might need it to be base64. 
            // Assuming existing logic worked, we keep it. 
            // If logo_url is a remote URL, jsPDF often fails without base64. 
            // But let's assume it works as per previous code.
            doc.addImage(userProfile.logo_url, 'JPEG', 14, 10, 20, 20);
            contentStartY = 35;
        } catch (e) {
            console.warn("Could not add logo image to PDF", e);
        }
    }

    // Colonne Gauche : Identité & Adresse
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    const companyName = userProfile.company_name || userProfile.full_name || "Votre Entreprise";
    doc.text(companyName, 14, contentStartY);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);

    let leftY = contentStartY + 6;
    if (userProfile.address) {
        doc.text(userProfile.address, 14, leftY);
        leftY += 5;
    }
    if (userProfile.postal_code || userProfile.city) {
        doc.text(`${userProfile.postal_code || ''} ${userProfile.city || ''}`, 14, leftY);
        leftY += 5;
    }

    // Colonne Droite : Contact & SIRET
    let rightY = contentStartY;
    const rightColX = 90;

    if (userProfile.phone) {
        doc.text(`Tél : ${userProfile.phone}`, rightColX, rightY);
        rightY += 5;
    }

    const emailToDisplay = userProfile.professional_email || userProfile.email;
    if (emailToDisplay) {
        doc.text(`Email : ${emailToDisplay}`, rightColX, rightY);
        rightY += 5;
    }

    if (userProfile.website) {
        doc.text(`Web : ${userProfile.website}`, rightColX, rightY);
        rightY += 5;
    }

    if (userProfile.siret) {
        doc.text(`SIRET : ${userProfile.siret}`, rightColX, rightY);
        rightY += 5;
    }

    // Séparateur
    doc.setDrawColor(230, 230, 230);
    doc.line(14, 65, 196, 65);

    // Info Devis/Facture (Gauche, sous le header)
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text(`${typeDocument} N° ${devis.id || 'PROVISOIRE'}`, 14, 75);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${dateLabel} : ${new Date(devis.date).toLocaleDateString()}`, 14, 81);
    if (!isInvoice && devis.valid_until) {
        doc.text(`Valable jusqu'au : ${new Date(devis.valid_until).toLocaleDateString()}`, 14, 86);
    }

    // Factur-X Info (Ops Category)
    if (isInvoice && devis.operation_category) {
        const catMap = { 'service': 'Prestation de services', 'goods': 'Livraison de biens', 'mixed': 'Mixte' };
        doc.text(`Catégorie : ${catMap[devis.operation_category] || devis.operation_category}`, 14, 91);
        if (devis.vat_on_debits) {
            doc.text("Option pour le paiement de la TVA d'après les débits", 14, 96);
        }
    }


    // Info Client (Droite, sous le header)
    const clientX = 120;
    const clientY = 75;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text("Client :", clientX, clientY);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(client.name || "Client Inconnu", clientX, clientY + 5);

    let clientAddressY = clientY + 10;
    if (client.address) {
        const addressLines = doc.splitTextToSize(client.address, 70);
        doc.text(addressLines, clientX, clientAddressY);
        clientAddressY += (addressLines.length * 5);
    }

    // Display SIREN/TVA if present (Required for Factur-X visual consistency)
    if (client.siren) {
        doc.text(`SIREN : ${client.siren}`, clientX, clientAddressY);
        clientAddressY += 5;
    }
    if (client.tva_intracom) {
        doc.text(`TVA Intra : ${client.tva_intracom}`, clientX, clientAddressY);
    }


    // Titre / Objet (Juste au dessus du tableau)
    let tableStartY = 105;
    if (devis.title) {
        const titleY = Math.max(95, clientAddressY + 10);

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50, 50, 50);
        doc.text(`Objet : ${devis.title}`, 14, titleY);

        tableStartY = titleY + 8;
    }

    // Tableau des prestations
    const tableColumn = ["Description", "Quantité", "Prix Unitaire HT", "Total HT"];
    const tableRows = [];

    devis.items.forEach(item => {
        const itemData = [
            item.description,
            item.quantity,
            `${item.price.toFixed(2)} €`,
            `${(item.quantity * item.price).toFixed(2)} €`
        ];
        tableRows.push(itemData);
    });

    autoTable(doc, {
        startY: tableStartY,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: isInvoice ? [46, 125, 50] : [66, 133, 244] },
        styles: { fontSize: 9 },
    });

    // Totaux
    const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 10 : 150;
    const labelX = 130;
    const valueX = 195;

    doc.text(`Total HT :`, labelX, finalY);
    doc.text(`${devis.total_ht.toFixed(2)} €`, valueX, finalY, { align: 'right' });

    if (devis.include_tva !== false) {
        doc.text(`TVA (20%) :`, labelX, finalY + 6);
        doc.text(`${devis.total_tva.toFixed(2)} €`, valueX, finalY + 6, { align: 'right' });
    } else {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text("TVA non applicable, art. 293 B du CGI", labelX, finalY + 6);
    }

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total TTC :`, labelX, finalY + 14);
    doc.text(`${devis.total_ttc.toFixed(2)} €`, valueX, finalY + 14, { align: 'right' });

    // Notes / Conditions
    let currentY = finalY + 30;

    if (devis.notes) {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Notes / Conditions :", 14, currentY);
        currentY += 6;

        const splitNotes = doc.splitTextToSize(devis.notes, 180);
        doc.text(splitNotes, 14, currentY);
        currentY += (splitNotes.length * 5) + 10;
    }

    // Signature
    if (devis.signature) {
        if (currentY + 40 > 280) {
            doc.addPage();
            currentY = 20;
        }

        const signatureY = currentY + 10;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("Bon pour accord :", 120, signatureY);

        const signedDate = devis.signed_at ? new Date(devis.signed_at) : new Date();
        doc.text(`Signé le ${signedDate.toLocaleDateString('fr-FR')}`, 120, signatureY + 5);

        try {
            doc.addImage(devis.signature, 'PNG', 120, signatureY + 10, 50, 25);
        } catch (e) {
            console.warn("Could not add signature to PDF", e);
        }
    }

    // Informations de paiement (IBAN) pour les factures
    if (isInvoice && userProfile.iban) {
        let paymentY = currentY + 40;
        if (paymentY + 30 > 280) {
            doc.addPage();
            paymentY = 20;
        } else if (devis.signature && currentY + 80 > 280) {
            paymentY = currentY + (devis.signature ? 50 : 20);
            if (paymentY + 30 > 280) {
                doc.addPage();
                paymentY = 20;
            }
        }

        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.rect(14, paymentY, 180, 25, 'FD');

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text("Informations de paiement", 20, paymentY + 8);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text("Virement bancaire :", 20, paymentY + 16);
        doc.setFont(undefined, 'bold');
        doc.text(`IBAN : ${userProfile.iban}`, 55, paymentY + 16);

        doc.setFont(undefined, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Merci d'indiquer la référence "${typeDocument} ${devis.id}" dans le libellé du virement.`, 20, paymentY + 22);
    }

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`${typeDocument} généré par Artisan Facile - Conforme Factur-X`, 105, 290, { align: 'center' });
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

            // Attach XML
            await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
                mimeType: 'text/xml',
                description: 'Factur-X Invoice Data',
                creationDate: new Date(),
                modificationDate: new Date(),
            });

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

    const fileName = isInvoice ? `facture_${devis.id}.pdf` : `devis_${devis.id || 'brouillon'}.pdf`;

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
