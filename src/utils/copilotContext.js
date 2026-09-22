// Contexte chiffré transmis au Copilot (CopilotChat).
//
// Le Copilot ne voit QUE ce qu'on lui passe dans `facts`. Sans les vrais
// chiffres, ses boutons « Quel est mon CA ce mois ? » ou « Vérifie la
// cohérence » ne pouvaient que répondre « je n'ai pas l'information ».
// Les règles de calcul reprennent celles des cartes du tableau de bord pour
// que l'assistant annonce exactement les mêmes montants que l'écran.

import { effectiveLineCost } from './quoteInternalDetail';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LISTED = 8;
const MAX_QUOTE_LINES = 40;

const eur = (n) => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const amount = (q) => parseFloat(q.total_ttc) || 0;
const refDate = (q) => new Date(q.date || q.created_at);
const daysBetween = (from, to) => Math.max(0, Math.floor((to - from) / DAY_MS));
const clientName = (q) => q.clients?.name || 'client inconnu';
const docLabel = (q) => {
    const num = q.type === 'invoice' ? q.invoice_number : q.quote_number;
    const title = (q.title || '').trim();
    return [num, title && `« ${title.slice(0, 60)} »`].filter(Boolean).join(' ');
};
const sumPaid = (quotes, from, to) => quotes
    .filter(q => q.status === 'paid')
    .filter(q => { const d = refDate(q); return d >= from && (!to || d < to); })
    .reduce((s, q) => s + amount(q), 0);

/**
 * Même règle que le compteur « À relancer » du tableau de bord : devis envoyé,
 * non archivé, non reporté, sans contact depuis 7 jours.
 */
export const quotesToFollowUp = (allQuotes, now = new Date()) => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    return (allQuotes || []).filter(q => {
        if (q.status !== 'sent' || q.archived_at) return false;
        if (q.relance_snoozed_until && new Date(q.relance_snoozed_until) > now) return false;
        const ref = q.last_followup_at ? new Date(q.last_followup_at) : refDate(q);
        return ref < sevenDaysAgo;
    });
};

/** Faits chiffrés pour le Copilot du tableau de bord. */
export const buildDashboardCopilotFacts = (allQuotes, { now = new Date(), clientCount = 0 } = {}) => {
    const quotes = allQuotes || [];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const facts = [
        `Clients : ${clientCount}`,
        `CA encaissé ce mois-ci (depuis le 1er, TTC) : ${eur(sumPaid(quotes, monthStart))}`,
        `CA encaissé le mois dernier (TTC) : ${eur(sumPaid(quotes, lastMonthStart, monthStart))}`,
        `CA encaissé sur les 30 derniers jours (TTC) : ${eur(sumPaid(quotes, thirtyDaysAgo))}`,
        `CA encaissé depuis le 1er janvier (TTC) : ${eur(sumPaid(quotes, yearStart))}`,
    ];

    const drafts = quotes.filter(q => q.status === 'draft' && (q.type || 'quote') !== 'invoice' && !q.archived_at);
    facts.push(`Devis en brouillon (pas encore envoyés) : ${drafts.length}`);

    const sent = quotes.filter(q => q.status === 'sent' && !q.archived_at);
    facts.push(`Devis envoyés en attente de réponse : ${sent.length} pour ${eur(sent.reduce((s, q) => s + amount(q), 0))}`);

    const toFollow = quotesToFollowUp(quotes, now)
        .sort((a, b) => amount(b) - amount(a));
    if (toFollow.length === 0) {
        facts.push('Devis à relancer (envoyés sans nouvelles depuis plus de 7 jours) : aucun');
    } else {
        facts.push(`Devis à relancer (envoyés sans nouvelles depuis plus de 7 jours) : ${toFollow.length}, du plus gros au plus petit :`);
        toFollow.slice(0, MAX_LISTED).forEach(q => {
            const lastContact = q.last_followup_at ? new Date(q.last_followup_at) : refDate(q);
            const relances = q.follow_up_count > 0 ? `, ${q.follow_up_count} relance(s) déjà faite(s)` : ', jamais relancé';
            facts.push(`   – ${clientName(q)} ${docLabel(q)} : ${eur(amount(q))}, dernier contact il y a ${daysBetween(lastContact, now)} j${relances}`);
        });
        if (toFollow.length > MAX_LISTED) facts.push(`   – … et ${toFollow.length - MAX_LISTED} autre(s)`);
    }

    const unpaid = quotes
        .filter(q => q.type === 'invoice' && q.status === 'billed')
        .sort((a, b) => refDate(a) - refDate(b));
    if (unpaid.length > 0) {
        facts.push(`Factures envoyées non encore payées : ${unpaid.length} pour ${eur(unpaid.reduce((s, q) => s + amount(q), 0))}, de la plus ancienne à la plus récente :`);
        unpaid.slice(0, MAX_LISTED).forEach(q => {
            facts.push(`   – ${clientName(q)} ${docLabel(q)} : ${eur(amount(q))}, émise il y a ${daysBetween(refDate(q), now)} j`);
        });
        if (unpaid.length > MAX_LISTED) facts.push(`   – … et ${unpaid.length - MAX_LISTED} autre(s)`);
    } else {
        facts.push('Factures envoyées non encore payées : aucune');
    }

    return facts;
};

