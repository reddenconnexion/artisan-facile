import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { clientGreetingName } from '../../utils/clientGreeting';
import { generateInterventionReportPDF } from '../../utils/pdfGenerator';
import { formatDate } from '../../utils/format';

/**
 * Facturation depuis le rapport : facture liée, clôture (facture générée +
 * PDF du rapport), renvoi par email et création d'une facture pré-remplie.
 *
 * `handleSave(statusOverride)` enregistre le rapport et renvoie son id
 * (ou false en cas d'échec).
 */
export const useReportInvoice = ({
    user, isEditing,
    formData, setFormData,
    clients, allQuotes, userProfile,
    navigate, handleSave,
}) => {
    const [sendInvoiceModal, setSendInvoiceModal] = useState(null);
    const [linkedInvoice, setLinkedInvoice] = useState(null);

    // Charger la facture liée quand le rapport est terminé/signé
    useEffect(() => {
        if (!isEditing || !user) return;
        const status = formData.status;
        if (status !== 'completed' && status !== 'signed') return;

        const fetchLinkedInvoice = async () => {
            const base = supabase
                .from('quotes')
                .select('id, title, public_token, report_pdf_url, client_id, client_name')
                .eq('type', 'invoice');

            // 1. Lien direct via invoice_id (le plus fiable)
            if (formData.invoice_id) {
                const { data } = await base.eq('id', formData.invoice_id).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }

            // 2. Par parent_id (devis lié)
            if (formData.quote_id) {
                const { data } = await base.eq('parent_id', formData.quote_id).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }

            // 3. Par report_pdf_url
            if (formData.report_pdf_url) {
                const { data } = await base.eq('report_pdf_url', formData.report_pdf_url).maybeSingle();
                if (data) { setLinkedInvoice(data); return; }
            }
        };

        fetchLinkedInvoice();
    }, [isEditing, formData.status, formData.quote_id, formData.invoice_id, formData.report_pdf_url, user]);

    const handleResendInvoice = async () => {
        if (!linkedInvoice) return;
        const clientId = formData.client_id || linkedInvoice.client_id;
        let client = clients.find(c => String(c.id) === String(clientId));
        if (!client && clientId) {
            const { data } = await supabase.from('clients').select('*').eq('id', clientId).single();
            client = data;
        }
        if (!client?.email) {
            toast.error(`Le client n'a pas d'email enregistré`);
            return;
        }

        // Générer et uploader le PDF du rapport s'il n'existe pas encore
        let reportUrl = linkedInvoice.report_pdf_url || formData.report_pdf_url;
        if (!reportUrl) {
            const toastId = 'uploading-report-pdf';
            toast.loading('Génération du rapport PDF…', { id: toastId });
            try {
                const reportBlob = await generateInterventionReportPDF(formData, userProfile, true);
                const reportPath = `interventions/${user.id}/rapport-${formData.report_number || 'INT'}-${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('quote_files')
                    .upload(reportPath, reportBlob, { contentType: 'application/pdf' });
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('quote_files').getPublicUrl(reportPath);
                reportUrl = publicUrl;
                // Persister le lien PDF sur le rapport et la facture
                await supabase.from('intervention_reports').update({ report_pdf_url: reportUrl }).eq('id', formData.id);
                await supabase.from('quotes').update({ report_pdf_url: reportUrl }).eq('id', linkedInvoice.id);
                setFormData(prev => ({ ...prev, report_pdf_url: reportUrl }));
                setLinkedInvoice(prev => ({ ...prev, report_pdf_url: reportUrl }));
                toast.dismiss(toastId);
            } catch (err) {
                toast.dismiss(toastId);
                console.error('Upload rapport PDF échoué :', err);
                toast.warning(`PDF non uploadé : ${err?.message || 'erreur inconnue'}`, { duration: 5000 });
            }
        }

        const invoiceUrl = `${window.location.origin}/q/${linkedInvoice.public_token}`;
        const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';
        const signatureBlock = [companyName, userProfile?.phone || '', userProfile?.professional_email || userProfile?.email || ''].filter(Boolean).join('\n');
        const subject = `Facture : ${linkedInvoice.title || formData.title} - ${companyName}`;
        const body =
            `Bonjour ${clientGreetingName(client.name)},\n\n` +
            `Le rapport d'intervention "${formData.title}" est terminé.\n\n` +
            `Vous trouverez ci-dessous le lien pour consulter et télécharger les documents :\n\n` +
            `Facture :\n${invoiceUrl}\n\n` +
            (reportUrl ? `Le rapport d'intervention est également disponible depuis ce lien.\n\n` : '') +
            `Cordialement,\n\n-- \n${signatureBlock}`;
        setSendInvoiceModal({
            email: client.email,
            subject,
            body,
            invoice_id: linkedInvoice.id,
            client_id: client.id,
        });
    };

    const handleMarkCompleted = async () => {
        const savedId = await handleSave('completed');
        if (!savedId) return;

        const toastId = 'completing-invoice';
        toast.loading('Génération de la facture de clôture…', { id: toastId });

        try {
            // --- Résoudre le devis lié ---
            const linkedQuote = formData.quote_id
                ? allQuotes.find(q => q.id.toString() === formData.quote_id.toString())
                    ?? (await supabase.from('quotes').select('*').eq('id', formData.quote_id).single()).data
                : null;

            // --- Résoudre le client (cache → fallback DB) ---
            const clientId = formData.client_id || linkedQuote?.client_id;
            if (!clientId) {
                toast.dismiss(toastId);
                toast.error('Aucun client associé au rapport — facture non générée');
                return;
            }
            let client = clients.find(c => c.id.toString() === clientId.toString());
            if (!client) {
                const { data: dbClient } = await supabase
                    .from('clients').select('*').eq('id', clientId).single();
                client = dbClient;
            }
            const hasEmail = !!client?.email;
            if (!hasEmail) {
                toast.warning(`Facture créée — ${client?.name || 'ce client'} n'a pas d'email, vous devrez l'envoyer manuellement`);
            }

            // --- 1. Base : items du devis signé lié ---
            const baseItems = linkedQuote?.items
                ? linkedQuote.items.map(i => ({
                    description: i.description,
                    quantity: parseFloat(i.quantity) || 1,
                    unit: i.unit || 'unité',
                    price: parseFloat(i.price) || 0,
                    buying_price: parseFloat(i.buying_price) || 0,
                    type: i.type || 'service',
                }))
                : [];

            // --- 2. Matériaux supplémentaires du rapport ---
            const reportMaterials = (formData.materials_used || [])
                .filter(m => m.description?.trim())
                .map(m => ({
                    description: `[Matériel rapport] ${m.description}`,
                    quantity: parseFloat(m.quantity) || 1,
                    unit: m.unit || 'unité',
                    price: parseFloat(m.price) || 0,
                    buying_price: 0,
                    type: 'material',
                }));

            // --- 3. Main d'œuvre supplémentaire (heures rapport) ---
            // Ajoutée uniquement si aucun devis signé n'est lié (pour éviter le doublon avec les items du devis)
            const hours = parseFloat(formData.duration_hours);
            const hourlyRate = parseFloat(userProfile?.ai_hourly_rate);
            const laborItems = (!linkedQuote && hours > 0 && hourlyRate > 0)
                ? [{
                    description: `Main d'œuvre — ${formData.title || 'Intervention'} (${hours}h)`,
                    quantity: hours,
                    unit: 'h',
                    price: hourlyRate,
                    buying_price: 0,
                    type: 'service',
                }]
                : [];

            const items = [...baseItems, ...reportMaterials, ...laborItems];
            if (items.length === 0) {
                items.push({ description: formData.title || 'Intervention', quantity: 1, unit: 'forfait', price: 0, buying_price: 0, type: 'service' });
            }

            // Les micro-entrepreneurs (auto-entrepreneurs) sont en franchise de TVA
            const isAutoEntrepreneur = userProfile?.artisan_status === 'micro_entreprise';
            const includeTva = !isAutoEntrepreneur && (linkedQuote?.include_tva !== false);
            const totalHT = items.reduce((s, i) => s + i.quantity * i.price, 0);
            const totalTVA = includeTva ? totalHT * 0.2 : 0;
            const totalTTC = totalHT + totalTVA;

            // --- 4. Créer la facture dans Supabase ---
            const invoiceToken = crypto.randomUUID();

            // --- 5. Uploader le rapport PDF avant de créer la facture ---
            const reportBlob = await generateInterventionReportPDF(formData, userProfile, true);
            const reportPath = `interventions/${user.id}/rapport-${formData.report_number || 'INT'}-${Date.now()}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(reportPath, reportBlob, { contentType: 'application/pdf' });

            if (uploadError) {
                console.error('Upload rapport PDF échoué :', uploadError);
                toast.warning(`PDF non uploadé : ${uploadError.message}`, { duration: 5000 });
            }

            let reportUrl = null;
            if (!uploadError) {
                const { data: { publicUrl: rUrl } } = supabase.storage
                    .from('quote_files')
                    .getPublicUrl(reportPath);
                reportUrl = rUrl;
            }

            // Stocker le lien PDF sur le rapport lui-même (pour retrouver le lien depuis n'importe quelle facture liée)
            if (reportUrl) {
                await supabase
                    .from('intervention_reports')
                    .update({ report_pdf_url: reportUrl })
                    .eq('id', savedId);
            }

            // Si un devis/facture est lié au rapport, on lui affecte aussi le lien du PDF
            if (reportUrl && formData.quote_id) {
                await supabase
                    .from('quotes')
                    .update({ report_pdf_url: reportUrl })
                    .eq('id', formData.quote_id);
            }

            const invoicePayload = {
                user_id: user.id,
                client_id: clientId ? Number(clientId) : null,
                client_name: client?.name || formData.client_name || null,
                title: linkedQuote?.title || formData.title || 'Facture de clôture',
                date: new Date().toISOString().split('T')[0],
                type: 'invoice',
                status: 'sent',
                items,
                total_ht: totalHT,
                total_tva: totalTVA,
                total_ttc: totalTTC,
                include_tva: includeTva,
                public_token: invoiceToken,
                notes: `Facture de clôture — rapport d'intervention du ${formData.date || formatDate(new Date())}`,
                report_pdf_url: reportUrl,
                // Lier la facture au devis d'origine pour que le dashboard retire ce devis des "À traiter"
                parent_id: linkedQuote?.id || null,
            };

            const { data: newInvoice, error: invoiceError } = await supabase
                .from('quotes')
                .insert([invoicePayload])
                .select()
                .single();

            if (invoiceError) throw invoiceError;

            // Passer le devis lié en "Facturé" pour refléter l'avancement dans le pipeline
            if (linkedQuote?.id) {
                await supabase
                    .from('quotes')
                    .update({ status: 'billed' })
                    .eq('id', linkedQuote.id);
            }

            toast.dismiss(toastId);
            toast.success('Facture de clôture créée');

            // Stocker invoice_id sur le rapport pour retrouver la facture facilement
            await supabase
                .from('intervention_reports')
                .update({ invoice_id: newInvoice.id })
                .eq('id', savedId);

            // Mettre à jour le state local pour que le bouton "Envoyer la facture" apparaisse
            setLinkedInvoice(newInvoice);
            setFormData(prev => ({ ...prev, status: 'completed', invoice_id: newInvoice.id }));

            // --- 6. Préparer le modal email ---
            const invoiceUrl = `${window.location.origin}/q/${invoiceToken}`;
            const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';
            const subject = `Facture N°${newInvoice.quote_number || newInvoice.id} : ${newInvoice.title} - ${companyName}`;
            const signatureBlock = [
                companyName,
                userProfile?.phone || '',
                userProfile?.professional_email || userProfile?.email || '',
            ].filter(Boolean).join('\n');

            const body =
                `Bonjour ${clientGreetingName(client.name)},\n\n` +
                `Le rapport d'intervention "${formData.title}" est terminé.\n\n` +
                `Vous trouverez ci-dessous le lien pour consulter et télécharger les documents :\n\n` +
                `Facture de clôture :\n${invoiceUrl}\n\n` +
                (reportUrl ? `Le rapport d'intervention est également disponible depuis ce lien.\n\n` : '') +
                `Cordialement,\n\n-- \n${signatureBlock}`;

            if (hasEmail) {
                setSendInvoiceModal({
                    email: client.email,
                    subject,
                    body,
                    invoice_id: newInvoice.id,
                    client_id: client.id,
                });
            }

        } catch (err) {
            toast.dismiss(toastId);
            console.error('handleMarkCompleted error:', err);
            toast.error(`Erreur : ${err?.message || err?.code || 'inconnue'}`, { duration: 8000 });
        }
    };

    const handleCreateInvoiceFromReport = () => {
        const now = Date.now();
        const materials = (formData.materials_used || [])
            .filter(m => m.description?.trim())
            .map((m, i) => ({
                id: now + i + 100,
                description: m.description,
                quantity: parseFloat(m.quantity) || 1,
                unit: m.unit || 'unité',
                price: parseFloat(m.price) || 0,
                buying_price: 0,
                type: 'material',
            }));

        const hours = parseFloat(formData.duration_hours);
        const hourlyRate = parseFloat(userProfile?.ai_hourly_rate) || 0;
        const laborItems = (hours > 0 && hourlyRate > 0)
            ? [{
                id: now,
                description: `Main d'œuvre — ${formData.title || 'Intervention'} (${hours}h)`,
                quantity: hours,
                unit: 'h',
                price: hourlyRate,
                buying_price: 0,
                type: 'service',
            }]
            : [{
                id: now,
                description: formData.work_done || formData.description || formData.title || 'Intervention',
                quantity: 1,
                unit: 'forfait',
                price: 0,
                buying_price: 0,
                type: 'service',
            }];

        const items = [...laborItems, ...materials];
        const notes = [
            `Rapport d'intervention ${formData.report_number || ''} du ${formData.date || ''}`,
            formData.work_done || formData.description || '',
        ].filter(Boolean).join('\n\n').trim();

        navigate('/app/devis/new', {
            state: {
                fromReport: {
                    client_id: formData.client_id,
                    title: formData.title,
                    items,
                    notes,
                },
            },
        });
    };

    return {
        linkedInvoice, sendInvoiceModal, setSendInvoiceModal,
        handleResendInvoice, handleMarkCompleted, handleCreateInvoiceFromReport,
    };
};
