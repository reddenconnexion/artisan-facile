import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { validateFileForUpload, UPLOAD_PRESETS } from '../../utils/uploadValidation';
import { supabase } from '../../utils/supabase';
import { extractQuoteFromPdfText } from '../../utils/aiService';
import { extractTextFromPDF, extractTextFromDocx, parseQuoteItems, extractQuoteMetadata } from '../../utils/documentParser';
import { parseQuoteCsv } from '../../utils/quoteCsvImport';
import { isBlankItem } from './quoteHelpers';

/**
 * Imports du devis : fichier PDF / Word / CSV (extraction des lignes, repli
 * IA), document externe brut, et « Coller un tableau » (presse-papiers,
 * raccourci Ctrl/⌘+V sur un devis neuf).
 */
export const useQuoteImport = ({
    fetchPriceLibrary,
    fileInputRef,
    isAiTrialSession,
    isEditing,
    priceLibrary,
    setFormData,
    user,
    userProfile,
}) => {
    const [importing, setImporting] = useState(false);
    const [showImportZone, setShowImportZone] = useState(false);
    const [competitorImport, setCompetitorImport] = useState(null);   // { filename, importedAt } quand on est en contre-proposition
    const [isDragOver, setIsDragOver] = useState(false);
    // Modale « Coller un tableau » : import CSV sans fichier (copie de cellules
    // Excel, CSV reçu par mail) — voir QuoteCsvPasteModal.
    const [showCsvPasteModal, setShowCsvPasteModal] = useState(false);
    const [pastedCsvText, setPastedCsvText] = useState('');

    // ── Coller un tableau (import CSV sans fichier) ───────────────────────────
    // Le même parseur que l'import de fichier, alimenté par le presse-papiers :
    // l'artisan copie ses cellules dans Excel et colle, sans avoir à exporter
    // puis retrouver un .csv sur son ordinateur.

    const openCsvPasteModal = (initialText = '') => {
        setPastedCsvText(initialText);
        setShowCsvPasteModal(true);
    };

    const applyPastedCsv = ({ items, notes, skipped, headerless, mode }) => {
        const base = Date.now();
        const imported = items.map((item, i) => ({ ...item, id: base + i }));
        setFormData(prev => {
            const kept = mode === 'append' ? prev.items.filter(item => !isBlankItem(item)) : [];
            return {
                ...prev,
                items: [...kept, ...imported],
                // Réserves et notes du tableau : ajoutées aux notes déjà saisies
                // plutôt que de les écraser (même règle que l'import de fichier).
                notes: notes ? (prev.notes ? `${prev.notes}\n${notes}` : notes) : prev.notes,
            };
        });
        setShowCsvPasteModal(false);
        setPastedCsvText('');
        setShowImportZone(false);

        const lineCount = imported.filter(item => item.type !== 'section').length;
        const plural = lineCount > 1 ? 's' : '';
        toast.success(
            `${lineCount} ligne${plural} ${mode === 'append' ? `ajoutée${plural}` : `importée${plural}`} depuis le tableau collé.`
            + `${skipped > 0 ? ` (${skipped} ignorée${skipped > 1 ? 's' : ''})` : ''}`
            + `${notes ? ' Réserves et notes reprises dans « Notes / Conditions ».' : ''}`
        );
        if (headerless) {
            toast.message('Colonnes devinées faute d\'en-têtes — vérifiez quantités et prix.');
        }
    };

    // Ctrl/⌘+V sur un devis neuf : un tableau copié depuis un tableur ouvre
    // directement l'aperçu d'import — le chemin le plus court entre Excel et le
    // devis. Les collages dans un champ de saisie sont laissés tranquilles, et
    // un simple mot copié n'ouvre rien.
    useEffect(() => {
        if (isEditing || showCsvPasteModal) return;
        const onPaste = (e) => {
            const target = e.target;
            if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
            const text = e.clipboardData?.getData('text/plain') || '';
            const looksTabular = /[;\t]/.test(text) || text.trim().split(/\r?\n/).filter(Boolean).length >= 2;
            if (!text.trim() || !looksTabular) return;
            e.preventDefault();
            openCsvPasteModal(text);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [isEditing, showCsvPasteModal]);

    // Reusable function to process imported file
    const processImportedFile = async (file, mode = 'archive') => {
        if (!file) return;

        // CSV : parsing local pur (pas d'archive PDF, pas d'upload, pas d'IA).
        // Un CSV n'a pas de magic bytes — validation par extension + taille.
        const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
        if (isCsv) {
            if (file.size > 2 * 1024 * 1024) {
                toast.error('Fichier CSV trop volumineux (2 MB maximum).');
                return;
            }
            try {
                setImporting(true);
                const text = await file.text();
                const { items: csvItems, notes: csvNotes, skipped, headerless, error: parseError } = parseQuoteCsv(text);
                if (parseError) {
                    toast.error(parseError);
                    return;
                }
                setFormData(prev => ({
                    ...prev,
                    title: prev.title || file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim(),
                    items: csvItems,
                    // Réserves et notes du fichier : ajoutées aux notes déjà
                    // saisies plutôt que de les écraser (même règle que l'import PDF).
                    notes: csvNotes ? (prev.notes ? `${prev.notes}\n${csvNotes}` : csvNotes) : prev.notes,
                }));
                setShowImportZone(false);
                const lineCount = csvItems.filter(i => i.type !== 'section').length;
                toast.success(
                    `${lineCount} ligne${lineCount > 1 ? 's' : ''} importée${lineCount > 1 ? 's' : ''} depuis le CSV`
                    + `${skipped > 0 ? ` (${skipped} ignorée${skipped > 1 ? 's' : ''})` : ''}.`
                    + `${csvNotes ? ' Réserves et notes reprises dans « Notes / Conditions ».' : ''}`
                );
                if (headerless) {
                    // Colonnes lues d'après leur ordre : à contrôler avant d'envoyer le devis.
                    toast.message('Colonnes devinées faute d\'en-têtes — vérifiez quantités et prix.');
                }
            } catch (error) {
                console.error('Import CSV error:', error);
                toast.error("Erreur lors de l'import CSV : " + error.message);
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
            return;
        }

        // Validation stricte : magic bytes + taille (PDF ou DOCX uniquement, max 20 MB)
        const validation = await validateFileForUpload(file, UPLOAD_PRESETS.quoteDocument);
        if (!validation.ok) {
            toast.error(validation.error);
            return;
        }

        const isPdf = file.type === 'application/pdf';
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

        try {
            setImporting(true);
            toast.message('Traitement du fichier en cours...');

            // 1. Upload File to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('quote_files')
                .getPublicUrl(filePath);

            toast.success("Fichier importé avec succès !");

            // 2. Extract Text (for data filling)
            let text = '';
            if (isPdf) {
                text = await extractTextFromPDF(file);
            } else if (isDocx) {
                text = await extractTextFromDocx(file);
            }

            // 2a. Local regex parsing — fast, free, handles most well-structured PDFs.
            const { items: regexItems, notes: regexNotes } = parseQuoteItems(text);
            const meta = extractQuoteMetadata(text);

            // 2b. Regex-first strategy: the local parser is reliable for the
            // common, well-structured quotes and never silently drops lines, so
            // it stays the default. The AI is only called as a *fallback* when
            // the regex result looks weak (no/few lines, or mostly unpriced) and
            // we only keep the AI result when it recovers MORE lines — this
            // avoids replacing a complete regex extraction with a shorter one.
            const zeroPriced = regexItems.filter(i => !i.price).length;
            const looksWeak =
                regexItems.length === 0 ||
                regexItems.length < 3 ||
                (regexItems.length > 0 && zeroPriced / regexItems.length > 0.5);

            const hasPersonalKey = !!userProfile?.has_openai_api_key;
            const planNow = userProfile?.plan || 'free';
            const isPro = planNow === 'pro' || planNow === 'owner';
            const canUseAi = (hasPersonalKey || isPro || isAiTrialSession) && text && text.trim().length > 50;

            let finalItems = regexItems;
            let finalNotes = regexNotes;
            let finalTitle = meta.title;
            let aiUsed = false;

            if (looksWeak && canUseAi) {
                try {
                    toast.info("Affinage de l'extraction par IA…");
                    const aiResult = await extractQuoteFromPdfText(text);
                    if (aiResult.items.length > regexItems.length) {
                        finalItems = aiResult.items;
                        finalNotes = aiResult.notes || regexNotes;
                        finalTitle = aiResult.title || meta.title;
                        aiUsed = true;
                    }
                } catch (aiErr) {
                    console.warn('AI extraction fallback failed, keeping regex result:', aiErr);
                    // Silent: regex result still applies.
                }
            }

            // Pour une contre-proposition, on préfixe le titre et on bascule en mode externe
            // (preserve l'original PDF pour comparaison) — l'artisan ajustera les prix.
            const isCompetitor = mode === 'competitor';
            const proposedTitle = finalTitle || '';
            const competitorTitle = proposedTitle
                ? `Contre-proposition — ${proposedTitle}`
                : 'Contre-proposition';

            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                title: prev.title || (isCompetitor ? competitorTitle : proposedTitle),
                items: finalItems.length > 0 ? finalItems : prev.items,
                notes: finalNotes ? (prev.notes ? prev.notes + '\n' + finalNotes : finalNotes) : prev.notes
            }));

            // Mémoriser le mode pour afficher le bandeau d'aide à la contre-proposition
            if (isCompetitor) setCompetitorImport({ filename: file.name, importedAt: Date.now() });

            setShowImportZone(false);
            if (finalItems.length > 0) {
                toast.success(
                    isCompetitor
                        ? `Devis concurrent analysé : ${finalItems.length} lignes importées${aiUsed ? ' (IA)' : ''}. Ajustez vos prix pour la contre-proposition.`
                        : `${finalItems.length} éléments détectés et importés${aiUsed ? ' (IA)' : ''}.`,
                );
            } else {
                toast.info("Aucun élément chiffré détecté (Document image ?), document joint.");
            }

        } catch (error) {
            console.error('Import error:', error);
            toast.error("Erreur lors de l'import : " + error.message);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Updated Handle Import to support File Upload + Extraction
    const handleImportFile = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            processImportedFile(file);
        }
    };

    const handleExternalImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast.error('Seuls les fichiers PDF sont supportés');
            return;
        }

        try {
            setImporting(true);
            toast.message('Traitement du PDF en cours...');

            // 1. Upload File to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('quote_files')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('quote_files')
                .getPublicUrl(filePath);

            toast.success("PDF stocké avec succès !");

            // 2. Extract Items for Library
            try {
                const text = await extractTextFromPDF(file);
                const { items: extractedItems } = parseQuoteItems(text);

                if (extractedItems.length > 0) {
                    // Reuse Upsert Logic
                    const toInsert = [];
                    const toUpdate = [];
                    const seenDescriptions = new Set();

                    const libraryMap = new Map();
                    if (priceLibrary && priceLibrary.length > 0) {
                        priceLibrary.forEach(i => {
                            if (i.description) libraryMap.set(i.description.trim().toLowerCase(), i);
                        });
                    }

                    for (const item of extractedItems) {
                        const desc = item.description?.trim();
                        if (!desc) continue;

                        const normalizeDesc = desc.toLowerCase();
                        const price = parseFloat(item.price) || 0;
                        const buyingPrice = parseFloat(item.buying_price) || 0;

                        if (seenDescriptions.has(normalizeDesc)) continue;
                        seenDescriptions.add(normalizeDesc);

                        const existing = libraryMap.get(normalizeDesc);

                        if (existing) {
                            const priceChanged = Math.abs((existing.price || 0) - price) > 0.01;
                            const buyingChanged = buyingPrice > 0 && Math.abs((existing.buying_price || 0) - buyingPrice) > 0.01;
                            if (priceChanged || buyingChanged) {
                                toUpdate.push({
                                    ...existing,
                                    price: price,
                                    ...(buyingPrice > 0 ? { buying_price: buyingPrice } : {}),
                                    updated_at: new Date()
                                });
                            }
                        } else {
                            toInsert.push({
                                user_id: user.id,
                                description: desc,
                                price: price,
                                buying_price: buyingPrice,
                                unit: item.unit || 'u',
                                type: item.type || 'service'
                            });
                        }
                    }

                    let addedCount = 0;
                    let updatedCount = 0;

                    if (toInsert.length > 0) {
                        const { error: insertError } = await supabase.from('price_library').insert(toInsert);
                        if (!insertError) addedCount = toInsert.length;
                    }
                    if (toUpdate.length > 0) {
                        const { error: updateError } = await supabase.from('price_library').upsert(toUpdate);
                        if (!updateError) updatedCount = toUpdate.length;
                    }

                    if (addedCount > 0 || updatedCount > 0) {
                        toast.success(`Extraction : ${addedCount} articles ajoutés, ${updatedCount} mis à jour en bibliothèque.`);
                        fetchPriceLibrary();
                    }
                }
            } catch (extractError) {
                console.error("Extraction error during external import:", extractError);
                toast.warning("Le PDF est importé, mais l'extraction des articles a échoué.");
            }

            // Update Form Data for External Mode
            setFormData(prev => ({
                ...prev,
                original_pdf_url: publicUrl,
                is_external: true,
                manual_total_ht: 0,
                manual_total_tva: 0,
                manual_total_ttc: 0
            }));

        } catch (error) {
            console.error('External import error:', error);
            toast.error("Erreur lors de l'import : " + error.message);
        } finally {
            setImporting(false);
            e.target.value = ''; // Reset input
        }
    };

    return {
        importing,
        showImportZone,
        setShowImportZone,
        competitorImport,
        setCompetitorImport,
        isDragOver,
        setIsDragOver,
        showCsvPasteModal,
        setShowCsvPasteModal,
        pastedCsvText,
        setPastedCsvText,
        openCsvPasteModal,
        applyPastedCsv,
        processImportedFile,
        handleImportFile,
        handleExternalImport,
    };
};
