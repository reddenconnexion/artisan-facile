import { useState, useEffect } from 'react';
import { quoteDraftKey } from '../../utils/localData';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { depositsNetOfCreditNotes } from '../../utils/creditNote';
import { amendmentsTotalTTC, materialDepositInvoices, materialDepositStatus } from '../../utils/materialDeposit';
import { formatDate } from '../../utils/format';

/**
 * Documents liés au devis racine du chantier : facture d'acompte, acompte
 * matériel (et carte « prochaine étape »), situation de travaux et facture
 * de clôture.
 */
export const useDepositActions = ({
    clients,
    confirm,
    formData,
    id,
    navigate,
    setLoading,
    setShowActionsMenu,
    setShowSituationModal,
    total,
    user,
}) => {
    // « Prochaine étape » de facturation (acompte matériel restant), calculée
    // depuis le devis racine du chantier — affichée sur l'avenant signé et sur
    // le devis quand un avenant a laissé du matériel non couvert.
    const [depositNextStep, setDepositNextStep] = useState(null);

    const handleCreateDeposit = async () => {
        // L'assiette du pourcentage est le CHANTIER, pas le seul devis initial :
        // un avenant signé engage le client sur des travaux supplémentaires, et
        // la facture de clôture les facture déjà. Sans eux dans l'assiette,
        // « 30 % du chantier » n'en couvrait plus 30 % dès qu'un avenant était
        // signé, et l'écart se reportait entièrement sur le solde final.
        // (Règle et statuts retenus dans materialDeposit.js — mêmes que ceux de
        // la clôture. L'action n'étant proposée que sur le document racine, les
        // avenants cherchés ici sont bien les enfants du devis courant.)
        const { data: linkedDocs, error: linkedError } = await supabase
            .from('quotes')
            .select('id, type, status, total_ttc')
            .eq('parent_id', parseInt(id, 10))
            .neq('status', 'cancelled');

        if (linkedError) {
            console.error('Error fetching linked amendments:', linkedError);
            toast.error("Impossible de vérifier les avenants liés à ce devis.");
            return;
        }

        const amendmentsTTC = amendmentsTotalTTC(linkedDocs);
        const projectTotal = total + amendmentsTTC;
        // L'assiette est annoncée : l'artisan doit savoir sur quoi porte le
        // pourcentage qu'il saisit, surtout quand elle dépasse le montant du
        // devis qu'il a sous les yeux.
        const baseLabel = amendmentsTTC !== 0
            ? `Base : ${projectTotal.toFixed(2)} € TTC (devis ${total.toFixed(2)} € + avenants signés ${amendmentsTTC.toFixed(2)} €).`
            : `Base : ${projectTotal.toFixed(2)} € TTC.`;

        const percentageStr = window.prompt(`${baseLabel}\n\nQuel pourcentage d'acompte souhaitez-vous ? (ex: 30)`, "30");
        if (!percentageStr) return;

        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
            toast.error("Pourcentage invalide");
            return;
        }

        try {
            setLoading(true);
            const depositAmount = (projectTotal * percentage) / 100;

            // Ask user if this deposit is for materials (to exclude from Net Result)
            const isForMaterial = await confirm({ title: "Type d'acompte", message: "Cet acompte est-il destiné principalement à l'achat de fournitures ?\n\nOui → comptabilisé comme Matériel (exclu du Résultat Net)\nNon → comptabilisé comme Service (Marge 100%)", confirmLabel: 'Oui (Matériel)', cancelLabel: 'Non (Service)' });

            const depositItem = {
                id: Date.now(),
                // Le client reconnaît son devis à son NUMÉRO, pas à l'identifiant
                // interne de la base.
                description: `Acompte de ${percentage}% sur devis n°${formData.quote_number || id} - ${formData.title}${amendmentsTTC !== 0 ? ' (avenants signés inclus)' : ''} `,
                quantity: 1,
                unit: 'forfait',
                price: depositAmount,
                buying_price: 0,
                type: isForMaterial ? 'material' : 'service'
            };

            if (formData.include_tva) {
                depositItem.price = depositAmount / 1.2;
            } else {
                depositItem.price = depositAmount;
            }

            const depHT = depositItem.price;
            const depTVA = formData.include_tva ? (depositAmount - depHT) : 0;

            const depositData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: `Facture d'Acompte - ${formData.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed',
                type: 'invoice',
                items: [depositItem],
                include_tva: formData.include_tva,
                total_ht: depHT,
                total_tva: depTVA,
                total_ttc: depositAmount,
                parent_id: parseInt(id, 10),
                notes: `Facture d'acompte générée le ${formatDate(new Date())}

RÉCAPITULATIF :
• Montant total du devis : ${total.toFixed(2)} € TTC${amendmentsTTC !== 0 ? `
• Avenants signés : ${amendmentsTTC.toFixed(2)} € TTC
• Total du chantier : ${projectTotal.toFixed(2)} € TTC` : ''}
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur le chantier : ${(projectTotal - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([depositData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture d'acompte créée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating deposit:', error);
            toast.error("Erreur lors de la création de l'acompte");
        } finally {
            setLoading(false);
        }
    };

    // Devis racine du chantier : le document courant s'il n'a pas de parent,
    // sinon son parent (avenant, acompte…). L'acompte matériel se raisonne
    // toujours à l'échelle du chantier, quel que soit l'écran d'où on part.
    const materialDepositRootId = () => (formData.parent_id ? parseInt(formData.parent_id, 10) : parseInt(id, 10));

    // Charge tout ce qu'il faut pour raisonner sur l'acompte matériel : le
    // devis racine, ses documents liés (avenants, acomptes…) et les avoirs
    // rattachés aux acomptes déjà émis.
    const loadMaterialDepositStatus = async (rootId) => {
        const { data: root, error: rootError } = await supabase
            .from('quotes')
            .select('id, quote_number, title, client_id, client_name, include_tva, items, total_ttc, has_material_deposit, status')
            .eq('id', rootId)
            .single();
        if (rootError || !root) throw rootError || new Error('Devis racine introuvable');

        const { data: linkedDocs, error: linkedError } = await supabase
            .from('quotes')
            .select('id, title, type, status, items, quote_number, invoice_number, total_ht, total_ttc')
            .eq('parent_id', rootId)
            .neq('status', 'cancelled');
        if (linkedError) throw linkedError;

        // Les avoirs s'accrochent à la facture qu'ils annulent, pas au devis.
        const previousDeposits = materialDepositInvoices(linkedDocs);
        let creditNotes = [];
        if (previousDeposits.length > 0) {
            const { data: notes, error: notesError } = await supabase
                .from('quotes')
                .select('id, parent_id, total_ht, invoice_number')
                .eq('type', 'credit_note')
                .in('parent_id', previousDeposits.map(inv => inv.id))
                .neq('status', 'cancelled');
            if (notesError) throw notesError;
            creditNotes = notes || [];
        }
        return { root, linkedDocs: linkedDocs || [], status: materialDepositStatus(root, linkedDocs || [], creditNotes) };
    };

    // Acompte matériel : 100 % des fournitures fermes du chantier (devis +
    // avenants signés, options exclues — cf. materialDeposit.js), moins ce qui
    // a déjà été facturé en acompte. Utilisable depuis le devis racine (menu
    // Actions) comme depuis un avenant signé (carte « prochaine étape »).
    const handleCreateMaterialDeposit = async () => {
        let loaded;
        try {
            loaded = await loadMaterialDepositStatus(materialDepositRootId());
        } catch (error) {
            console.error('Error loading material deposit status:', error);
            toast.error("Impossible de vérifier les acomptes de ce chantier.");
            return;
        }
        const { root, linkedDocs, status } = loaded;
        const { materialTotalHT, alreadyIssuedHT, remainingHT, previous, amendmentShare, isComplement } = status;
        const previousLabels = previous.map(d => d.invoice_number || `n°${d.id}`);
        const { totalHT: amendmentTotalHT, labels: amendmentLabels } = amendmentShare;
        const rootRef = root.quote_number || root.id;

        if (materialTotalHT <= 0) {
            toast.error("Aucune fourniture à facturer sur ce chantier.");
            return;
        }
        if (remainingHT <= 0.005) {
            toast.info(`Le matériel est déjà entièrement couvert par ${previousLabels.join(', ')}. Le solde sera facturé à la clôture.`);
            return;
        }

        const toTTC = (ht) => (root.include_tva ? ht * 1.2 : ht);
        const materialTotalTTC = toTTC(materialTotalHT);
        const depositAmount = toTTC(remainingHT);
        const rootTotalTTC = parseFloat(root.total_ttc) || 0;

        // Une seule question, en clair : combien, pour quoi, et ce qui n'est
        // pas refacturé. Le détail chiffré complet reste dans les notes de la
        // facture créée.
        const what = amendmentTotalHT > 0
            ? `les fournitures ${amendmentLabels.length > 1 ? 'des' : "de l'"}${amendmentLabels.join(', ')}`
            : `100 % des fournitures du devis n°${rootRef}`;
        const notAgain = isComplement
            ? `\n\nLe matériel déjà réglé (${toTTC(alreadyIssuedHT).toFixed(2)} € TTC, ${previousLabels.join(', ')}) n'est pas refacturé.`
            : '';
        const okMat = await confirm({
            title: isComplement ? 'Acompte matériel complémentaire' : 'Acompte matériel',
            message: `Facturer au client un acompte matériel de ${depositAmount.toFixed(2)} € TTC pour ${what} ?${notAgain}`,
            confirmLabel: 'Créer la facture'
        });
        if (!okMat) return;

        try {
            setLoading(true);

            const depositItem = {
                id: Date.now(),
                // Le client reconnaît son devis à son NUMÉRO, pas à
                // l'identifiant interne de la base.
                description: `Acompte Matériel ${isComplement ? 'complémentaire' : '(100%)'} sur devis n°${rootRef} - ${root.title}${amendmentTotalHT > 0 ? ` (avenants inclus : ${amendmentLabels.join(', ')})` : ''}`,
                quantity: 1,
                unit: 'forfait',
                price: root.include_tva ? depositAmount / 1.2 : depositAmount,
                buying_price: 0,
                type: 'material'
            };
            const depositHT = depositItem.price;
            const depositTVA = root.include_tva ? (depositAmount - depositHT) : 0;

            const depositData = {
                user_id: user.id,
                client_id: root.client_id,
                client_name: clients.find(c => c.id.toString() === String(root.client_id))?.name || root.client_name || 'Client',
                title: `Facture Acompte Matériel${isComplement ? ' complémentaire' : ''} - ${root.title}`,
                date: new Date().toISOString().split('T')[0],
                status: 'billed',
                type: 'invoice',
                items: [depositItem],
                parent_id: root.id,
                include_tva: root.include_tva,
                total_ht: depositHT,
                total_tva: depositTVA,
                total_ttc: depositAmount,
                notes: `Facture d'acompte matériel générée le ${formatDate(new Date())}

RÉCAPITULATIF :
• Montant total du devis : ${rootTotalTTC.toFixed(2)} € TTC${amendmentTotalHT > 0 ? `
• Fournitures d'avenants signés incluses : ${amendmentTotalHT.toFixed(2)} € HT (${amendmentLabels.join(', ')})` : ''}
• Matériel total : ${materialTotalTTC.toFixed(2)} € TTC${isComplement ? `
• Acompte matériel déjà facturé : ${toTTC(alreadyIssuedHT).toFixed(2)} € TTC (${previousLabels.join(', ')})` : ''}
• Montant de cet acompte : ${depositAmount.toFixed(2)} € TTC
• Reste à payer sur devis : ${(rootTotalTTC + amendmentsTotalTTC(linkedDocs) - toTTC(alreadyIssuedHT) - depositAmount).toFixed(2)} € TTC

Conditions de règlement : Paiement à réception de facture.`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([depositData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture d'acompte matériel créée !");
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating material deposit:', error);
            toast.error("Erreur lors de la création de l'acompte matériel");
        } finally {
            setLoading(false);
        }
    };

    // « Prochaine étape » : après la signature d'un avenant, dire à l'artisan
    // ce qu'il reste à facturer et le lui proposer en un clic, ici même — sans
    // avoir à retrouver le devis parent ni son menu Actions. Sur le devis
    // racine, la carte n'apparaît que si un avenant signé a laissé du matériel
    // non couvert : le premier acompte reste dans le menu, et on ne relance
    // pas l'artisan quand tout est réglé.
    useEffect(() => {
        let cancelled = false;
        setDepositNextStep(null);
        if (!id || id === 'new') return undefined;
        const signed = ['accepted', 'billed', 'paid'].includes(formData.status);
        const onSignedAmendment = formData.type === 'amendment' && signed && !!formData.parent_id;
        const onRootQuote = formData.type === 'quote' && !formData.parent_id && ['accepted', 'billed'].includes(formData.status);
        if (!onSignedAmendment && !onRootQuote) return undefined;
        (async () => {
            try {
                const { root, status } = await loadMaterialDepositStatus(materialDepositRootId());
                if (cancelled || root.has_material_deposit !== true) return;
                if (onRootQuote && !(status.isComplement && status.remainingHT > 0.005)) return;
                setDepositNextStep({ root, variant: onSignedAmendment ? 'amendment' : 'root', ...status });
            } catch (error) {
                console.error('Error computing deposit next step:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [id, formData.type, formData.status, formData.parent_id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCreateSituation = () => {
        setShowSituationModal(true);
        setShowActionsMenu(false);
    };

    const handleSaveSituation = async (title, situationItems) => {
        try {
            setLoading(true);

            // Calculate totals from items
            let total_ht = 0;
            situationItems.forEach(i => total_ht += i.price);

            // Re-calc TVA based on quote settings (or item specific if complex, but assuming global tva boolean for now)
            // Ideally we check each item type/vat rate if we had that detail.
            // For now, simple standard logic as per original code
            let total_tva = formData.include_tva ? total_ht * 0.20 : 0;
            let total_ttc = total_ht + total_tva;

            // Contexte d'avancement mémorisé sur la facture (amendment_details.situation) :
            // le PDF (app, lien public, portail) peut ainsi afficher le récapitulatif
            // "total du devis / déjà facturé / reste" sans recharger le devis parent.
            const parentId = parseInt(id, 10);
            const { data: siblingInvoices } = await supabase
                .from('quotes')
                .select('id, total_ttc, title, amendment_details')
                .eq('parent_id', parentId)
                .eq('type', 'invoice')
                .neq('status', 'cancelled');
            const previouslyBilled = (siblingInvoices || []).reduce((sum, inv) => sum + (inv.total_ttc || 0), 0);
            // Les situations antérieures à cette fonctionnalité n'ont pas de
            // contexte mémorisé : on les reconnaît via leur titre.
            const situationIndex = (siblingInvoices || []).filter(inv =>
                inv.amendment_details?.situation || /situation/i.test(inv.title || '')
            ).length + 1;
            const parentRef = formData.quote_number || parentId;

            const situationData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clients.find(c => c.id.toString() === formData.client_id.toString())?.name || 'Client',
                title: title,
                date: new Date().toISOString().split('T')[0],
                status: 'draft', // Draft to allow verification
                type: 'invoice',
                items: situationItems,
                include_tva: formData.include_tva,
                total_ht: total_ht,
                total_tva: total_tva,
                total_ttc: total_ttc,
                parent_id: parentId,
                amendment_details: {
                    situation: {
                        parent_quote_id: parentId,
                        parent_quote_number: parentRef,
                        parent_date: formData.date,
                        parent_title: formData.title || '',
                        parent_total_ttc: total,
                        previously_billed_ttc: previouslyBilled,
                        remaining_ttc: Math.max(total - previouslyBilled - total_ttc, 0),
                        index: situationIndex,
                    }
                },
                notes: `Facture de situation n°${situationIndex} du ${formatDate(new Date())}, établie selon l'avancement des travaux du devis n°${parentRef} « ${formData.title || 'Travaux'} ».`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([situationData])
                .select()
                .single();

            if (error) throw error;

            toast.success("Facture de situation créée !");
            navigate(`/app/devis/${data.id}`);
            setShowSituationModal(false);

        } catch (error) {
            console.error('Error creating situation:', error);
            toast.error("Erreur lors de la création de la situation");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateClosingInvoice = async () => {
        // Safety check: closing invoice must be generated from the original quote/invoice,
        // not from a child document (deposit, situation, etc.) which would result in
        // the deposit deductions not being found.
        if (formData.parent_id) {
            toast.error("La facture de clôture doit être générée depuis le devis original, pas depuis une facture enfant.");
            return;
        }

        const okClose = await confirm({ title: 'Facture de clôture', message: "Cela créera une nouvelle facture reprenant l'ensemble du devis moins les acomptes déjà versés.", confirmLabel: 'Générer' });
        if (!okClose) return;

        setLoading(true);
        try {
            // 1. Fetch existing deposits/situations linked to this quote
            // Use parseInt to ensure parent_id comparison uses the correct numeric type
            const quoteId = parseInt(id, 10);

            const { data: linkedInvoices, error: fetchError } = await supabase
                .from('quotes')
                .select('id, title, date, total_ht, total_ttc, type, status, items, quote_number')
                .eq('parent_id', quoteId)
                .neq('status', 'cancelled');

            if (fetchError) throw fetchError;

            // Garde-fou anti-doublon : une facture de clôture existe déjà sur ce
            // devis. En générer une seconde refacturerait tout le chantier (devis
            // + avenants) et ferait payer deux fois le client. Pour un avenant
            // signé APRÈS la clôture, la bonne action est une facture
            // complémentaire (bouton « Facturer l'avenant » sur le tableau de
            // bord), pas une nouvelle clôture.
            const existingClosing = (linkedInvoices || []).find(inv =>
                inv.type === 'invoice' && /cl[oô]ture/i.test(inv.title || '')
            );
            if (existingClosing) {
                toast.error("Une facture de clôture existe déjà pour ce devis. Pour facturer un avenant signé depuis, créez une facture complémentaire depuis le tableau de bord — ne générez pas une seconde clôture.");
                return;
            }

            // Filter: keep only invoices (not amendments), exclude previous closing invoices
            const deposits = (linkedInvoices || []).filter(inv =>
                inv.type === 'invoice' &&
                !inv.title?.toLowerCase().includes('clôture')
            );

            // Signed amendments must be included in the closing invoice — their
            // extra work was agreed by the client but isn't yet billed.
            const signedAmendmentStatuses = ['accepted', 'billed', 'paid'];
            const amendments = (linkedInvoices || []).filter(inv =>
                inv.type === 'amendment' &&
                signedAmendmentStatuses.includes(inv.status)
            );

            // Un avenant peut être marqué « Payé » sans qu'aucune facture
            // d'acompte ne soit passée par l'app (règlement du matériel
            // encaissé directement par l'artisan à la commande). Ses lignes
            // sont intégrées en totalité (amendmentItems, plus bas) : sans
            // déduction dédiée, la clôture les refacturait une seconde fois au
            // client, alors qu'il les avait déjà réglées.
            const paidAmendments = amendments.filter(amd => amd.status === 'paid');

            // Les avoirs s'accrochent à la FACTURE qu'ils annulent, pas au devis :
            // ils ne figurent donc pas parmi les enfants récupérés ci-dessus et
            // demandent leur propre requête. Sans eux, un acompte annulé restait
            // déduit de la clôture.
            let creditNotes = [];
            if (deposits.length > 0) {
                const { data: notes, error: notesError } = await supabase
                    .from('quotes')
                    .select('id, parent_id, total_ht, invoice_number')
                    .eq('type', 'credit_note')
                    .in('parent_id', deposits.map(inv => inv.id))
                    .neq('status', 'cancelled');

                if (notesError) throw notesError;
                creditNotes = notes || [];
            }

            const netDeposits = depositsNetOfCreditNotes(deposits, creditNotes);

            if (netDeposits.length === 0 && paidAmendments.length === 0) {
                toast.info("Aucun acompte à déduire. La facture de clôture reprendra le devis intégralement.");
            }

            // 2. Prepare items: Copy original items
            // Les lignes optionnelles sont écartées : une option retenue par le
            // client a perdu son flag à la signature, celles qui le portent
            // encore n'ont pas été retenues (elles restent au devis comme trace
            // de l'offre) et ne sont donc pas dues.
            let finalItems = formData.items
                .filter(item => !item.is_optional)
                .map(item => ({
                    ...item,
                    id: Date.now() + Math.random(),
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    buying_price: parseFloat(item.buying_price) || 0
                }));

            // 2b. Append items from signed amendments (extra work agreed after the initial quote)
            const amendmentItems = amendments.flatMap(amd => {
                const label = amd.quote_number ? `Avenant n°${amd.quote_number}` : (amd.title || 'Avenant');
                const items = (Array.isArray(amd.items) ? amd.items : []).filter(i => !i.is_optional);
                return items.map(item => ({
                    ...item,
                    id: Date.now() + Math.random(),
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    buying_price: parseFloat(item.buying_price) || 0,
                    description: `[${label}] ${item.description || ''}`.trim()
                }));
            });
            finalItems = [...finalItems, ...amendmentItems];

            // 3. Add deduction lines for each deposit/advance already paid
            let totalDeducted = 0;
            const deductionItems = netDeposits.map(inv => {
                // netHT : le montant encore dû sur cet acompte, avoirs déduits
                // (cf. depositsNetOfCreditNotes). Le récap reflète le montant
                // RÉELLEMENT déduit, toujours en valeur absolue — la ligne de
                // déduction est -Math.abs(...). Sans ce Math.abs, un acompte
                // négatif (avenant moins-value converti en facture) faussait le
                // total récapitulatif de la note.
                const amountHT = inv.netHT;
                totalDeducted += Math.abs(amountHT);
                // Inherit the type from the deposit's items so the deduction offsets
                // the right category (material vs service) in accounting and net income.
                const depositItems = Array.isArray(inv.items) ? inv.items : [];
                const materialSum = depositItems.filter(i => i.type === 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const serviceSum = depositItems.filter(i => i.type !== 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const deductionType = materialSum >= serviceSum ? 'material' : 'service';
                return {
                    id: Date.now() + Math.random(),
                    description: `Déduction ${inv.title || 'Acompte'} du ${inv.date ? formatDate(inv.date) : 'Date inconnue'}`,
                    quantity: 1,
                    unit: 'forfait',
                    price: -Math.abs(amountHT),
                    buying_price: 0,
                    type: deductionType,
                    is_settlement_deduction: true
                };
            });

            const amendmentDeductionItems = paidAmendments.map(amd => {
                const amountHT = parseFloat(amd.total_ht) || 0;
                totalDeducted += Math.abs(amountHT);
                const amdItems = Array.isArray(amd.items) ? amd.items : [];
                const materialSum = amdItems.filter(i => i.type === 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const serviceSum = amdItems.filter(i => i.type !== 'material').reduce((sum, i) => sum + Math.abs((parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0)), 0);
                const deductionType = materialSum >= serviceSum ? 'material' : 'service';
                const label = amd.quote_number ? `Avenant n°${amd.quote_number}` : (amd.title || 'Avenant');
                return {
                    id: Date.now() + Math.random(),
                    description: `Déduction ${label} déjà payé`,
                    quantity: 1,
                    unit: 'forfait',
                    price: -Math.abs(amountHT),
                    buying_price: 0,
                    type: deductionType,
                    is_settlement_deduction: true
                };
            });

            finalItems = [...finalItems, ...deductionItems, ...amendmentDeductionItems];

            // 4. Calculate totals
            const subtotal = finalItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            const tva = formData.include_tva ? subtotal * 0.20 : 0;
            const total = subtotal + tva;

            // Create Invoice Data
            const clientName = (clients && clients.length > 0)
                ? (clients.find(c => c.id.toString() === formData.client_id?.toString())?.name || 'Client')
                : 'Client';

            const creditedCount = deposits.length - netDeposits.length;
            const totalDeductionCount = netDeposits.length + paidAmendments.length;
            const deductionSummary = totalDeductionCount > 0
                ? `\n\nDéductions appliquées (${netDeposits.length} acompte${netDeposits.length > 1 ? 's' : ''}${paidAmendments.length > 0 ? ` + ${paidAmendments.length} avenant${paidAmendments.length > 1 ? 's' : ''} déjà payé${paidAmendments.length > 1 ? 's' : ''}` : ''}) : -${totalDeducted.toFixed(2)} € HT`
                  + (creditedCount > 0 ? `\n${creditedCount} acompte${creditedCount > 1 ? 's' : ''} annulé${creditedCount > 1 ? 's' : ''} par avoir, non déduit${creditedCount > 1 ? 's' : ''}.` : '')
                : '';
            const amendmentSummary = amendments.length > 0
                ? `\n${amendments.length} avenant${amendments.length > 1 ? 's' : ''} signé${amendments.length > 1 ? 's' : ''} intégré${amendments.length > 1 ? 's' : ''} : ${amendments.map(a => a.quote_number ? `n°${a.quote_number}` : (a.title || 'sans titre')).join(', ')}`
                : '';

            const invoiceData = {
                user_id: user.id,
                client_id: formData.client_id,
                client_name: clientName,
                title: `Facture de Clôture - ${formData.title || 'Projet'}`,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                type: 'invoice',
                items: finalItems,
                include_tva: formData.include_tva,
                total_ht: subtotal,
                total_tva: tva,
                total_ttc: total,
                parent_id: quoteId,
                notes: (formData.notes || '') + `\n\nFacture de clôture générée le ${formatDate(new Date())}${amendmentSummary}${deductionSummary}`
            };

            const { data, error } = await supabase
                .from('quotes')
                .insert([invoiceData])
                .select()
                .single();

            if (error) throw error;

            // Proactively clear any stale draft that might exist for the new invoice's key
            // (e.g. from a previous navigation side-effect). This ensures the closing invoice
            // always loads its items — including the deduction lines — from the DB on first visit.
            if (user) {
                localStorage.removeItem(quoteDraftKey(user.id, data.id));
            }

            const successParts = [];
            if (amendments.length > 0) successParts.push(`${amendments.length} avenant${amendments.length > 1 ? 's' : ''}`);
            if (totalDeductionCount > 0) successParts.push(`${totalDeductionCount} déduction${totalDeductionCount > 1 ? 's' : ''}`);
            const successMsg = successParts.length > 0
                ? `Facture de clôture générée (${successParts.join(' + ')}) !`
                : "Facture de clôture générée !";
            toast.success(successMsg);
            navigate(`/app/devis/${data.id}`);
            setShowActionsMenu(false);

        } catch (error) {
            console.error('Error creating closing invoice:', error);
            toast.error("Erreur génération facture : " + (error.message || error.details || "Erreur inconnue"));
        } finally {
            setLoading(false);
        }
    };

    return {
        depositNextStep,
        handleCreateDeposit,
        handleCreateMaterialDeposit,
        handleCreateSituation,
        handleSaveSituation,
        handleCreateClosingInvoice,
    };
};