const fmtQty = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** Faits chiffrés pour le Copilot de l'éditeur de devis / facture (lignes comprises). */
export const buildQuoteCopilotFacts = (formData, { subtotal = 0, total = 0 } = {}) => {
    const fd = formData || {};
    const items = fd.items || [];
    const isInvoice = fd.type === 'invoice';
    const facts = [
        isInvoice ? 'Type : Facture' : 'Type : Devis',
        fd.title && `Titre : ${fd.title}`,
        fd.client_name && `Client : ${fd.client_name}`,
        `Statut : ${fd.status || 'brouillon'}`,
        `Total HT : ${eur(subtotal)} (hors lignes optionnelles)`,
        fd.include_tva ? `TVA 20 % incluse — Total TTC : ${eur(total)}` : 'Sans TVA : le total HT est le montant à payer',
        fd.valid_until && `Valable jusqu'au : ${new Date(fd.valid_until).toLocaleDateString('fr-FR')}`,
    ];

    const lines = items.filter(i => i.type !== 'section');
    if (lines.length === 0) {
        facts.push('Aucune ligne saisie pour le moment.');
        return facts.filter(Boolean);
    }

    facts.push(`Détail des ${lines.length} ligne(s) (désignation | quantité | prix unitaire HT | total HT | nature) :`);
    let shown = 0;
    for (const item of items) {
        if (shown >= MAX_QUOTE_LINES) break;
        if (item.type === 'section') {
            if (item.description) facts.push(`   [Section] ${item.description}`);
            continue;
        }
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const nature = item.type === 'material' ? 'matériel' : "main d'œuvre";
        const cost = effectiveLineCost(item);
        const costInfo = cost > 0 ? ` | coût d'achat de la ligne ${eur(cost)}` : '';
        const optional = item.is_optional ? ' | OPTION (hors total)' : '';
        const desc = (item.description || '(sans désignation)').replace(/\s+/g, ' ').trim().slice(0, 100);
        facts.push(`   – ${desc} | ${fmtQty(qty)} ${item.unit || 'u'} | ${eur(price)} | ${eur(qty * price)} | ${nature}${costInfo}${optional}`);
        shown++;
    }
    if (lines.length > shown) facts.push(`   – … et ${lines.length - shown} autre(s) ligne(s) non listée(s)`);

    const firm = lines.filter(i => !i.is_optional);
    const totalCost = firm.reduce((s, i) => s + effectiveLineCost(i), 0);
    const zeroPriced = firm.filter(i => (parseFloat(i.price) || 0) === 0).length;
    if (totalCost > 0) {
        const margin = subtotal - totalCost;
        const rate = subtotal > 0 ? Math.round((margin / subtotal) * 100) : 0;
        facts.push(`Coût d'achat connu : ${eur(totalCost)} — marge avant main d'œuvre ${eur(margin)} (${rate} % du HT)`);
    } else {
        facts.push("Coûts d'achat non renseignés : la marge réelle n'est pas calculable.");
    }
    if (zeroPriced > 0) facts.push(`Attention : ${zeroPriced} ligne(s) à 0 € dans le total.`);

    return facts.filter(Boolean);
};
