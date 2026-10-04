// Parcours d'une affaire : devis → signature → acompte → chantier → facture.
//
// Une affaire, c'est un devis racine et tout ce qui s'y accroche (acomptes,
// avenants, situations, facture de clôture — tous liés par `parent_id`).
// Chaque écran ne montrait jusqu'ici qu'un morceau de l'histoire : ce module
// la résume en cinq étapes, dit laquelle attend l'artisan et quelle action la
// fait avancer. Fonction pure, sans accès base : l'écran de suivi charge les
// documents et lit le résultat.

import { amendmentsTotalTTC } from './materialDeposit';

const SIGNED_STATUSES = ['accepted', 'billed', 'paid'];
const REFUSED_STATUSES = ['refused', 'rejected'];
const CLOSING_RE = /cl[oô]ture/i;
const DEPOSIT_RE = /acompte/i;

const isInvoice = (doc) => doc?.type === 'invoice' && doc.status !== 'cancelled';
// Une facture liée n'est « émise » qu'une fois numérotée ou passée en billed/paid :
// un brouillon de facture n'engage encore rien auprès du client.
const isIssued = (doc) => ['billed', 'paid'].includes(doc?.status);

/** Factures de clôture (non annulées) parmi les documents liés. */
export const closingInvoicesOf = (children) =>
    (children || []).filter(d => isInvoice(d) && CLOSING_RE.test(d.title || ''));

/** Factures d'acompte (y compris acompte matériel) parmi les documents liés. */
export const depositInvoicesOf = (children) =>
    (children || []).filter(d => isInvoice(d)
        && !CLOSING_RE.test(d.title || '')
        && (DEPOSIT_RE.test(d.title || '')
            || (Array.isArray(d.items) && d.items.some(it => DEPOSIT_RE.test(it?.description || '')))));

const docRef = (doc) => doc.invoice_number || doc.quote_number || `n°${doc.id}`;

/**
 * Montants de l'affaire : total engagé (devis + avenants signés), déjà encaissé
 * (factures liées payées) et reste à encaisser.
 */
export function affaireAmounts(quote, children = []) {
    const quoteTTC = Number(quote?.total_ttc) || 0;
    const amendmentsTTC = amendmentsTotalTTC(children);
    const totalTTC = quoteTTC + amendmentsTTC;
    // Devis converti directement en facture : c'est lui qui est encaissé.
    const paidDocs = [
        ...(quote?.type === 'invoice' && quote.status === 'paid' ? [quote] : []),
        ...(children || []).filter(d => isInvoice(d) && d.status === 'paid'),
    ];
    const paidTTC = paidDocs.reduce((sum, d) => sum + (Number(d.total_ttc) || 0), 0);
    return {
        quoteTTC,
        amendmentsTTC,
        totalTTC,
        paidTTC,
        remainingTTC: Math.max(totalTTC - paidTTC, 0),
    };
}

/**
 * Les cinq étapes de l'affaire.
 *
 * Chaque étape : { id, label, state, detail, action?, docs? }
 *   state  : 'done' | 'current' | 'todo' | 'skipped' | 'blocked'
 *   action : { kind, label, docId? } — ce qui fait avancer l'étape.
 *     kinds : open_quote, create_deposit, create_material_deposit,
 *             mark_paid, set_stage, create_closing, open_doc
 *
 * @param {object} quote    Le devis racine (ligne `quotes`).
 * @param {Array}  children Ses documents liés (parent_id = quote.id), annulés compris ou non.
 */
