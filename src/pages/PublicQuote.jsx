import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { FileCheck, Download, Loader2, Phone, PenTool, ChevronDown, ChevronUp } from 'lucide-react';
import { generateDevisPDF } from '../utils/pdfGenerator';
import { lineAmount } from '../utils/clientView';
import { vatFranchiseTotal } from '../utils/vatFranchise';
import { initialOptionSelection, quoteWithSelectedOptions } from '../utils/quoteSelectedOptions';
import { isIosLikeDevice, renderPdfBlobToPageImages } from '../utils/pdfPageImages';
import SignatureModal from '../components/SignatureModal';
import { Toaster, toast } from 'sonner';

// Client anonyme dédié à la page publique : pas de session, pas de refresh token.
// Évite le timeout de vérification de session de l'artisan qui cause data=null sur le RPC.
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Libellés de l'interface du portail public, traduits selon la langue
// transmise dans l'URL (?lang=en). Permet d'afficher au client un portail
// cohérent avec le devis et le mail reçus en anglais.
const PORTAL_I18N = {
    fr: {
        invalidLink: 'Lien invalide',
        invoice: 'Facture', acceptedQuote: 'Devis accepté', quote: 'Devis',
        report: 'Rapport', download: 'Télécharger', sign: 'Signer',
        signedOn: (d) => `Signé le ${d}`, signedShort: 'Signé', paid: 'Acquittée',
        optionsTitle: (n) => `${n} prestation${n > 1 ? 's' : ''} en option — à retenir ou non`,
        optionsIntro: "Le devis ci-dessous est au prix ferme : aucune option n'y est comptée. Cochez celles que vous retenez, le total et l'acompte se recalculent. Ce que vous laissez décoché ne vous sera pas facturé.",
        choiceRequired: '(choix nécessaire)', noneOfThese: 'Aucune de ces options',
        firmTotal: 'Devis ferme',
        selectedOptionsTotal: (n) => `+ ${n} option${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''}`,
        totalWithOptions: 'Total',
        optionsSaveFailed: "vos options n'ont pas pu être enregistrées. Rien n'a été signé — rechargez la page et réessayez, ou prévenez-moi.",
        optionsQuoteLocked: 'ce devis a déjà été accepté et ne peut plus être modifié.',
        pdfAutoUpdate: 'Le PDF se met à jour automatiquement selon votre sélection.',
        generatingDoc: 'Génération du document...',
        signQuote: 'Signer le devis', downloadPdf: 'Télécharger le PDF',
        yourInvoice: 'Votre facture', yourQuote: 'Votre devis',
        previewUnavailable: 'Aperçu indisponible sur ce navigateur. Téléchargez le PDF pour le consulter.',
        preparingPreview: "Préparation de l'aperçu…",
        quoteSignedThanks: 'Devis signé — merci !',
        notifiedOfAgreement: (name) => `${name} a été notifié(e) de votre accord.`,
        downloadSignedQuote: 'Télécharger le devis signé',
        contact: (name) => `Contacter ${name}`,
        signHint: 'Signez directement ici, sans imprimer — en moins d\'une minute.',
    },
    en: {
        invalidLink: 'Invalid link',
        invoice: 'Invoice', acceptedQuote: 'Accepted quote', quote: 'Quote',
        report: 'Report', download: 'Download', sign: 'Sign',
        signedOn: (d) => `Signed on ${d}`, signedShort: 'Signed', paid: 'Paid',
        optionsTitle: (n) => `${n} optional item${n > 1 ? 's' : ''} — to take or leave`,
        optionsIntro: 'The quote below is at the firm price: no option is counted in it. Tick the ones you want and the total and deposit are recalculated. Anything left unticked will not be invoiced.',
        choiceRequired: '(choice required)', noneOfThese: 'None of these options',
        firmTotal: 'Firm quote',
        selectedOptionsTotal: (n) => `+ ${n} option${n > 1 ? 's' : ''} taken`,
        totalWithOptions: 'Total',
        optionsSaveFailed: 'your options could not be saved. Nothing has been signed — reload the page and try again, or let me know.',
        optionsQuoteLocked: 'this quote has already been accepted and can no longer be changed.',
        pdfAutoUpdate: 'The PDF updates automatically based on your selection.',
        generatingDoc: 'Generating document...',
        signQuote: 'Sign the quote', downloadPdf: 'Download the PDF',
        yourInvoice: 'Your invoice', yourQuote: 'Your quote',
        previewUnavailable: 'Preview unavailable on this browser. Download the PDF to view it.',
        preparingPreview: 'Preparing preview…',
        quoteSignedThanks: 'Quote signed — thank you!',
        notifiedOfAgreement: (name) => `${name} has been notified of your agreement.`,
        downloadSignedQuote: 'Download the signed quote',
        contact: (name) => `Contact ${name}`,
        signHint: 'Sign directly here — no printing needed, in under a minute.',
    },
};

