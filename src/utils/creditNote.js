// Construction d'un avoir (facture rectificative, type 'credit_note') à partir
// d'une facture émise. Une facture émise étant immuable (numéro figé,
// suppression interdite), l'avoir est le seul moyen réglementaire de l'annuler
// ou de la corriger : document à montants négatifs, rattaché à la facture via
// parent_id, numéroté AV-AAAA-NNNN par la base à l'émission.
//
// Deux modes :
//   - 'total'   : toutes les lignes de la facture reprises en négatif ;
//   - 'partial' : une ligne unique du montant TTC saisi (motif recommandé).
//
// Les buying_price sont remis à zéro : le coût d'achat reste porté par la
// facture d'origine, l'avoir ne doit pas le compter une seconde fois dans les
// calculs de marge.

const round2 = (n) => Math.round(n * 100) / 100;

export function buildCreditNotePayload(invoice, { mode, amountTTC = 0, reason = '' } = {}) {
    if (!invoice || invoice.type !== 'invoice') {
        throw new Error("Un avoir ne peut être créé qu'à partir d'une facture.");
    }
    if (!invoice.invoice_number) {
        throw new Error("Cette facture n'a pas encore été émise : modifiez-la ou supprimez-la plutôt que de créer un avoir.");
    }

    const includeTva = invoice.include_tva !== false;
    const parentRef = invoice.invoice_number;
    const reasonSuffix = reason && reason.trim() ? ` — ${reason.trim()}` : '';

    let items;
    if (mode === 'total') {
        const sourceItems = Array.isArray(invoice.items) ? invoice.items : [];
        if (sourceItems.length === 0) {
            throw new Error('La facture ne contient aucune ligne à reprendre.');
        }
        items = sourceItems.map((item, idx) => ({
            id: Date.now() + idx,
            description: item.type === 'section'
                ? item.description
                : `${item.description || 'Ligne'} (avoir sur facture ${parentRef})`,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || 'unité',
            price: -(parseFloat(item.price) || 0),
            buying_price: 0,
            type: item.type || 'service',
        }));
    } else if (mode === 'partial') {
        const ttc = parseFloat(amountTTC);
        if (!(ttc > 0)) {
            throw new Error('Montant de l\'avoir invalide.');
        }
        const maxTTC = Math.abs(parseFloat(invoice.total_ttc) || 0);
        if (maxTTC > 0 && ttc > maxTTC + 0.005) {
            throw new Error(`Le montant de l'avoir (${ttc.toFixed(2)} €) dépasse le total de la facture (${maxTTC.toFixed(2)} €).`);
        }
        const ht = includeTva ? ttc / 1.2 : ttc;
        items = [{
            id: Date.now(),
            description: `Avoir partiel sur facture ${parentRef}${reasonSuffix}`,
            quantity: 1,
            unit: 'forfait',
            price: -round2(ht),
            buying_price: 0,
            type: 'service',
        }];
    } else {
        throw new Error(`Mode d'avoir inconnu : ${mode}`);
    }

    // Lignes de section : pas de montant, on les ignore dans les totaux.
    const totalHT = round2(items
        .filter(i => i.type !== 'section')
        .reduce((sum, i) => sum + (i.quantity * i.price), 0));
    const totalTVA = includeTva ? round2(totalHT * 0.2) : 0;
    const totalTTC = round2(totalHT + totalTVA);

    if (totalHT >= 0) {
        throw new Error("Le total de l'avoir doit être négatif.");
    }

    return {
        type: 'credit_note',
        // Émis immédiatement : le trigger DB attribue le numéro AV- à l'insertion.
        status: 'billed',
        date: new Date().toISOString().split('T')[0],
        title: `Avoir sur facture ${parentRef}${invoice.title ? ` — ${invoice.title}` : ''}`,
        items,
        include_tva: includeTva,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        parent_id: invoice.id,
        deposit_percentage: 0,
        amendment_details: {
            credit_note: {
                parent_invoice_id: invoice.id,
                parent_invoice_number: parentRef,
                parent_invoice_date: invoice.date || null,
                parent_total_ttc: parseFloat(invoice.total_ttc) || 0,
                mode,
                reason: reason?.trim() || null,
            },
        },
        notes: [
            `Avoir émis le ${new Date().toLocaleDateString('fr-FR')} sur la facture ${parentRef}${invoice.date ? ` du ${new Date(invoice.date).toLocaleDateString('fr-FR')}` : ''}.`,
            reason?.trim() ? `Motif : ${reason.trim()}` : null,
            mode === 'total'
                ? 'Cet avoir annule intégralement la facture référencée.'
                : 'Cet avoir vient en déduction de la facture référencée.',
        ].filter(Boolean).join('\n'),
    };
}

// ── Acomptes nets des avoirs qui les annulent ──
//
// La facture de clôture déduit les acomptes déjà facturés, qu'elle retrouve
// comme enfants du devis. Un avoir, lui, s'accroche à la FACTURE qu'il annule,
// pas au devis : il restait donc invisible à la clôture, qui continuait de
// déduire un acompte annulé — et créditait le client d'un montant qu'il n'avait
// jamais réglé.
//
// Deux cas, une seule règle : on retranche de chaque acompte les avoirs qui le
// visent. Un avoir total le ramène à zéro et il disparaît des déductions ; un
// avoir partiel n'en déduit que le reliquat.
//
// (Un avoir « total » marque en outre sa facture `cancelled`, ce qui l'exclut
// déjà en amont ; ce filet couvre les avoirs partiels et les factures annulées
// avant que ce marquage n'existe.)

/**
 * Acomptes ramenés à leur montant réellement dû, avoirs déduits.
 *
 * @param {Array} deposits Les factures d'acompte rattachées au devis.
 * @param {Array} creditNotes Les avoirs, rattachés à ces factures par parent_id.
 * @returns {Array} Les acomptes encore à déduire, avec `netHT` (montant restant)
 *                  et `creditedHT` (montant annulé). Ceux entièrement annulés
 *                  sont écartés.
 */
export function depositsNetOfCreditNotes(deposits, creditNotes) {
    const creditedByInvoice = new Map();
    for (const note of creditNotes || []) {
        if (note.parent_id == null) continue;
        const credited = Math.abs(parseFloat(note.total_ht) || 0);
        creditedByInvoice.set(note.parent_id, (creditedByInvoice.get(note.parent_id) || 0) + credited);
    }

    return (deposits || [])
        .map(deposit => {
            const creditedHT = creditedByInvoice.get(deposit.id) || 0;
            const grossHT = Math.abs(parseFloat(deposit.total_ht) || 0);
            // Un avoir ne peut pas rendre l'acompte négatif : au-delà du montant
            // facturé, l'excédent ne se déduit pas de la clôture.
            return { ...deposit, creditedHT, netHT: Math.max(grossHT - creditedHT, 0) };
        })
        // Le demi-centime écarte les résidus d'arrondi d'un avoir total.
        .filter(deposit => deposit.netHT > 0.005);
}