export function affaireJourney(quote, children = []) {
    const docs = (children || []).filter(d => d && d.status !== 'cancelled');
    const status = quote?.status || 'draft';
    const signed = SIGNED_STATUSES.includes(status) || !!quote?.signed_at;
    const refused = REFUSED_STATUSES.includes(status);
    const rootIsInvoice = quote?.type === 'invoice';

    // ── 1. Devis ──
    const devis = status === 'draft'
        ? { state: 'todo', detail: 'Brouillon : à finaliser puis envoyer au client.', action: { kind: 'open_quote', label: 'Finaliser et envoyer' } }
        : { state: 'done', detail: quote?.quote_number ? `Devis n°${quote.quote_number} envoyé.` : 'Devis envoyé.' };

    // ── 2. Signature ──
    let signature;
    if (signed) {
        signature = { state: 'done', detail: quote?.signed_at ? 'Signé par le client.' : 'Accepté par le client.', date: quote?.signed_at || null };
    } else if (refused) {
        signature = { state: 'blocked', detail: 'Refusé par le client.' };
    } else if (status === 'draft') {
        signature = { state: 'todo', detail: 'En attente de l\'envoi du devis.' };
    } else {
        signature = {
            state: 'todo',
            detail: quote?.last_viewed_at ? 'Consulté par le client, signature en attente.' : 'En attente de signature du client.',
            date: quote?.last_viewed_at || null,
            action: { kind: 'open_quote', label: 'Relancer le client' },
        };
    }

    // ── 3. Acompte ──
    const deposits = depositInvoicesOf(docs);
    const unpaidDeposit = deposits.find(d => d.status !== 'paid');
    const depositExpected = quote?.has_material_deposit === true || (Number(quote?.deposit_percentage) || 0) > 0;
    let acompte;
    if (deposits.length === 0 && !depositExpected) {
        acompte = { state: 'skipped', detail: 'Pas d\'acompte prévu sur ce devis.' };
        if (signed) acompte.action = { kind: 'create_deposit', label: 'Demander un acompte quand même', secondary: true };
    } else if (deposits.length === 0) {
        acompte = {
            state: 'todo',
            detail: quote?.has_material_deposit ? 'Acompte matériel prévu, à facturer avant la commande.' : `Acompte de ${Number(quote.deposit_percentage)} % prévu.`,
            action: signed
                ? (quote?.has_material_deposit
                    ? { kind: 'create_material_deposit', label: 'Facturer l\'acompte matériel' }
                    : { kind: 'create_deposit', label: 'Facturer l\'acompte' })
                : undefined,
        };
    } else if (unpaidDeposit) {
        acompte = {
            state: 'todo',
            detail: isIssued(unpaidDeposit)
                ? `Acompte ${docRef(unpaidDeposit)} émis, en attente de règlement.`
                : `Acompte ${docRef(unpaidDeposit)} en brouillon, à envoyer au client.`,
            action: isIssued(unpaidDeposit)
                ? { kind: 'mark_paid', label: 'Acompte encaissé', docId: unpaidDeposit.id }
                : { kind: 'open_doc', label: 'Ouvrir l\'acompte', docId: unpaidDeposit.id },
        };
    } else {
        acompte = { state: 'done', detail: deposits.length > 1 ? `${deposits.length} acomptes encaissés.` : `Acompte ${docRef(deposits[0])} encaissé.` };
    }
    acompte.docs = deposits;

    // Facture finale : la clôture liée, ou le devis lui-même s'il a été
    // converti en facture. Repérée dès maintenant car, payée, elle clôt aussi
    // le chantier même si l'artisan n'a pas déplacé la carte au kanban.
    const closings = closingInvoicesOf(docs);
    const finalInvoice = rootIsInvoice ? quote : (closings.find(c => c.status !== 'paid') || closings[0]);
    const finalPaid = !!finalInvoice && finalInvoice.status === 'paid';

    // ── 4. Chantier ──
    const stage = quote?.work_stage;
    let chantier;
    if (stage === 'completed' || finalPaid) {
        chantier = { state: 'done', detail: 'Travaux terminés.' };
    } else if (stage === 'in_progress') {
        chantier = { state: 'todo', detail: 'Travaux en cours.', action: { kind: 'set_stage', stage: 'completed', label: 'Chantier terminé' } };
    } else {
        chantier = {
            state: 'todo',
            detail: stage === 'material_order' ? 'Matériel à commander, chantier à démarrer.' : 'Chantier à planifier.',
            action: signed ? { kind: 'set_stage', stage: 'in_progress', label: 'Démarrer le chantier' } : undefined,
        };
    }

    // ── 5. Facture ──
    let facture;
    if (finalPaid) {
        facture = { state: 'done', detail: `Facture ${docRef(finalInvoice)} payée : affaire soldée.` };
    } else if (finalInvoice && isIssued(finalInvoice)) {
        facture = {
            state: 'todo',
            detail: `Facture ${docRef(finalInvoice)} émise, en attente de règlement.`,
            action: { kind: 'mark_paid', label: 'Facture encaissée', docId: finalInvoice.id },
        };
    } else if (finalInvoice) {
        facture = {
            state: 'todo',
            detail: `Facture ${docRef(finalInvoice)} en brouillon, à envoyer au client.`,
            action: { kind: 'open_doc', label: 'Ouvrir la facture', docId: finalInvoice.id },
        };
    } else {
        facture = {
            state: 'todo',
            detail: 'Facture de clôture : devis + avenants signés, acomptes déduits.',
            action: signed ? { kind: 'create_closing', label: 'Générer la facture de clôture' } : undefined,
        };
    }
    facture.docs = rootIsInvoice ? [] : closings;

    const steps = [
        { id: 'devis', label: 'Devis', ...devis },
        { id: 'signature', label: 'Signature', ...signature },
        { id: 'acompte', label: 'Acompte', ...acompte },
        { id: 'chantier', label: 'Chantier', ...chantier },
        { id: 'facture', label: 'Facture', ...facture },
    ];

    // L'étape « en cours » est la première qui n'est ni faite ni sans objet :
    // c'est elle que l'écran met en avant. Une affaire refusée s'arrête là.
    const current = refused
        ? steps.find(s => s.state === 'blocked')
        : steps.find(s => s.state !== 'done' && s.state !== 'skipped');
    if (current && current.state === 'todo') current.state = 'current';

    return {
        steps,
        current: current || null,
        completed: !current,
        refused,
    };
}