const PublicQuote = () => {
    const { token } = useParams();
    // Langue du portail/PDF, lue depuis l'URL (?lang=en), fr par défaut.
    const lang = (new URLSearchParams(window.location.search).get('lang') === 'en') ? 'en' : 'fr';
    const T = PORTAL_I18N[lang];
    // iOS/iPadOS ne rend que la 1re page d'un PDF blob: dans une <iframe> — y
    // compris sur iPad (qui se déclare comme un Mac desktop). On bascule donc
    // ces appareils sur le rendu image multi-pages, qui affiche tout le devis
    // et les boutons de signature, quelle que soit la largeur d'écran.
    const isIOS = isIosLikeDevice();
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [savingSignature, setSavingSignature] = useState(false);
    const [justSigned, setJustSigned] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfPageImages, setPdfPageImages] = useState([]);
    const [pdfRenderError, setPdfRenderError] = useState(false);
    const [selectedOptionals, setSelectedOptionals] = useState(null); // null = not yet initialized
    const [optionsExpanded, setOptionsExpanded] = useState(true);

    useEffect(() => {
        fetchQuote();
    }, [token]);

    // Separate effect for presence once quote is loaded
    useEffect(() => {
        if (!quote?.id) return;

        const channel = supabase.channel(`quote_presence:${quote.id}`, {
            config: {
                presence: {
                    key: 'client',
                },
            },
        });

        channel
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        online_at: new Date().toISOString()
                    });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [quote?.id]);

    const fetchQuote = async () => {
        try {
            const { data, error } = await supabase
                .rpc('get_public_quote', { lookup_token: token });

            if (error) throw error;
            if (!data) throw new Error('Devis introuvable ou lien expiré');

            setQuote(data);
        } catch (err) {
            console.error('Error fetching quote:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Only allow https:// URLs to prevent javascript: and data: URI attacks
    const isSafeHttpsUrl = (url) => {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    // Devis à imprimer = devis tel qu'il sera signé : options non retenues
    // supprimées, options retenues rendues fermes, totaux recalculés — la règle
    // appliquée par la RPC `select_quote_options` à la signature (cf.
    // quoteSelectedOptions.js). Le générateur de PDF lit total_ht/tva/ttc
    // directement : filtrer les lignes sans recalculer laisserait le pied de
    // page sur la somme d'origine (PDF « pas à jour » au clic sur une option).
    const buildQuoteForPdf = () => quoteWithSelectedOptions(quote, selectedOptionals);

    const handleDownload = () => {
        if (!quote) return;
        // Only fall back to the originally-imported PDF for "external" quotes
        // where items aren't the source of truth. For normal quotes we always
        // regenerate to reflect the artisan's edits and the client's option
        // selections — otherwise the download silently differs from the iframe.
        if (quote.is_external && quote.original_pdf_url && isSafeHttpsUrl(quote.original_pdf_url)) {
            window.open(quote.original_pdf_url, '_blank', 'noopener,noreferrer');
            return;
        }
        const isInvoice = quote.type === 'invoice' || quote.status === 'paid' || (quote.title && quote.title.toLowerCase().includes('facture'));
        const quoteForPdf = buildQuoteForPdf() || quote;
        generateDevisPDF(quoteForPdf, quote.client, quote.artisan, isInvoice, false, lang);
    };

    const handleRequestOtp = async (email) => {
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const response = await fetch(`${supabaseUrl}/functions/v1/request-quote-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({ token, email }),
            });
            const data = await response.json();
            if (!response.ok) return { success: false, error: data.error };
            return { success: true };
        } catch (err) {
            console.error('[OTP] fetch failed:', err);
            return { success: false, error: "Erreur réseau. Veuillez réessayer." };
        }
    };

    const handleSignatureSave = async (signatureData, otpCode, bonPourAccord) => {
        try {
            setSavingSignature(true);

            // Enregistrement des options retenues AVANT la signature — et rien
            // ne doit continuer si cet enregistrement échoue.
            //
            // Le retour de la RPC n'était pas vérifié. Quand elle a commencé à
            // répondre 404 (son paramètre était déclaré TEXT face à une colonne
            // public_token uuid), l'échec est passé inaperçu et le devis a été
            // signé au prix ferme, comme si le client n'avait rien coché. Le
            // devis n° 223 a été signé ainsi à 2 181,91 € alors que la cliente
            // avait retenu 230 € d'options et réglé l'acompte correspondant.
            //
            // Signer engage les deux parties : mieux vaut refuser la signature
            // et le dire que graver un montant qui n'est pas celui que le client
            // a validé à l'écran.
            const hasOptionals = (quote?.items || []).some(i => i.is_optional);
            if (hasOptionals && selectedOptionals !== null) {
                const { data: optionsSaved, error: optionsError } = await supabase.rpc('select_quote_options', {
                    p_token: token,
                    p_selected_ids: [...selectedOptionals],
                });
                if (optionsError) throw new Error(T.optionsSaveFailed);
                // La RPC renvoie false si le devis n'est plus modifiable
                // (déjà accepté ou payé) : le signer à nouveau n'aurait aucun
                // sens, et le total affiché ne serait pas celui qui est stocké.
                if (optionsSaved === false) throw new Error(T.optionsQuoteLocked);
            }

            const { data, error } = await supabase
                .rpc('sign_public_quote', {
                    lookup_token: token,
                    signature_base64: signatureData,
                    otp_code: otpCode || null,
                });

            // Save "bon pour accord" mention separately (non-blocking if column missing)
            if (!error && bonPourAccord) {
                await supabase
                    .from('quotes')
                    .update({ bon_pour_accord: bonPourAccord })
                    .eq('public_token', token);
            }

            if (error) throw error;
            if (data?.success === false) throw new Error(data.error || 'Échec de la signature');

            setShowSignatureModal(false);

            // Notification artisan côté serveur (ntfy.sh + email) – fiable même app fermée
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            fetch(`${supabaseUrl}/functions/v1/notify-artisan-portal-signature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({ lookup_token: token }),
            }).catch(err => console.error('Erreur notification artisan:', err));

            const signedQuote = {
                ...quote,
                signature: signatureData,
                signed_at: new Date().toISOString(),
                status: 'accepted',
                bon_pour_accord: bonPourAccord || null,
            };

            setQuote(signedQuote);
            setJustSigned(true);

        } catch (err) {
            console.error('Error saving signature:', err);
            // Afficher la vraie raison (lien expiré, devis déjà signé, code OTP
            // invalide…) : un message générique laisse le client bloqué sans
            // savoir quoi faire.
            toast.error(err?.message ? `Signature impossible : ${err.message}` : 'Erreur lors de la signature');
        } finally {
            setSavingSignature(false);
        }
    };

    // Sélection initiale des options à l'ouverture du lien : le client voit
    // d'abord le prix ferme du devis, rien n'est retenu à sa place (règle et
    // exception des groupes obligatoires dans quoteSelectedOptions.js).
    useEffect(() => {
        if (!quote || selectedOptionals !== null) return;
        setSelectedOptionals(initialOptionSelection(quote.items));
    }, [quote]);

    // Generate PDF client-side — depends on quote and optional item selection
    useEffect(() => {
        if (!quote || selectedOptionals === null) return;
        let blobUrl = null;
        const pageBlobUrls = [];
        let cancelled = false;
        setPdfLoading(true);
        setPdfRenderError(false);
        setPdfPageImages([]);
        const isInv = quote.type === 'invoice' || (quote.title && quote.title.toLowerCase().includes('facture'));
        const quoteForPdf = buildQuoteForPdf();

        generateDevisPDF(quoteForPdf, quote.client, quote.artisan, isInv, 'blob', lang)
            .then(async pdfBlob => {
                if (cancelled) return;
                blobUrl = URL.createObjectURL(pdfBlob);
                setPdfUrl(blobUrl);

                // Le devis est prêt : on lève le spinner plein écran immédiatement,
                // pour que la carte télécharger / signer soit accessible tout de
                // suite. La rastérisation multi-pages (mobile + iOS, qui n'affichent
                // pas un PDF blob: en iframe) se poursuit en arrière-plan et remplit
                // l'aperçu page par page — l'utilisateur n'attend jamais qu'elle
                // finisse (ni ne reste bloqué si elle traîne) pour voir le devis.
                setPdfLoading(false);

                try {
                    await renderPdfBlobToPageImages(pdfBlob, () => cancelled, (url) => {
                        pageBlobUrls.push(url);
                        if (!cancelled) setPdfPageImages(prev => [...prev, url]);
                    });
                } catch (renderErr) {
                    console.error('PDF page rendering failed:', renderErr);
                    // Repli « télécharger » seulement si aucune page n'a pu s'afficher.
                    if (!cancelled && pageBlobUrls.length === 0) setPdfRenderError(true);
                }
            })
            .catch(e => {
                console.error('PDF generation error:', e);
                if (!cancelled) {
                    setPdfRenderError(true);
                    setPdfLoading(false);
                }
            });

        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            pageBlobUrls.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quote?.id, quote?.signature, quote?.status, selectedOptionals]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileCheck className="w-8 h-8 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">{T.invalidLink}</h1>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );

    if (!quote) return null;

    const { artisan } = quote;
    const isSigned = quote.status === 'accepted';
    // credit_note inclus : un avoir se consulte comme une facture (pas de
    // signature, pas d'options), avec son propre libellé.
    const isInvoiceView = quote.type === 'invoice' || quote.type === 'credit_note' || (quote.title && quote.title.toLowerCase().includes('facture'));

    const optionalItems = (quote.items || []).filter(i => i.is_optional && i.type !== 'section');
    const hasOptions = optionalItems.length > 0 && !isSigned && !isInvoiceView;

    // Split optional items into mutually-exclusive groups (rendered as radios)
    // and standalone options (rendered as independent checkboxes). Insertion
    // order is preserved so the artisan controls grouping visually.
    const optionGroups = {};
    const ungroupedOptions = [];
    for (const it of optionalItems) {
        const g = (it.option_group || '').trim();
        if (g) {
            if (!optionGroups[g]) optionGroups[g] = [];
            optionGroups[g].push(it);
        } else {
            ungroupedOptions.push(it);
        }
    }
    const includeTva = quote.include_tva !== false;
    const tvaRate = 0.20;

    const itemTotal = (item) => lineAmount(item);
    const mandatoryHT = (quote.items || [])
        .filter(i => !i.is_optional && i.type !== 'section')
        .reduce((s, i) => s + itemTotal(i), 0);
    const selectedOptions = optionalItems.filter(i => selectedOptionals?.has(String(i.id)));
    const selectedCount = selectedOptions.length;
    const selectedOptionsHT = selectedOptions.reduce((s, i) => s + itemTotal(i), 0);
    const totalHT = mandatoryHT + selectedOptionsHT;
    // Les trois montants du récapitulatif viennent de la même addition que le
    // total : le client doit pouvoir vérifier « ferme + options = total » sans
    // jamais tomber sur un écart.
    const withVat = (ht) => (includeTva ? ht * (1 + tvaRate) : ht);
    const firmTTC = withVat(mandatoryHT);
    const selectedOptionsTTC = withVat(selectedOptionsHT);
    const totalTTC = withVat(totalHT);
    // En franchise de TVA (art. 293 B du CGI), il n'y a pas de HT à opposer au
    // TTC : le montant affiché est celui que le client règlera. Suffixer « HT »
    // ferait croire qu'il reste 20 % à ajouter — on l'omet et on l'écrit.
    const amountSuffix = includeTva ? ' TTC' : '';

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR');
        } catch (e) {
            return '';
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
            {/* Toaster ancré en bas : sur mobile, un toast en haut (ex. « appli
                prête hors ligne ») s'affiche pleine largeur et recouvre la barre
                d'action collée en haut, interceptant le tap sur « Signer ». En bas,
                aucun toast ne masque plus la CTA principale. */}
            <Toaster position="bottom-center" richColors toastOptions={{ style: { maxWidth: 'calc(100vw - 24px)', wordBreak: 'break-word', overflowWrap: 'anywhere' } }} />

            {/* Sticky top bar */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
                    {/* Left: artisan identity */}
                    <div className="flex items-center gap-3 min-w-0">
                        {artisan.logo_url && (
                            <img src={artisan.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded" />
                        )}
                        <div className="min-w-0">
                            <div className="font-semibold text-gray-900 text-sm truncate">
                                {artisan.company_name || artisan.full_name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                                {quote.type === 'credit_note' ? 'Avoir' : isInvoiceView ? T.invoice : isSigned ? T.acceptedQuote : T.quote} N° {(isInvoiceView && quote.invoice_number) || quote.quote_number || quote.id}
                            </div>
                        </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        {quote.report_pdf_url && isSafeHttpsUrl(quote.report_pdf_url) && (
                            <a
                                href={quote.report_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-orange-700 border border-orange-200 bg-orange-50 hover:bg-orange-100 text-sm font-medium rounded-lg transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                {T.report}
                            </a>
                        )}
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">{T.download}</span>
                        </button>
                        {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                            <button
                                onClick={() => setShowSignatureModal(true)}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold rounded-lg shadow-sm transition-colors"
                            >
                                <PenTool className="w-4 h-4" />
                                {T.sign}
                            </button>
                        )}
                        {isSigned && quote.type !== 'invoice' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 text-sm font-bold rounded-lg border border-green-200">
                                <FileCheck className="w-4 h-4" />
                                <span className="hidden sm:inline">{T.signedOn(formatDate(quote.signed_at || quote.updated_at))}</span>
                                <span className="sm:hidden">{T.signedShort}</span>
                            </div>
                        )}
                        {quote.status === 'paid' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 text-sm font-bold rounded-lg border border-red-200">
                                <FileCheck className="w-4 h-4" />
                                {T.paid}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bandeau discret « signez ici, sans imprimer » : lève le réflexe
                imprimer→signer→renvoyer chez les clients qui ne réalisent pas
                que la signature se fait en ligne. Cliquable pour ouvrir la
                signature. Affiché uniquement sur un devis non signé. */}
            {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                <button
                    onClick={() => setShowSignatureModal(true)}
                    className="w-full bg-blue-50 border-b border-blue-100 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                    <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
                        <PenTool className="w-4 h-4 shrink-0" />
                        <span>{T.signHint}</span>
                    </div>
                </button>
            )}

            {/* Options panel — visible only when there are optional items */}
            {hasOptions && (
                <div className="bg-white border-b border-purple-100 shadow-sm">
                    <div className="max-w-4xl mx-auto px-4">
                        <button
                            className="w-full flex items-center justify-between py-3 text-sm font-semibold text-purple-700"
                            onClick={() => setOptionsExpanded(v => !v)}
                        >
                            <span>{T.optionsTitle(optionalItems.length)}</span>
                            {optionsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {optionsExpanded && (
                            <div className="pb-4 space-y-3">
                                {/* Ce que les cases à cocher font n'allait pas de soi : des
                                    clients ont écrit pour demander un devis « mis à jour avec
                                    les options » sans voir qu'ils pouvaient les retenir ici.
                                    La phrase dit donc les trois choses qu'ils ignoraient — le
                                    devis affiché est le prix ferme, cocher recalcule, ne pas
                                    cocher n'engage à rien. */}
                                <p className="text-sm text-gray-600 leading-snug">{T.optionsIntro}</p>
                                {/* Grouped options: mutually exclusive radio groups */}
                                {Object.entries(optionGroups).map(([groupName, groupItems]) => {
                                    const required = groupItems.some(i => i.option_group_required);
                                    return (
                                        <div key={`group-${groupName}`} className="rounded-xl border border-purple-200 bg-purple-50/40 p-3">
                                            <p className="text-xs font-semibold text-purple-700 mb-2">
                                                {groupName}
                                                {required && <span className="ml-1 text-purple-500">{T.choiceRequired}</span>}
                                            </p>
                                            <div className="space-y-1.5">
                                                {groupItems.map(item => {
                                                    const checked = selectedOptionals?.has(String(item.id)) ?? false;
                                                    const ht = itemTotal(item);
                                                    const ttc = includeTva ? ht * (1 + tvaRate) : ht;
                                                    return (
                                                        <label key={item.id} className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-white border border-purple-300' : 'hover:bg-white/60'}`}>
                                                            <input
                                                                type="radio"
                                                                name={`option-group-${groupName}`}
                                                                checked={checked}
                                                                onChange={() => setSelectedOptionals(prev => {
                                                                    const next = new Set(prev);
                                                                    for (const sibling of groupItems) {
                                                                        next.delete(String(sibling.id));
                                                                    }
                                                                    next.add(String(item.id));
                                                                    return next;
                                                                })}
                                                                className="mt-0.5 w-4 h-4 accent-purple-600 shrink-0"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-sm font-medium ${checked ? 'text-gray-900' : 'text-gray-500'}`}>
                                                                    {item.description}
                                                                </p>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className={`text-sm font-semibold ${checked ? 'text-purple-700' : 'text-gray-400'}`}>
                                                                    +{ttc.toFixed(2)} €{amountSuffix}
                                                                </p>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                                {!required && (
                                                    <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${groupItems.every(i => !selectedOptionals?.has(String(i.id))) ? 'bg-white border border-gray-300' : 'hover:bg-white/60'}`}>
                                                        <input
                                                            type="radio"
                                                            name={`option-group-${groupName}`}
                                                            checked={groupItems.every(i => !selectedOptionals?.has(String(i.id)))}
                                                            onChange={() => setSelectedOptionals(prev => {
                                                                const next = new Set(prev);
                                                                for (const sibling of groupItems) {
                                                                    next.delete(String(sibling.id));
                                                                }
                                                                return next;
                                                            })}
                                                            className="w-4 h-4 accent-gray-500 shrink-0"
                                                        />
                                                        <span className="text-sm text-gray-500">{T.noneOfThese}</span>
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Ungrouped options: independent checkboxes */}
                                {ungroupedOptions.map(item => {
                                    const checked = selectedOptionals?.has(String(item.id)) ?? false;
                                    const ht = itemTotal(item);
                                    const ttc = includeTva ? ht * (1 + tvaRate) : ht;
                                    return (
                                        <label key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => setSelectedOptionals(prev => {
                                                    const next = new Set(prev);
                                                    if (e.target.checked) next.add(String(item.id));
                                                    else next.delete(String(item.id));
                                                    return next;
                                                })}
                                                className="mt-0.5 w-4 h-4 accent-purple-600 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                {/* Non cochée ne veut pas dire refusée : le client
                                                    n'a simplement pas encore décidé. La barrer le
                                                    lui présentait comme écartée d'avance — et le
                                                    devis PDF réserve le texte barré aux options
                                                    réellement écartées à la signature. */}
                                                <p className={`text-sm font-medium ${checked ? 'text-gray-900' : 'text-gray-600'}`}>
                                                    {item.description}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`text-sm font-semibold ${checked ? 'text-purple-700' : 'text-gray-400'}`}>
                                                    +{ttc.toFixed(2)} €{amountSuffix}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}

                                {/* Le total est décomposé plutôt qu'affiché seul : « prix ferme
                                    + options retenues = total » se vérifie d'un coup d'œil. Un
                                    total unique laissait le client refaire l'addition sans
                                    retrouver l'écart, et écrire pour demander d'où il venait. */}
                                <div className="pt-2 border-t border-purple-100 space-y-1 text-sm">
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>{T.firmTotal}</span>
                                        <span>{firmTTC.toFixed(2)} €{amountSuffix}</span>
                                    </div>
                                    {selectedCount > 0 && (
                                        <div className="flex items-center justify-between text-purple-700">
                                            <span>{T.selectedOptionsTotal(selectedCount)}</span>
                                            <span>+{selectedOptionsTTC.toFixed(2)} €{amountSuffix}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-gray-500">{T.totalWithOptions}</span>
                                        <span className="font-bold text-gray-900 text-base">{totalTTC.toFixed(2)} €{amountSuffix}</span>
                                    </div>
                                </div>
                                {!includeTva && (
                                    <p className="text-xs text-gray-500 italic">{vatFranchiseTotal({ lang }).note}</p>
                                )}
                                <p className="text-xs text-gray-400">{T.pdfAutoUpdate}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PDF area */}
            <div className="flex-1 flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
                {pdfLoading ? (
                    <div className="flex-1 flex items-center justify-center bg-gray-100" style={{ minHeight: 'calc(100vh - 56px)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="text-sm text-gray-500">{T.generatingDoc}</p>
                        </div>
                    </div>
                ) : pdfUrl ? (
                    <>
                        {/* Desktop (hors iOS) : iframe pleine hauteur. Masquée sur
                            iOS/iPadOS, qui ne rend que la 1re page d'un blob: PDF. */}
                        {!isIOS && (
                            <iframe
                                src={pdfUrl}
                                className="hidden lg:block w-full border-0"
                                style={{ height: 'calc(100vh - 56px)' }}
                                title="Document PDF"
                            />
                        )}
                        {/* Rendu image multi-pages : mobile + tout appareil iOS
                            (iPad inclus), car iOS Safari refuse d'afficher un PDF
                            blob: dans une iframe au-delà de la 1re page.
                            Affiche aussi un CTA de repli pendant le rendu / en cas
                            d'échec. */}
                        <div className={`${isIOS ? 'flex' : 'lg:hidden flex'} flex-1 flex-col bg-gray-100`}>
                            {pdfPageImages.length > 0 ? (
                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {pdfPageImages.map((src, i) => (
                                        <img
                                            key={i}
                                            src={src}
                                            alt={`Page ${i + 1}`}
                                            className="w-full rounded-lg shadow bg-white"
                                            loading={i === 0 ? 'eager' : 'lazy'}
                                        />
                                    ))}
                                    <div className="pt-2 pb-6 space-y-2">
                                        {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                                            <button
                                                onClick={() => setShowSignatureModal(true)}
                                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow transition-colors"
                                            >
                                                <PenTool className="w-5 h-5" />
                                                {T.signQuote}
                                            </button>
                                        )}
                                        <button
                                            onClick={handleDownload}
                                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium rounded-xl shadow-sm transition-colors"
                                        >
                                            <Download className="w-5 h-5" />
                                            {T.downloadPdf}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center p-6">
                                    <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-4">
                                        <div className={`w-16 h-16 ${pdfRenderError ? 'bg-amber-100' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto`}>
                                            {pdfRenderError ? (
                                                <Download className="w-8 h-8 text-amber-600" />
                                            ) : (
                                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                            )}
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900">
                                                {isInvoiceView ? T.yourInvoice : T.yourQuote}
                                            </h2>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {pdfRenderError
                                                    ? T.previewUnavailable
                                                    : T.preparingPreview}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleDownload}
                                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow transition-colors"
                                        >
                                            <Download className="w-5 h-5" />
                                            {T.downloadPdf}
                                        </button>
                                        {!isSigned && !isInvoiceView && quote.status !== 'paid' && (
                                            <button
                                                onClick={() => setShowSignatureModal(true)}
                                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 font-bold rounded-xl shadow-sm transition-colors"
                                            >
                                                <PenTool className="w-5 h-5" />
                                                {T.signQuote}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : null}
            </div>

            {/* Below PDF: post-sign success banner */}
            <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
                {/* Post-signature success banner */}
                {justSigned && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-4">
                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <FileCheck className="w-7 h-7 text-green-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-800">{T.quoteSignedThanks}</h3>
                            <p className="text-green-700 text-sm mt-1">
                                {T.notifiedOfAgreement(artisan.company_name || artisan.full_name)}
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={handleDownload}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-medium rounded-xl shadow-sm transition-all"
                            >
                                <Download className="w-4 h-4" />
                                {T.downloadSignedQuote}
                            </button>
                            {artisan.phone && (
                                <a
                                    href={`tel:${artisan.phone}`}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white hover:bg-green-700 font-medium rounded-xl shadow-sm transition-all"
                                >
                                    <Phone className="w-4 h-4" />
                                    {T.contact(artisan.company_name || artisan.full_name)}
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <SignatureModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
                onRequestOtp={handleRequestOtp}
                requiresOtp={quote?.require_otp === true && Boolean(quote?.client?.email)}
            />
        </div>
    );
};

export default PublicQuote;
