import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';

/**
 * État de navigation reçu à l'ouverture du formulaire (client présélectionné,
 * dictée, fichier à importer, fusion de devis, visite chantier, rapport
 * d'intervention) : pré-remplit le devis en conséquence.
 */
export const applyNavigationState = async (state, loadedClients, { setFormData, processImportedFile }) => {
    const { client_id, voiceData, importFile, importMode, mergeIds, siteVisitItems, siteVisitTitle, siteVisitWorkObject, fromReport } = state;

    // Pré-remplissage depuis un rapport d'intervention
    if (fromReport) {
        const now = Date.now();
        setFormData(prev => ({
            ...prev,
            client_id: fromReport.client_id || prev.client_id,
            title: fromReport.title || prev.title,
            type: 'invoice',
            status: 'draft',
            notes: fromReport.notes || prev.notes,
            items: fromReport.items?.length
                ? fromReport.items.map((item, i) => ({ ...item, id: now + i }))
                : prev.items,
        }));
        toast.success('Facture pré-remplie depuis le rapport d\'intervention');
    }

    if (siteVisitItems?.length > 0) {
        const now = Date.now();
        setFormData(prev => ({
            ...prev,
            title: siteVisitTitle || prev.title,
            // Proposition issue de la visite : l'artisan la relit et la
            // corrige dans le formulaire avant l'envoi.
            work_object: prev.work_object || siteVisitWorkObject || '',
            items: siteVisitItems.map((item, i) => ({
                id: now + i,
                // Une option porte sa raison sur le devis : le client
                // voit pourquoi l'artisan la lui propose.
                description: item.is_optional && item.option_reason
                    ? `${item.description || ''} — ${item.option_reason}`
                    : item.description || '',
                ...(item.is_optional ? { is_optional: true } : {}),
                quantity: parseFloat(item.quantity) || 1,
                unit: item.unit || 'u',
                price: parseFloat(item.price) || 0,
                buying_price: parseFloat(item.buying_price) || 0,
                type: item.type || 'service',
            })),
        }));
        toast.success(`${siteVisitItems.length} lignes importées depuis la visite chantier ✓`);
    }

    if (client_id && loadedClients) {
        const foundClient = loadedClients.find(c => c.id.toString() === client_id.toString());
        if (foundClient) {
            setFormData(prev => ({ ...prev, client_id: foundClient.id }));
        }
    }

    if (voiceData) {
        const { clientName, notes } = voiceData;

        if (clientName && loadedClients) {
            // Fuzzy search for client
            const foundClient = loadedClients.find(c =>
                c.name.toLowerCase().includes(clientName.toLowerCase())
            );

            if (foundClient) {
                setFormData(prev => ({
                    ...prev,
                    client_id: foundClient.id,
                    notes: notes ? (prev.notes ? prev.notes + '\n' + notes : notes) : prev.notes
                }));
                toast.success(`Client ${foundClient.name} sélectionné`);
            } else {
                toast.warning(`Client "${clientName}" non trouvé`);
            }
        }

        if (notes && !clientName) {
            setFormData(prev => ({
                ...prev,
                notes: notes ? (prev.notes ? prev.notes + '\n' + notes : notes) : prev.notes
            }));
        }
    }

    if (importFile) {
        processImportedFile(importFile, importMode);
    }

    if (mergeIds?.length >= 2) {
        const { data: quotesToMerge } = await supabase
            .from('quotes')
            .select('id, title, quote_number, client_id, items, include_tva')
            .in('id', mergeIds)
            .order('created_at');

        if (quotesToMerge?.length >= 2) {
            const firstQuote = quotesToMerge[0];
            const now = Date.now();
            const mergedItems = [];

            quotesToMerge.forEach((q, qi) => {
                // Séparateur de section avec le titre du devis d'origine
                mergedItems.push({
                    id: now + qi * 10000,
                    description: q.title || `Devis #${q.quote_number || q.id}`,
                    quantity: 1,
                    unit: 'u',
                    price: 0,
                    buying_price: 0,
                    type: 'section',
                });
                // Items du devis avec de nouveaux IDs pour éviter les conflits
                (q.items || []).forEach((item, ii) => {
                    mergedItems.push({ ...item, id: now + qi * 10000 + ii + 1 });
                });
            });

            setFormData(prev => ({
                ...prev,
                client_id: firstQuote.client_id?.toString() || '',
                include_tva: firstQuote.include_tva ?? true,
                items: mergedItems,
                title: quotesToMerge.map(q => q.title || `Devis #${q.quote_number || q.id}`).join(' + '),
            }));

            toast.success(`${quotesToMerge.length} devis fusionnés — vérifiez et enregistrez`);
        }
    }
};
