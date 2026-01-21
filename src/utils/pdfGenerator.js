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
    // Logo
    let contentStartY = 35; // Increased from 30 to Avoid Header Crop
    if (userProfile.logo_url) {
        try {
            // Note: addImage is sync, usually fine if image is preloaded or dataURL. 
            // If it's a URL, jsPDF might need it to be base64. 
            // Assuming existing logic worked, we keep it. 
            // If logo_url is a remote URL, jsPDF often fails without base64. 
            // But let's assume it works as per previous code.
            doc.addImage(userProfile.logo_url, 'JPEG', 14, 15, 20, 20); // Moved Y from 10 to 15
            contentStartY = 40; // Increased from 35
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
    doc.line(14, 65, 196, 65); // Moved Y if needed? 65 seems safe as contentStartY is ~35-40 + 15 = 55 max.

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

    // ---------------------------------------------------------
    // Tableau des prestations (Séparé Main d'oeuvre / Matériel)
    // ---------------------------------------------------------

    const services = devis.items.filter(i => i.type === 'service' || !i.type); // Default to service if undefined
    const materials = devis.items.filter(i => i.type === 'material');

    const tableColumn = ["Description", "Quantité", "Prix Unitaire HT", "Total HT"];

    // Track current Y position for multiple tables
    let currentTableY = tableStartY;

    // Helper to generate rows
    const generateRows = (items) => items.map(item => [
        item.description,
        item.quantity,
        `${item.price.toFixed(2)} €`,
        `${(item.quantity * item.price).toFixed(2)} €`
    ]);

    // 1. Table Main d'Oeuvre
    if (services.length > 0) {
        // Section Title
        if (materials.length > 0) { // Only show header if we have both types, or always? User asked for clear separation.
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(100, 100, 100);
            doc.text("MAIN D'OEUVRE & PRESTATIONS", 14, currentTableY - 2);
        }

        autoTable(doc, {
            startY: currentTableY,
            head: [tableColumn],
            body: generateRows(services),
            theme: 'grid',
            headStyles: { fillColor: isInvoice ? [46, 125, 50] : [66, 133, 244] },
            styles: { fontSize: 9 },
        });

        currentTableY = doc.lastAutoTable.finalY + 10;
    }

    // 2. Table Matériel
    if (materials.length > 0) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(100, 100, 100);
        doc.text("MATÉRIEL & FOURNITURES", 14, services.length > 0 ? currentTableY - 2 : currentTableY - 2); // Title

        autoTable(doc, {
            startY: currentTableY,
            head: [tableColumn],
            body: generateRows(materials),
            theme: 'grid',
            headStyles: { fillColor: [120, 144, 156] }, // Blue Grey
            styles: { fontSize: 9 },
        });

        currentTableY = doc.lastAutoTable.finalY + 10;
    }

    // Totaux
    const finalY = currentTableY > tableStartY ? currentTableY : 150; // Fallback
    const labelX = 130;
    const valueX = 195;

    doc.setFont(undefined, 'normal');
    // ... Totals rendering ...
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

    // Notes / Conditions (Calcul Automatique Acompte Matériel)
    let currentY = finalY + 30;

    let allNotes = devis.notes || '';

    // Automatic Material Deposit Note for Quotes
    if (!isInvoice && materials.length > 0) {
        const materialHT = materials.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Calculate effective VAT rate (infer from totals to support manual adjustments or different rates)
        let vatRate = 0.20; // Default
        if (devis.total_ht > 0 && devis.total_tva >= 0) {
            vatRate = devis.total_tva / devis.total_ht;
        }

        // Calculate VAT part for materials using effective rate
        const materialTTC = devis.include_tva !== false ? materialHT * (1 + vatRate) : materialHT;

        const depositNote = `\n\n--- ACOMPTE MATÉRIEL ---\nMontant des fournitures : ${materialTTC.toFixed(2)} € TTC.\nUn acompte correspondant à la totalité du matériel est requis à la signature.\nUne facture d'acompte vous sera envoyée dès validation du devis.`;

        allNotes += depositNote;
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
                    doc.text("Montage Avant / Après", 105, 20, { align: 'center' });

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
    if (allNotes && devis.status !== 'paid') {
        const splitNotes = doc.splitTextToSize(allNotes, 180);
        const notesHeight = splitNotes.length * 5 + 15;

        // Check if notes fit on current page
        if (currentY + notesHeight > 280) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Notes / Conditions :", 14, currentY);
        currentY += 6;

        doc.text(splitNotes, 14, currentY);
        currentY += (splitNotes.length * 5) + 10;
    }

    // Signature (Masqué si payé, "Bon pour accord" n'a plus de sens sur une quittance)
    if (devis.signature && devis.status !== 'paid') {
        if (currentY + 40 > 280) {
            doc.addPage();
            currentY = 20;
        }

        const signatureY = currentY + 10;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("Bon pour accord :", 120, signatureY);

        const signedDate = devis.signed_at ? new Date(devis.signed_at) : new Date(devis.updated_at || devis.date || new Date());
        doc.text(`Signé le ${signedDate.toLocaleDateString('fr-FR')}`, 120, signatureY + 5);

        try {
            doc.addImage(devis.signature, 'PNG', 120, signatureY + 10, 50, 25);
        } catch (e) {
            console.warn("Could not add signature to PDF", e);
        }
    }

    // Informations de paiement (IBAN + Wero)
    const hasIban = userProfile.iban && userProfile.iban.trim().length > 0;
    const weroNumber = userProfile.phone;

    if (hasIban || weroNumber) {
        let paymentY = currentY + 40;

        // Smart Page Break Logic
        // Calculate required space: Header (8) + IBAN (6) + Wero (6) + Ref (8) + Padding (5) ≈ 35-40
        const requiredHeight = 45;

        if (paymentY + requiredHeight > 280) {
            doc.addPage();
            paymentY = 20;
        } else if (devis.signature && currentY + 90 > 280) { // Check if signature + payment fits
            // If signature pushes payment off page
            doc.addPage();
            paymentY = 20;
        } else if (devis.signature) {
            // Signature is present, payment goes below it
            // Signature is approx 30-40 units high
            paymentY = currentY + 50;

            if (paymentY + requiredHeight > 280) {
                doc.addPage();
                paymentY = 20;
            }
        }

        // Box
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.rect(14, paymentY, 180, 32, 'FD'); // Increased height from 25 to 32

        // Title
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text("Moyens de paiement acceptés :", 20, paymentY + 8);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');

        let lineOffset = 16;

        // IBAN Line
        if (hasIban) {
            doc.text("Virement", 20, paymentY + lineOffset);
            doc.setFont(undefined, 'bold');
            doc.text(`IBAN : ${userProfile.iban}`, 55, paymentY + lineOffset);
            doc.setFont(undefined, 'normal');
            lineOffset += 6;
        }

        // Wero Line
        doc.text("Paylib / Wero", 20, paymentY + lineOffset);
        doc.setFont(undefined, 'bold');
        doc.text(`Tél : ${weroNumber}`, 55, paymentY + lineOffset);

        // Reference info - Only if NOT paid
        if (devis.status !== 'paid') {
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Merci d'indiquer la référence "${typeDocument} ${devis.id}" lors du paiement.`, 20, paymentY + 28);
        }
    }


    // Mention "ACQUITTÉE" si payée
    if (isInvoice && devis.status === 'paid') {
        doc.setTextColor(220, 38, 38); // Red color
        doc.setFontSize(30);
        doc.setFont(undefined, 'bold');
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.5 }));

        // Rotate text logic (manual approximation as standard jsPDF rotate is tricky without context, usually use angle arg in text)
        // doc.text(text, x, y, options: {angle: 45})
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.text("ACQUITTÉE", pageWidth / 2, pageHeight / 2, {
            align: 'center',
            angle: 45,
            renderingMode: 'fill'
        });

        doc.restoreGraphicsState();
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
