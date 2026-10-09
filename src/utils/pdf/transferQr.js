// QR code de virement SEPA (EPC) dessiné en vectoriel dans le PDF.
import qrcode from 'qrcode-generator';
import { epcPayload } from '../depositPayment';

/** Dessine le QR dans le carré (x, y, size) en mm. Sans effet si le virement n'est pas exploitable. */
export function drawTransferQr(doc, { x, y, size, iban, name, amount, reference }) {
    const payload = epcPayload({ iban, name, amount, reference });
    if (!payload) return;

    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();

    const count = qr.getModuleCount();
    const cell = size / count;
    doc.setFillColor(255, 255, 255);
    doc.rect(x - 1.5, y - 1.5, size + 3, size + 3, 'F');
    doc.setFillColor(0, 0, 0);
    for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
            if (qr.isDark(row, col)) doc.rect(x + col * cell, y + row * cell, cell, cell, 'F');
        }
    }
    doc.setFontSize(6);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Virement acompte', x + size / 2, y + size + 4, { align: 'center' });
}
