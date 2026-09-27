// Point d'entrée historique de la génération PDF.
//
// Le code est découpé par type de document dans ./pdf/ :
//   - quotePdf.js   : devis, avenants, factures, avoirs (mise en page commune) ;
//   - facturx.js    : intégration Factur-X des factures ;
//   - watermark.js  : filigranes « acquittée » et « document fermé » ;
//   - reportPdf.js  : rapports d'intervention ;
//   - i18n.js, logo.js : libellés traduits et logo arrondi, partagés.

export { generateDevisPDF } from './pdf/quotePdf';
export { generateInterventionReportPDF } from './pdf/reportPdf';
