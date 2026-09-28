// PDF des rapports d'intervention.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatDateTime } from '../format';
import { buildRoundedLogoDataUrl } from './logo';

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
                ? formatDateTime(m.timestamp, { dateStyle: 'short', timeStyle: 'short' })
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
        doc.text(`Signé le ${formatDateTime(report.signed_at)}`, 14, y);
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
