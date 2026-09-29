// Chargement à la demande des moteurs PDF (jsPDF + pdf-lib ≈ 1 Mo, pdf.js ≈
// 440 Ko) pour les pages publiques (/q/:token, /p/:token), qui sont dans le
// bundle principal : un import statique faisait télécharger et exécuter ces
// bibliothèques au démarrage de toute l'application, page d'accueil comprise.
// Mêmes signatures que les fonctions d'origine (toutes déjà asynchrones).

export const generateDevisPDF = (...args) =>
    import('./pdfGenerator').then((m) => m.generateDevisPDF(...args));

export const generateInterventionReportPDF = (...args) =>
    import('./pdfGenerator').then((m) => m.generateInterventionReportPDF(...args));

export const renderPdfBlobToPageImages = (...args) =>
    import('./pdfPageImages').then((m) => m.renderPdfBlobToPageImages(...args));
