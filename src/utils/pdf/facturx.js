// Factur-X (facture électronique) : le PDF visuel produit par jsPDF reçoit
// en pièce jointe le XML EN 16931 et les métadonnées XMP qui l'identifient
// comme Factur-X 1.08 / PDF/A-3. Spécifique aux factures.

import { PDFDocument, PDFName, AFRelationship } from 'pdf-lib';
import { generateFacturXXML } from '../facturxGenerator';

// Builds the XMP metadata packet required for Factur-X 1.08 / PDF/A-3B identification.
// Must use context.stream() (uncompressed) — PDF spec §14.3.2 forbids compressing the Metadata stream.
export const buildFacturXXMP = (profile = 'EN 16931', fileName = 'factur-x.xml') => {
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

/**
 * Embarque le XML Factur-X dans un PDF déjà généré.
 *
 * @param {ArrayBuffer} pdfBytes PDF visuel (jsPDF).
 * @returns {Promise<ArrayBuffer|Uint8Array>} PDF Factur-X, ou le PDF visuel
 *          inchangé si l'intégration échoue (on ne bloque pas l'artisan).
 */
export const embedFacturX = async (pdfBytes, devis, client, userProfile) => {
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
        return await pdfDoc.save();
    } catch (e) {
        console.error("Factur-X Embedding Failed:", e);
        // Fallback to visual PDF (pdfBytes) if embedding fails to avoid blocking the user
        return pdfBytes;
    }
};
