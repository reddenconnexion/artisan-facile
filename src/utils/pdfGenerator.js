import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import { generateFacturXXML } from './facturxGenerator';

// Safe Date Helper
const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString();
    } catch (e) {
        return '';
    }
};

// Converted to Async to support pdf-lib operations
export const generateDevisPDF = async (devis, client, userProfile, isInvoice = false, returnType = false) => {
    // ---------------------------------------------------------
    // 1. Generate Visual PDF with jsPDF (Existing Logic)
    // ---------------------------------------------------------
    const doc = new jsPDF();

    const typeDocument = isInvoice ? "FACTURE" : (devis.type === 'amendment' ? "AVENANT" : "DEVIS");
    const dateLabel = isInvoice ? "Date de facturation" : "Date d'émission";
    const isAmendment = devis.type === 'amendment';

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

    if (isAmendment) {
        doc.text(`AVENANT - MODIFICATION TECHNIQUE`, 14, 75);
    } else {
        doc.text(`${typeDocument} N° ${devis.id || 'PROVISOIRE'}`, 14, 75);
    }

    // Mention "ACQUITTÉE" bien visible en haut de la 1ère page
    if (isInvoice && devis.status === 'paid') {
        const titleWidth = doc.getTextWidth(`${typeDocument} N° ${devis.id || 'PROVISOIRE'}`);
        const stampX = 14 + titleWidth + 5;
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text("ACQUITTÉE", stampX, 75);
        // Reset
        doc.setTextColor(0, 0, 0);
    }

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${dateLabel} : ${formatDate(devis.date)}`, 14, 85);
    if (!isInvoice && devis.valid_until) {
        doc.text(`Valable jusqu'au : ${formatDate(devis.valid_until)}`, 14, 90);
    }

    // Factur-X Info (Ops Category)
    if (isInvoice && devis.operation_category) {
        const catMap = { 'service': 'Prestation de services', 'goods': 'Livraison de biens', 'mixed': 'Mixte' };
        doc.text(`Catégorie : ${catMap[devis.operation_category] || devis.operation_category}`, 14, 95);
        if (devis.vat_on_debits) {
            doc.text("Option pour le paiement de la TVA d'après les débits", 14, 100);
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

    // Adresse d'intervention (si différente)
    if (devis.intervention_address) {
        clientAddressY += 10;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0); // Black for visibility
        doc.text("Lieu d'intervention :", clientX, clientAddressY);

        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        clientAddressY += 5;

        const interventionAddr = `${devis.intervention_address} ${devis.intervention_postal_code || ''} ${devis.intervention_city || ''}`;
        const intLines = doc.splitTextToSize(interventionAddr, 70);
        doc.text(intLines, clientX, clientAddressY);
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

    if (isAmendment) {
        // --- AVENANT SECTIONS ---
        // 1. Reference
        const parentRef = devis.parent_quote_data
            ? `Devis initial N° ${devis.parent_quote_data.id} du ${formatDate(devis.parent_quote_data.date)}`
            : `Devis initial Référence Inconnue`;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(parentRef, 14, 81); // Under title roughly

        let currentY = tableStartY;

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
        doc.text("CONSTAT TERRAIN :", 14, currentY);
        currentY += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);

        if (details.constat_date) {
            doc.text(`Lors de l'intervention du ${formatDate(details.constat_date)}, découverte de :`, 14, currentY);
            currentY += 5;
        }
        if (details.constat_description) {
            const descLines = doc.splitTextToSize(details.constat_description, 180);
            doc.text(descLines, 14, currentY);
            currentY += (descLines.length * 5) + 2;
        }

        if (details.constat_reason) {
            doc.text(`→ Impossibilité de réaliser la solution initiale pour cause de ${details.constat_reason}`, 14, currentY);
            currentY += 10;
        } else {
            currentY += 5;
        }

        // 3. NOUVELLE SOLUTION
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text("NOUVELLE SOLUTION :", 14, currentY);
        currentY += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);

        if (details.solution_description) {
            const solLines = doc.splitTextToSize(`- ${details.solution_description}`, 180);
            doc.text(solLines, 14, currentY);
            currentY += (solLines.length * 5);
        }

        doc.text(`- Matériel complémentaire :`, 14, currentY);
        currentY += 5;

        if (details.solution_technical_value) {
            doc.text(`- Plus-value technique : ${details.solution_technical_value}`, 14, currentY);
            currentY += 8;
        } else {
            currentY += 3;
        }

        tableStartY = currentY;
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
            headStyles: { fillColor: isInvoice ? [46, 125, 50] : [37, 99, 235] }, // Blue-600
            styles: { fontSize: 9 },
        });

        currentTableY = doc.lastAutoTable.finalY + 15; // Increased gap
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
            headStyles: { fillColor: [84, 110, 122] }, // Slate-500
            styles: { fontSize: 9 },
        });

        currentTableY = doc.lastAutoTable.finalY + 15;
    }

    if (isAmendment) {
        // AJUSTEMENT FINANCIER
        const details = devis.amendment_details || {};
        const finalY = (currentTableY > tableStartY ? currentTableY : tableStartY) + 10;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text("AJUSTEMENT FINANCIER :", 14, finalY);

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

            doc.text(`Devis Initial TTC :`, leftX, financeY);
            doc.text(`${initialTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.text(`Facturé à ce jour (Situation) :`, leftX, financeY);
            doc.text(`${progressTotal.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`(incluant acompte)`, rightValueX, financeY + 3, { align: 'right' });
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235); // Blue
            doc.text(`Montant Avenant TTC :`, leftX, financeY);
            doc.text(`+${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            doc.setFontSize(12);
            doc.text(`Nouveau Total Projet :`, leftX, financeY);
            // New Total = Situation + Amendment
            doc.text(`${(progressTotal + amendmentTTC).toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`(Solde à régler sur cet avenant : ${amendmentTTC.toFixed(2)} €)`, rightValueX, financeY, { align: 'right' });

        } else {
            // SCENARIO B: NO SITUATION (Standard Additive)
            // Balance = Initial + Amendment - Deposit

            doc.text(`Devis Initial TTC :`, leftX, financeY);
            doc.text(`${initialTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            if (deposit > 0) {
                doc.text(`Acompte versé :`, leftX, financeY);
                doc.text(`${deposit.toFixed(2)} € (conservé)`, rightValueX, financeY, { align: 'right' });
                financeY += 6;
            }

            doc.setFont(undefined, 'bold');
            doc.setTextColor(37, 99, 235);
            doc.text(`Complément Avenant TTC :`, leftX, financeY);
            doc.text(`+${amendmentTTC.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            financeY += 8;

            // Balance Calculation
            const balance = initialTTC + amendmentTTC - deposit;

            doc.setFontSize(12);
            doc.text(`Nouveau Solde à Régler :`, leftX, financeY);
            doc.text(`${balance.toFixed(2)} €`, rightValueX, financeY, { align: 'right' });
            financeY += 6;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`(Total Projet : ${(initialTTC + amendmentTTC).toFixed(2)} € TTC)`, rightValueX, financeY, { align: 'right' });
        }

        // Update currentY for next sections
        currentTableY = financeY + 10;

    } else {
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
    }

    // Position for Notes
    const finalTableY = isAmendment ? currentTableY : (currentTableY > tableStartY ? currentTableY : 150) + 14;
    let currentY = finalTableY + 20;

    let allNotes = devis.notes || '';

    // Automatic Material Deposit Note for Quotes
    if (!isInvoice && materials.length > 0 && devis.has_material_deposit === true) {
        const materialHT = materials.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Calculate effective VAT rate (infer from totals to support manual adjustments or different rates)
        let vatRate = 0.20; // Default
        if (devis.total_ht > 0 && devis.total_tva >= 0) {
            vatRate = devis.total_tva / devis.total_ht;
        }

        // Calculate VAT part for materials using effective rate
        const materialTTC = devis.include_tva !== false ? materialHT * (1 + vatRate) : materialHT;

        const depositNote = `\n\n--- ACOMPTE MATÉRIEL ---\nMontant des fournitures : ${materialTTC.toFixed(2)} € TTC.\nUn acompte correspondant à la totalité du matériel est requis à la signature.`;

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
    if (allNotes) {
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
    const weroNumber = (userProfile.wero_phone && userProfile.wero_phone.trim().length > 0) ? userProfile.wero_phone : null;

    // Determine content start Y (after Notes/Signature)
    let elementY = currentY + 40;
    if (devis.signature && devis.status !== 'paid') {
        elementY = currentY + 50;
    }

    if (hasIban || weroNumber) {
        const boxHeight = 32;

        // Check if box fits
        if (elementY + boxHeight > 285) {
            doc.addPage();
            elementY = 20;
        }

        // Box
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.rect(14, elementY, 180, boxHeight, 'FD');

        // Title
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text("Moyens de paiement acceptés :", 20, elementY + 8);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');

        let lineOffset = 16;

        // IBAN Line
        if (hasIban) {
            doc.text("Virement", 20, elementY + lineOffset);
            doc.setFont(undefined, 'bold');
            doc.text(`IBAN : ${userProfile.iban}`, 55, elementY + lineOffset);
            doc.setFont(undefined, 'normal');
            lineOffset += 6;
        }

        // Wero Line
        // Wero Line
        if (weroNumber && weroNumber.trim().length > 0) {
            doc.text("Paylib / Wero", 20, elementY + lineOffset);
            doc.setFont(undefined, 'bold');
            const weroText = (userProfile.full_name || userProfile.company_name)
                ? `Tél : ${weroNumber} (${userProfile.full_name || userProfile.company_name})`
                : `Tél : ${weroNumber}`;
            doc.text(weroText, 55, elementY + lineOffset);
        }

        // Reference info - Only if NOT paid
        if (devis.status !== 'paid') {
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Merci d'indiquer la référence "${typeDocument} ${devis.id}" lors du paiement.`, 20, elementY + 28);
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
        ? formatDate(devis.valid_until)
        : "à réception";

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
        doc.text("Échéancier de paiement :", 14, currentY);

        const scheduleBody = installments.map(inst => [
            formatDate(inst.due_date),
            `${inst.amount.toFixed(2)} €`,
            inst.status === 'paid' ? 'Payé' : (inst.status === 'partial' ? 'Partiel' : 'En attente')
        ]);

        autoTable(doc, {
            startY: currentY + 3,
            head: [['Date', 'Montant', 'Statut']],
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
        ? `Le règlement s'effectue par virement bancaire ou chèque à l'ordre de ${checkOrderName}.`
        : `Le règlement s'effectue par virement bancaire.`;

    const legalTerms = [
        `Règlement : Le paiement est dû ${isInvoice && devis.valid_until ? `le ${dueDate}` : 'à réception de la facture'}. ${paymentMethodText}`,
        "Pénalités de retard : Tout retard de paiement donnera lieu à l'application de pénalités calculées au taux de 10 % annuel, exigibles le jour suivant la date d'échéance, sans qu'un rappel soit nécessaire.",
        "Frais de recouvrement (Clients Pros) : Pour les clients professionnels, une indemnité forfaitaire de 40 € pour frais de recouvrement est due de plein droit en cas de retard de paiement (Art. L441-10 du Code de commerce).",
        "Réserve de propriété : Les marchandises et matériels installés restent la propriété du vendeur jusqu’au paiement intégral du prix."
    ];

    // Ajout de la mention "Sous réserve de..." pour les devis uniquement
    if (!isInvoice) {
        legalTerms.splice(1, 0, "Sous réserve technique : Ce devis est établi sous réserve de bonne faisabilité et de la conformité des réseaux ou supports existants (non visitables avant démontage).");
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
            doc.text("ACQUITTÉE", pageWidth / 2, pageHeight / 2, {
                align: 'center',
                angle: 45,
                renderingMode: 'fill'
            });
            doc.restoreGraphicsState();
        }
    }

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`${isAmendment ? 'AVENANT' : typeDocument} généré par Artisan Facile - Conforme Factur-X`, 105, 290, { align: 'center' });
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
            doc.addImage(userProfile.logo_url, 'JPEG', 14, contentY, 20, 20);
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
