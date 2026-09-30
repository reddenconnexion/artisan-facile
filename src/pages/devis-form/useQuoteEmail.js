import { useState } from 'react';
import { toast } from 'sonner';
import { publicLinkExpiry } from '../../constants/publicLink';
import { supabase } from '../../utils/supabase';
import { translateQuoteContent } from '../../utils/aiService';
import { clientGreetingName } from '../../utils/clientGreeting';
import { isOffline } from '../../utils/offlineSave';
import { blobToBase64 } from '../../utils/mediaConverters';
import { formatDate } from '../../utils/format';
import { buildQuoteEmailHtml } from './quoteEmailHtml';

/**
 * Envoi du document au client : préparation du mail (fr / en, lien de
 * signature, espace client, rapport), envoi SMTP ou mailto, archivage de la
 * version transmise, et mail de retrait d'une offre.
 */
export const useQuoteEmail = ({
    captureEmail,
    clients,
    fetchLinkSuspended,
    formData,
    generateClientPDF,
    handleSubmit,
    id,
    isAmendmentDoc,
    isCreditNote,
    isEditing,
    isPushSubscribed,
    isPushSupported,
    isTestMode,
    pendingSendRef,
    persistDraftNow,
    quoteVersions,
    setFormData,
    setInitialStatus,
    setQuoteVersions,
    setRevisionUnlocked,
    subscribePush,
    subtotal,
    suspensionBlockMessage,
    total,
    tva,
    user,
    userProfile,
}) => {
    const [emailPreview, setEmailPreview] = useState(null);
    const [showSendSuccess, setShowSendSuccess] = useState(false);

    // ── Prévenir le client du retrait ────────────────────────────────────────
    //
    // Suspendre le lien et changer le statut sont des mesures internes : le
    // client, lui, ne voit rien tant qu'il ne rouvre pas le lien. Or un devis
    // est une offre — la retirer suppose que le client en soit informé avant
    // qu'il l'accepte, et rien n'empêche qu'il ait déjà imprimé le PDF pour le
    // signer à la main. Ce mail est donc la seule action qui compte vraiment,
    // et il laisse une trace datée dans l'historique du client.
    const handleNotifyWithdrawal = () => {
        if (!isEditing) {
            toast.error("Enregistrez d'abord le document");
            return;
        }
        const selectedClient = clients.find(c => c.id?.toString() === formData.client_id?.toString());
        if (!selectedClient) {
            toast.error("Sélectionnez d'abord un client");
            return;
        }

        const docLabel = formData.type === 'amendment' ? "l'avenant" : 'le devis';
        const docNo = formData.quote_number || id;
        const projectTitle = formData.title || 'vos travaux';
        const greetingName = clientGreetingName(selectedClient.name, 'fr');
        const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre artisan';

        const signatureBlock = [
            companyName,
            userProfile?.full_name || '',
            userProfile?.phone || '',
            userProfile?.professional_email || userProfile?.email || '',
        ].filter(Boolean).join('\n');

        const subject = `Retrait ${docLabel === "l'avenant" ? "de l'avenant" : 'du devis'} N°${docNo} - ${projectTitle} - ${companyName}`;
        const body = [
            `Bonjour ${greetingName},`,
            `Je vous informe que ${docLabel} n°${docNo} « ${projectTitle} » que je vous ai transmis est retiré : il ne peut plus être signé et n'engage plus aucune des deux parties. Le lien de signature en ligne a été désactivé.`,
            `Si vous en avez déjà téléchargé ou imprimé un exemplaire, merci de ne pas y donner suite.`,
            `Je reste à votre disposition pour en établir une nouvelle version si vous souhaitez poursuivre ce projet.`,
            `Bien cordialement,`,
            '-- \n' + signatureBlock,
        ].join('\n\n');

        setEmailPreview({
            email: selectedClient.email,
            rawSubject: subject,
            rawBody: body,
            lang: 'fr',
            // Ni lien ni bouton de signature : ce mail retire l'offre.
            signUrl: null,
            // Distingue ce mail d'un envoi de document : pas d'archivage de
            // version, pas de passage en « envoyé », pas de date de relance.
            kind: 'withdrawal',
        });
    };

    const handleSendQuoteEmail = async (lang = 'fr') => {
        if (isOffline()) {
            persistDraftNow();
            toast.error("Pas de réseau : l'envoi au client nécessite une connexion. Le devis reste enregistré sur ce téléphone.");
            return;
        }
        if (!formData.client_id) {
            toast.error('Veuillez d\'abord sélectionner un client');
            return;
        }

        // Devis jamais enregistré : on l'enregistre (ce qui le bascule sur son
        // URL d'édition) et l'envoi reprend une fois les données rechargées.
        if (!isEditing) {
            pendingSendRef.current = lang;
            await handleSubmit({ preventDefault: () => {} });
            return;
        }

        // L'envoi remet le lien en service (token_revoked: false, cf. plus bas) :
        // sur un document dont la signature a été suspendue, ce serait la
        // rouvrir sans le dire. On s'arrête et on renvoie l'artisan vers
        // l'action explicite.
        if (await fetchLinkSuspended()) {
            toast.error(suspensionBlockMessage);
            return;
        }

        const selectedClient = clients.find(c => c.id.toString() === formData.client_id.toString());
        // Pas de blocage si l'email est absent — le mailto s'ouvre sans destinataire
        // et l'utilisateur l'ajoute manuellement dans sa messagerie

        try {
            toast.loading("Génération du lien sécurisé...", { id: 'upload-toast' });

            // Ensure public_token exists and refresh its validity (un-revoke + extend expiry)
            // so re-sharing an old quote always produces a working link.
            let token = formData.public_token;
            const newExpiry = publicLinkExpiry();
            if (!token) {
                token = crypto.randomUUID();
            }
            const { error: tokenError } = await supabase
                .from('quotes')
                .update({
                    public_token: token,
                    token_revoked: false,
                    token_expires_at: newExpiry,
                    // Facture de situation : persiste le contexte d'avancement
                    // (recalculé à l'ouverture) pour que le PDF téléchargé depuis
                    // le lien public affiche le même récapitulatif que l'aperçu.
                    ...(formData.type === 'invoice' && formData.amendment_details?.situation
                        ? { amendment_details: formData.amendment_details }
                        : {}),
                })
                .eq('id', id);

            if (tokenError) throw tokenError;

            setFormData(prev => ({ ...prev, public_token: token }));

            // ── Traduction du contenu (envoi en anglais) ──
            // Traduit titre, notes et descriptions de lignes via l'IA, puis
            // mémorise le résultat sur le devis (content_en) pour que le PDF
            // (aperçu + portail client) l'affiche. Les lignes déjà traduites
            // et inchangées sont réutilisées : on ne traduit que ce qui manque.
            let contentEn = formData.content_en || null;
            if (lang === 'en') {
                try {
                    const sourceDescriptions = [...new Set(
                        (formData.items || [])
                            .map(i => (i.description || '').trim())
                            .filter(Boolean)
                    )];
                    const existing = contentEn?.lines || {};
                    const missing = sourceDescriptions.filter(d => !existing[d]);
                    const titleChanged = !contentEn || contentEn.sourceTitle !== (formData.title || '');
                    const notesChanged = !contentEn || contentEn.sourceNotes !== (formData.notes || '');
                    const workObjectChanged = !contentEn
                        || (contentEn.sourceWorkObject || '') !== (formData.work_object || '');

                    if (missing.length > 0 || titleChanged || notesChanged || workObjectChanged) {
                        toast.loading('Traduction du devis en anglais…', { id: 'translate-toast' });
                        const result = await translateQuoteContent({
                            title: formData.title || '',
                            workObject: formData.work_object || '',
                            notes: formData.notes || '',
                            descriptions: missing,
                        }, 'en');
                        const lines = { ...existing };
                        missing.forEach((src, i) => { lines[src] = result.descriptions[i] || src; });
                        contentEn = {
                            title: result.title || formData.title || '',
                            work_object: result.workObject || '',
                            notes: result.notes || '',
                            lines,
                            // Mémorise les sources pour détecter une modification ultérieure.
                            sourceTitle: formData.title || '',
                            sourceNotes: formData.notes || '',
                            sourceWorkObject: formData.work_object || '',
                        };
                        await supabase.from('quotes').update({ content_en: contentEn }).eq('id', id);
                        setFormData(prev => ({ ...prev, content_en: contentEn }));
                        toast.dismiss('translate-toast');
                    }
                } catch (translateErr) {
                    toast.dismiss('translate-toast');
                    console.error('Quote translation failed:', translateErr);
                    toast.error("La traduction automatique a échoué — le devis reste en français.");
                    contentEn = formData.content_en || null;
                }
            }

            // La langue est transmise dans l'URL publique afin que le PDF
            // téléchargé depuis le portail client soit dans la même langue
            // que le mail d'accompagnement.
            const publicUrl = `${window.location.origin}/q/${token}${lang && lang !== 'fr' ? `?lang=${lang}` : ''}`;
            const isInvoice = formData.type === 'invoice';
            const companyName = userProfile?.company_name || userProfile?.full_name || 'Votre Artisan';

            // We can skip PDF upload if we trust the public link, but let's keep it simply as a backup link or just rely on public portal which has download button.
            // Simplified: Just send Public Link.

            toast.dismiss('upload-toast');

            // Facture de situation : mail dédié qui explique au client qu'il ne
            // s'agit que de la part des travaux réalisés, avec un point chiffré.
            const situationInfo = isInvoice ? formData.amendment_details?.situation : null;
            const fmtAmount = (n) => `${(Number(n) || 0).toFixed(2)} €${formData.include_tva ? ' TTC' : ''}`;
            const buildSituationRecap = (labels) => {
                const parentTotal = Number(situationInfo?.parent_total_ttc) || 0;
                const previouslyBilled = Number(situationInfo?.previously_billed_ttc) || 0;
                const remaining = Math.max(parentTotal - previouslyBilled - total, 0);
                return [
                    `• ${labels.total} : ${fmtAmount(parentTotal)}`,
                    previouslyBilled > 0 ? `• ${labels.billed} : ${fmtAmount(previouslyBilled)}` : null,
                    `• ${labels.current} : ${fmtAmount(total)}`,
                    `• ${labels.remaining} : ${fmtAmount(remaining)}`,
                ].filter(Boolean).join('\n');
            };

            // Facture acquittée : le mail est un justificatif de paiement, pas
            // une demande de règlement — texte dédié, avec la date du paiement
            // si elle est renseignée.
            const isPaidInvoice = isInvoice && formData.status === 'paid';
            const paidDate = (isPaidInvoice && formData.paid_at)
                ? formatDate(formData.paid_at, { locale: lang === 'en' ? 'en-GB' : 'fr-FR' })
                : '';

            // Template Construction — bilingue (fr par défaut, en sur demande)
            const EMAIL_I18N = {
                fr: {
                    subjectPrefix: isInvoice
                        ? `${situationInfo ? 'Facture de situation' : 'Facture'}${isPaidInvoice ? ' acquittée' : ''}`
                        : (isCreditNote ? 'Avoir' : (isAmendmentDoc ? 'Avenant' : 'Devis')),
                    defaultProject: 'Votre projet',
                    defaultWorks: 'Travaux',
                    introCreditNote: (name, title) => `Bonjour ${name},\n\nJe vous transmets un avoir${formData.amendment_details?.credit_note?.parent_invoice_number ? ` sur la facture ${formData.amendment_details.credit_note.parent_invoice_number}` : ''} concernant le projet "${title}".\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introInvoice: (name, title) => `Bonjour ${name},\n\nJe vous transmets votre facture pour le projet "${title}".\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introInvoicePaid: (name, title) => `Bonjour ${name},\n\nVotre règlement${paidDate ? ` du ${paidDate}` : ''} a bien été reçu — je vous en remercie.\nJe vous transmets votre facture acquittée pour le projet "${title}", à conserver comme justificatif de paiement.\nVous trouverez ci-dessous le lien pour y accéder.`,
                    introSituation: (name, title) => `Bonjour ${name},\n\n${isPaidInvoice
                        ? `Votre règlement${paidDate ? ` du ${paidDate}` : ''} a bien été reçu — je vous en remercie. Je vous transmets la facture de situation n°${situationInfo?.index || 1} acquittée pour le projet "${title}", à conserver comme justificatif de paiement.`
                        : `Les travaux du projet "${title}" suivent leur cours. Je vous transmets la facture de situation n°${situationInfo?.index || 1} : elle correspond uniquement à la part des travaux réalisés à ce jour, et non au montant total du devis.`}\n\nOù en est le chantier :\n${buildSituationRecap({
                        total: 'Montant total du devis',
                        billed: 'Déjà facturé avant cette situation',
                        current: isPaidInvoice ? 'Cette situation (réglée)' : 'Cette situation (montant à régler)',
                        remaining: "Restera à facturer d'ici la fin du chantier",
                    })}\n\nVous trouverez ci-dessous le lien pour accéder à la facture.`,
                    introQuote: (name, title) => `Bonjour ${name},\n\nSuite à nos échanges, je vous transmets ma proposition de devis pour le projet "${title}".\nVous trouverez ci-dessous le lien pour le consulter.`,
                    introAmendment: (name, title) => `Bonjour ${name},\n\nSuite à nos échanges, je vous transmets l'avenant à votre devis pour le projet "${title}".\nVous trouverez ci-dessous le lien pour le consulter et le signer.`,
                    actionInvoice: isPaidInvoice ? 'Consulter et télécharger votre facture acquittée' : 'Consulter et télécharger votre facture',
                    actionQuote: 'Consulter et signer votre devis en ligne',
                    actionAmendment: 'Consulter et signer votre avenant en ligne',
                    signButtonLabel: 'Signer mon devis',
                    signButtonLabelAmendment: 'Signer mon avenant',
                    signCaption: 'Signature directement en ligne, sans impression — en moins d\'une minute.',
                    reportLine: `Le rapport d'intervention est egalement disponible depuis ce lien.`,
                    portalLine: (url) => `Votre espace client (documents et suivi de chantier) :\n${url}`,
                    closing: `N'hesitez pas a me contacter pour toute question.\n\nBien cordialement,`,
                },
                en: {
                    subjectPrefix: isInvoice
                        ? `${situationInfo ? 'Progress invoice' : 'Invoice'}${isPaidInvoice ? ' (paid)' : ''}`
                        : (isCreditNote ? 'Credit note' : (isAmendmentDoc ? 'Amendment' : 'Quote')),
                    defaultProject: 'Your project',
                    defaultWorks: 'Works',
                    introCreditNote: (name, title) => `Hello ${name},\n\nPlease find attached a credit note${formData.amendment_details?.credit_note?.parent_invoice_number ? ` for invoice ${formData.amendment_details.credit_note.parent_invoice_number}` : ''} regarding the project "${title}".\nYou will find the link to access it below.`,
                    introInvoice: (name, title) => `Hello ${name},\n\nPlease find attached your invoice for the project "${title}".\nYou will find the link to access it below.`,
                    introInvoicePaid: (name, title) => `Hello ${name},\n\nYour payment${paidDate ? ` of ${paidDate}` : ''} has been received — thank you.\nPlease find your paid invoice for the project "${title}", to keep as proof of payment.\nYou will find the link to access it below.`,
                    introSituation: (name, title) => `Hello ${name},\n\n${isPaidInvoice
                        ? `Your payment${paidDate ? ` of ${paidDate}` : ''} has been received — thank you. Please find paid progress invoice No. ${situationInfo?.index || 1} for the project "${title}", to keep as proof of payment.`
                        : `Work on the project "${title}" is progressing. Please find progress invoice No. ${situationInfo?.index || 1}: it only covers the share of the works completed to date, not the full amount of the quote.`}\n\nWhere the project stands:\n${buildSituationRecap({
                        total: 'Total amount of the quote',
                        billed: 'Previously billed before this invoice',
                        current: isPaidInvoice ? 'This progress invoice (paid)' : 'This progress invoice (amount due)',
                        remaining: 'Remaining to be billed by the end of the project',
                    })}\n\nYou will find the link to access the invoice below.`,
                    introQuote: (name, title) => `Hello ${name},\n\nFollowing our discussions, please find my quote proposal for the project "${title}".\nYou will find the link to view it below.`,
                    introAmendment: (name, title) => `Hello ${name},\n\nFollowing our discussions, please find the amendment to your quote for the project "${title}".\nYou will find the link to view and sign it below.`,
                    actionInvoice: isPaidInvoice ? 'View and download your paid invoice' : 'View and download your invoice',
                    actionQuote: 'View and sign your quote online',
                    actionAmendment: 'View and sign your amendment online',
                    signButtonLabel: 'Sign my quote',
                    signButtonLabelAmendment: 'Sign my amendment',
                    signCaption: 'Signed directly online, no printing needed — in under a minute.',
                    reportLine: `The intervention report is also available from this link.`,
                    portalLine: (url) => `Your client area (documents and project tracking):\n${url}`,
                    closing: `Please do not hesitate to contact me with any questions.\n\nKind regards,`,
                },
            };
            const E = EMAIL_I18N[lang] || EMAIL_I18N.fr;

            // En anglais, on utilise le titre traduit (mémorisé dans content_en)
            // pour l'objet ET le corps du mail, afin qu'ils restent cohérents
            // avec le PDF traduit (sinon l'objet anglais cite un titre français).
            const localizedTitle = (lang === 'en' && contentEn?.title)
                ? contentEn.title
                : formData.title;

            // `formData.id` n'existe pas (l'id vient de l'URL) : depuis toujours
            // l'objet du mail omettait le numéro du document. On utilise l'id
            // de la route — l'envoi exige un document déjà enregistré (isEditing).
            const docNo = ['invoice', 'credit_note'].includes(formData.type) && formData.invoice_number
                ? formData.invoice_number
                : (formData.quote_number || id);
            const subject = `${E.subjectPrefix}${id ? ` N°${docNo}` : ''} - ${localizedTitle || E.defaultProject} - ${companyName}`;

            const projectTitle = localizedTitle || E.defaultWorks;
            // « M. Cohignac Erwan » → « Bonjour M. Cohignac » (civilité + nom
            // seul) ; sans civilité dans la fiche, nom complet inchangé.
            const greetingName = clientGreetingName(selectedClient.name, lang);
            const introduction = isInvoice
                ? (situationInfo
                    ? E.introSituation(greetingName, situationInfo.parent_title || projectTitle)
                    : (isPaidInvoice
                        ? E.introInvoicePaid(greetingName, projectTitle)
                        : E.introInvoice(greetingName, projectTitle)))
                : (isCreditNote && E.introCreditNote
                    ? E.introCreditNote(greetingName, projectTitle)
                    : (isAmendmentDoc && E.introAmendment
                        ? E.introAmendment(greetingName, projectTitle)
                        : E.introQuote(greetingName, projectTitle)));

            const actionText = (isInvoice || isCreditNote)
                ? E.actionInvoice
                : (isAmendmentDoc ? E.actionAmendment : E.actionQuote);
            // Pour un devis, on ajoute la mention « sans impression » sous le lien
            // afin que même les clients en texte brut comprennent que la signature
            // se fait en ligne, sans imprimer. En HTML, le lien devient un bouton.
            const callToAction = isInvoice
                ? `${actionText} :\n${publicUrl}`
                : `${actionText} :\n${publicUrl}\n${E.signCaption}`;

            // Client Portal Link Logic
            let portalUrl = null;
            if (isInvoice) {
                let clientPortalToken = selectedClient.portal_token;

                if (!clientPortalToken) {
                    clientPortalToken = crypto.randomUUID();
                    const { error: clientUpdateError } = await supabase
                        .from('clients')
                        .update({ portal_token: clientPortalToken })
                        .eq('id', selectedClient.id);

                    if (clientUpdateError) {
                        console.error("Error creating portal token", clientUpdateError);
                    } else {
                        selectedClient.portal_token = clientPortalToken;
                    }
                }

                if (clientPortalToken) {
                    portalUrl = `${window.location.origin}/p/${clientPortalToken}`;
                }
            }

            // Chercher le lien du rapport : d'abord sur la facture, sinon via intervention_reports lié
            let reportPdfUrl = formData.report_pdf_url || null;
            if (isInvoice && !reportPdfUrl) {
                const { data: linkedReport } = await supabase
                    .from('intervention_reports')
                    .select('report_pdf_url, report_number, user_id')
                    .eq('quote_id', id)
                    .in('status', ['completed', 'signed'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (linkedReport) {
                    reportPdfUrl = linkedReport.report_pdf_url || null;
                    if (!reportPdfUrl && linkedReport.report_number) {
                        const reportPath = `interventions/${linkedReport.user_id}/rapport-${linkedReport.report_number}.pdf`;
                        const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(reportPath);
                        reportPdfUrl = urlData?.publicUrl || null;
                    }
                }
            }

            const signatureBlock = [
                companyName,
                userProfile?.full_name || '',
                userProfile?.phone || '',
                userProfile?.professional_email || userProfile?.email || '',
                userProfile?.website || ''
            ].filter(Boolean).join('\n');

            // Assembler les sections — uniquement des URLs du domaine artisanfacile.fr
            // Le rapport PDF est accessible depuis le lien de la facture (pas besoin d'URL Supabase)
            const bodyParts = [introduction, callToAction];
            if (reportPdfUrl) {
                bodyParts.push(E.reportLine);
            }
            if (portalUrl) {
                bodyParts.push(E.portalLine(portalUrl));
            }
            bodyParts.push(E.closing);
            // Marqueur RFC 3676 "-- " (dash dash space) : signale la signature.
            // L'edge function SMTP s'en sert pour remplacer la signature texte
            // par une version HTML riche dans la partie HTML du mail.
            bodyParts.push('-- \n' + signatureBlock);

            const body = bodyParts.join('\n\n');

            setEmailPreview({
                email: selectedClient.email,
                rawSubject: subject,
                rawBody: body,
                lang,
                // Signature en ligne : uniquement pour les devis (ni factures ni avoirs).
                // Sert à transformer le lien en bouton dans la version HTML du mail.
                signUrl: (isInvoice || isCreditNote) ? null : publicUrl,
                signLabel: isAmendmentDoc ? E.signButtonLabelAmendment : E.signButtonLabel,
            });

        } catch (error) {
            console.error(error);
            toast.dismiss('upload-toast');
            toast.error("Erreur lors de la préparation du document");
        }
    };

    const handleConfirmSendEmail = async (subject, body, overrideEmail, attachmentFiles = []) => {
        if (!emailPreview) return;

        // Un mail de retrait n'est pas un envoi de document : il ne doit ni
        // archiver une version transmise, ni repasser le devis en « envoyé »,
        // ni compter comme une relance.
        const isWithdrawal = emailPreview.kind === 'withdrawal';

        // L'adresse saisie dans la modale prime sur l'email enregistré du client
        // (ex : devis adressé à un tuteur/mandataire au nom du client protégé).
        const recipientEmail = (overrideEmail ?? emailPreview.email)?.trim() || '';

        const smtpConfigured = !!userProfile?.smtp_config?.host && !!userProfile?.smtp_config?.from_email;
        const mailtoUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        if (isTestMode) {
            captureEmail({ email: recipientEmail, subject, body });
            toast.success('📬 Email capturé dans l\'inbox test', { duration: 4000 });
        } else if (smtpConfigured && recipientEmail) {
            // Envoi direct depuis l'adresse pro de l'artisan via Edge Function
            const sendingToast = toast.loading('Envoi en cours depuis votre adresse pro...');
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                // Devis : on envoie une version HTML où le lien de signature
                // devient un bouton « Signer ». Le texte brut (avec l'URL) reste
                // le fallback pour les clients mail sans HTML. Les factures gardent
                // le rendu texte→HTML par défaut de l'edge function (pas de bouton).
                const htmlBody = emailPreview.signUrl
                    ? buildQuoteEmailHtml(body, emailPreview.signUrl, emailPreview.signLabel)
                    : undefined;

                let attachmentsPayload = [];
                if (attachmentFiles.length > 0) {
                    try {
                        attachmentsPayload = await Promise.all(attachmentFiles.map(async (file) => ({
                            filename: file.name,
                            contentType: file.type || 'application/octet-stream',
                            content_base64: await blobToBase64(file),
                        })));
                    } catch (attachErr) {
                        console.error('Attachment read failed:', attachErr);
                        toast.error("Erreur lors de la lecture d'une pièce jointe — envoi sans celle-ci");
                        attachmentsPayload = [];
                    }
                }

                const res = await fetch(`${supabaseUrl}/functions/v1/send-document-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        to: recipientEmail,
                        subject,
                        text: body,
                        ...(htmlBody ? { html: htmlBody } : {}),
                        quote_id: id,
                        client_id: formData.client_id,
                        ...(attachmentsPayload.length > 0 ? { attachments: attachmentsPayload } : {}),
                    }),
                });
                const result = await res.json();
                toast.dismiss(sendingToast);
                if (!res.ok) throw new Error(result.error || 'Échec de l\'envoi');
                toast.success(`Email envoyé à ${recipientEmail}`);
            } catch (err) {
                toast.dismiss(sendingToast);
                console.error('Direct email send failed:', err);
                toast.error(err.message || 'Échec de l\'envoi direct — ouverture du client mail');
                window.location.href = mailtoUrl;
            }
        } else {
            window.location.href = mailtoUrl;
            toast.success('Application de messagerie ouverte');
        }

        setShowSendSuccess(true);
        setTimeout(() => setShowSendSuccess(false), 2600);

        // Log interaction
        if (formData.client_id) {
            supabase.from('client_interactions').insert([{
                user_id: user.id,
                client_id: formData.client_id,
                type: 'email',
                date: new Date(),
                details: isWithdrawal
                    ? `Retrait du document notifié au client par email`
                    : `Envoi document par email`
            }]).then(({ error }) => {
                if (error) console.error('Error logging email interaction:', error);
            });
        }

        // Update quote last_followup_at
        if (id && id !== 'new' && !isWithdrawal) {
            supabase.from('quotes')
                .update({ last_followup_at: new Date().toISOString() })
                .eq('id', id)
                .then(({ error }) => {
                    if (error) console.error('Error updating follow-up date:', error);
                    else setFormData(prev => ({ ...prev, last_followup_at: new Date().toISOString() }));
                });
        }

        setEmailPreview(null);

        // Archive la version transmise (instantané + PDF figé) et passe le devis
        // en "envoyé" : c'est cette archive qui fait foi en cas de modification ultérieure.
        if (!isWithdrawal) {
            archiveSentVersion().catch(err => console.error('Sent version archive failed:', err));
        }

        // After send: nudge user to enable push notifications if not yet subscribed
        if (isPushSupported && !isPushSubscribed) {
            setTimeout(() => {
                toast('Activez les notifications pour savoir quand votre client signe', {
                    duration: 8000,
                    action: {
                        label: 'Activer',
                        onClick: async () => {
                            const result = await subscribePush();
                            if (result.success) {
                                toast.success('Notifications activées !');
                            }
                        },
                    },
                });
            }, 1500);
        }
    };

    // Archive la version envoyée au client : instantané complet du devis + PDF
    // figé dans le storage. C'est la référence en cas de litige ou de modification.
    const archiveSentVersion = async () => {
        if (!id || id === 'new') return;

        // L'envoi confirme le document : un brouillon passe en "envoyé" AVANT de
        // figer le PDF. Pour une facture, c'est ce passage hors brouillon qui
        // attribue le numéro légal (trigger set_invoice_number) — il doit donc
        // exister avant la génération du PDF archivé et envoyé au client.
        let sentInvoiceNumber = formData.invoice_number || null;
        if (formData.status === 'draft') {
            const { data: sentRow, error: statusError } = await supabase
                .from('quotes')
                .update({ status: 'sent', updated_at: new Date() })
                .eq('id', id)
                .select('invoice_number')
                .single();
            if (!statusError) {
                sentInvoiceNumber = sentRow?.invoice_number || null;
                setFormData(prev => ({ ...prev, status: 'sent', invoice_number: sentInvoiceNumber }));
                setInitialStatus('sent');
                setRevisionUnlocked(false);
                if (sentInvoiceNumber && !formData.invoice_number) {
                    toast.success(`Facture émise sous le numéro ${sentInvoiceNumber}`);
                }
            }
        }

        const selectedClient = clients.find(c => c.id?.toString() === formData.client_id?.toString());

        const snapshot = {
            id: parseInt(id, 10),
            user_id: user.id,
            client_id: formData.client_id,
            client_name: selectedClient?.name || 'Client',
            quote_number: formData.quote_number || null,
            invoice_number: sentInvoiceNumber,
            title: formData.title,
            work_object: formData.work_object || null,
            date: formData.date,
            valid_until: formData.valid_until || null,
            status: 'sent',
            type: formData.type,
            items: formData.items.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity) || 0,
                price: parseFloat(i.price) || 0,
                buying_price: parseFloat(i.buying_price) || 0,
            })),
            total_ht: subtotal,
            total_tva: tva,
            total_ttc: total,
            include_tva: formData.include_tva,
            notes: formData.notes,
            has_material_deposit: formData.has_material_deposit,
            deposit_percentage: formData.deposit_percentage || 0,
            amendment_details: formData.amendment_details || {},
            parent_quote_id: formData.parent_quote_id || null,
            content_en: formData.content_en || null,
            client_display_mode: formData.client_display_mode || 'detailed',
        };

        // Ré-envoi à l'identique : ne pas dupliquer l'archive existante
        const latest = quoteVersions[0];
        const sameAsLatest = latest
            && JSON.stringify(latest.snapshot?.items) === JSON.stringify(snapshot.items)
            && Number(latest.snapshot?.total_ttc) === Number(snapshot.total_ttc)
            && (latest.snapshot?.notes || '') === (snapshot.notes || '');

        if (!sameAsLatest) {
            // PDF figé — l'instantané reste archivé même si la génération échoue
            let pdfUrl = null;
            try {
                const blob = await generateClientPDF(snapshot, selectedClient || { name: snapshot.client_name }, userProfile, formData.type === 'invoice', 'blob');
                const pdfPath = `${user.id}/versions/devis-${id}-${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('quote_files')
                    .upload(pdfPath, blob, { contentType: 'application/pdf' });
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('quote_files').getPublicUrl(pdfPath);
                    pdfUrl = publicUrl;
                }
            } catch (pdfErr) {
                console.error('Sent PDF archive failed:', pdfErr);
            }

            const { data: maxRow } = await supabase
                .from('quote_versions')
                .select('version_number')
                .eq('quote_id', id)
                .order('version_number', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { data: inserted, error } = await supabase
                .from('quote_versions')
                .insert([{
                    quote_id: parseInt(id, 10),
                    user_id: user.id,
                    version_number: (maxRow?.version_number || 0) + 1,
                    reason: 'sent',
                    snapshot,
                    pdf_url: pdfUrl,
                }])
                .select()
                .single();

            if (error) {
                console.error('Error archiving sent version:', error);
            } else if (inserted) {
                setQuoteVersions(prev => [inserted, ...prev]);
            }
        }

        // (Le passage brouillon → "envoyé" est fait en tête de fonction, avant
        // la génération du PDF, pour que le numéro de facture y figure.)
    };

    return {
        emailPreview,
        setEmailPreview,
        showSendSuccess,
        handleNotifyWithdrawal,
        handleSendQuoteEmail,
        handleConfirmSendEmail,
    };
};
