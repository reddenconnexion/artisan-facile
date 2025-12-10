import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateDevisPDF = (devis, client, userProfile, isInvoice = false, returnBlob = false) => {
    const doc = new jsPDF();
    const typeDocument = isInvoice ? "FACTURE" : "DEVIS";
    const dateLabel = isInvoice ? "Date de facturation" : "Date d'émission";

    // Logo
    let contentStartY = 30;
    if (userProfile.logo_url) {
        try {
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
    // On aligne le haut de la colonne droite avec le haut du nom de l'entreprise
    let rightY = contentStartY;
    const rightColX = 90; // Moved left to avoid overlap with potential right-aligned elements if any, but we are moving client info down.

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

    // Info Client (Droite, sous le header)
    const clientX = 120;
    const clientY = 75; // Fixed position, title will go below

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text("Client :", clientX, clientY);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(client.name || "Client Inconnu", clientX, clientY + 5);

    if (client.address) {
        const addressLines = doc.splitTextToSize(client.address, 70);
        doc.text(addressLines, clientX, clientY + 10);
    }

    // Titre / Objet (Juste au dessus du tableau)
    let tableStartY = 105;
    if (devis.title) {
        const titleY = Math.max(95, clientY + 10 + (client.address ? doc.splitTextToSize(client.address, 70).length * 4 : 0) + 10);

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50, 50, 50);
        doc.text(`Objet : ${devis.title}`, 14, titleY);

        tableStartY = titleY + 8;
    }
    // Email client (optional, maybe below address)
    // if (client.email) doc.text(client.email, clientX, 95);

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
        headStyles: { fillColor: isInvoice ? [46, 125, 50] : [66, 133, 244] }, // Green for Invoice, Blue for Quote
        styles: { fontSize: 9 },
    });

    // Totaux
    const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 10 : 150;
    const labelX = 130;
    const valueX = 195;

    doc.text(`Total HT :`, labelX, finalY);
    doc.text(`${devis.total_ht.toFixed(2)} €`, valueX, finalY, { align: 'right' });

    if (devis.include_tva !== false) { // Default to true if undefined
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
        currentY += (splitNotes.length * 5) + 10; // Adjust Y based on lines
    }

    // Signature
    if (devis.signature) {
        // Check if signature fits on current page, else add new page
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
            // Position carefully
            doc.addImage(devis.signature, 'PNG', 120, signatureY + 10, 50, 25);
        } catch (e) {
            console.warn("Could not add signature to PDF", e);
        }
    }

    // Informations de paiement (IBAN) pour les factures
    if (isInvoice && userProfile.iban) {
        let paymentY = currentY + 40;
        // Check page break
        if (paymentY + 30 > 280) {
            doc.addPage();
            paymentY = 20;
        } else if (devis.signature && currentY + 80 > 280) {
            // If signature was present, we might need more space
            // Logic already handled page break for signature, but let's be safe for Payment info following signature
            paymentY = Math.max(paymentY, (doc.lastAutoTable?.finalY || 150) + 50 + (devis.signature ? 40 : 0));
            // Simplify: just put it at the bottom or after signature
            paymentY = currentY + (devis.signature ? 50 : 20);
            if (paymentY + 30 > 280) {
                doc.addPage();
                paymentY = 20;
            }
        }

        // Render IBAN Box
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252); // Light gray/blue
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

        // Optional: BIC if we had it, or just generic instruction
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
        doc.text(`${typeDocument} généré par Artisan Facile`, 105, 290, { align: 'center' });
    }

    const fileName = isInvoice ? `facture_${devis.id}.pdf` : `devis_${devis.id || 'brouillon'}.pdf`;

    if (returnBlob) {
        return doc.output('blob');
    }

    doc.save(fileName);
};
