import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Download, Check, Share2, FileText, AlertTriangle, Loader2, Mic, RotateCcw, Wand2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { structureVisitTranscript } from '../utils/aiService';
import { transcribeBlob } from '../utils/transcribeAudio';
import { useModalA11y } from '../hooks/useModalA11y';
import {
    buildPredevisReport,
    findMissingEssentials,
    surveyCompleteness,
    predevisReportFilename,
} from '../utils/predevisReport';

/**
 * « Compte rendu de visite » — sortie du mode Visite technique.
 *
 * Assemble la trame de relevé, les notes vocales et les photos en un texte
 * complet, prêt à coller dans une IA spécialisée devis. Fonctionne sans
 * réseau : seule la transcription des notes vocales appelle le serveur, et
 * elle reste optionnelle. Le texte est modifiable avant envoi.
 */
const PredevisReportModal = ({
    open,
    onClose,
    survey,
    template,
    meta = {},
    voiceNotes = [],
    transcripts = {},
    transcribingCount = 0,
    onTranscripts,
    clientName,
    address,
    onPersist,
    savedReportId,
    saving,
    onOpenSaved,
}) => {
    const [copied, setCopied] = useState(false);
    const [edited, setEdited] = useState(null); // null = texte généré
    const [transcribing, setTranscribing] = useState(null); // { done, total }
    const [summary, setSummary] = useState('');
    const [summarizing, setSummarizing] = useState(false);
    const containerRef = useModalA11y(open, onClose);

    const generated = useMemo(
        () => buildPredevisReport({
            survey,
            template,
            meta: { ...meta, voiceNotesCount: voiceNotes.length, summaryText: summary },
        }),
        [survey, template, meta, voiceNotes.length, summary]
    );
    const missing = useMemo(() => findMissingEssentials(survey, template), [survey, template]);
    const { done, total, pct } = useMemo(() => surveyCompleteness(survey, template), [survey, template]);

    if (!open) return null;

    const text = edited ?? generated;

    const handleCopy = async () => {
        onPersist?.(text); // ce qui part chez l'IA devis est aussi ce qu'on archive
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success('Compte rendu copié — collez-le dans votre IA devis.');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Copie impossible sur cet appareil.');
        }
    };

    const handleShare = async () => {
        onPersist?.(text);
        if (!navigator.share) return handleCopy();
        try {
            await navigator.share({ title: 'Compte rendu de visite prédevis', text });
        } catch (err) {
            if (err?.name !== 'AbortError') toast.error('Partage impossible sur cet appareil.');
        }
    };

    const handleDownload = () => {
        onPersist?.(text);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = predevisReportFilename(meta);
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Compte rendu téléchargé');
    };

    // Les enregistrements partent en transcription pendant la visite ; ici on
    // rattrape ceux qui n'y sont pas passés (échec, ancienne visite). Une clé
    // présente avec un texte vide est une note transcrite mais muette : elle
    // n'est pas à refaire. Une note sans audio (reprise d'un brouillon) non plus.
    const pending = voiceNotes.filter((n) => transcripts[n.id] === undefined && n.blob);
    const stillRunning = Math.min(transcribingCount, pending.length);
    const leftover = pending.length - stillRunning;

    const handleTranscribe = async () => {
        setTranscribing({ done: 0, total: pending.length });
        const collected = {};
        const failures = [];
        for (const [i, note] of pending.entries()) {
            setTranscribing({ done: i, total: pending.length });
            try {
                const { transcript } = await transcribeBlob(note.blob, note.mimeType);
                collected[note.id] = transcript;
            } catch (err) {
                failures.push(err?.message || 'Erreur inconnue');
            }
        }
        setTranscribing(null);
        const count = Object.keys(collected).length;
        if (count) {
            setEdited(null); // repartir du texte régénéré avec les transcriptions
            onTranscripts?.(collected);
            toast.success(`${count} enregistrement${count > 1 ? 's' : ''} transcrit${count > 1 ? 's' : ''}`);
        }
        if (failures.length) {
            // La vraie cause, pas un « réseau ou quota ? » : une clé absente ou
            // un fournisseur qui refuse le fichier ne se règlent pas pareil.
            toast.error(
                `${failures.length} enregistrement${failures.length > 1 ? 's' : ''} non transcrit${failures.length > 1 ? 's' : ''} : ${failures[0]}`,
                { duration: 8000 }
            );
        }
    };

    // Met la transcription brute au propre : une synthèse relisable, placée
    // en tête du compte rendu. Le détail brut reste dessous.
    const handleSummarize = async () => {
        setSummarizing(true);
        try {
            const raw = buildPredevisReport({
                survey,
                template,
                meta: { ...meta, voiceNotesCount: voiceNotes.length },
                withAiInstruction: false,
            });
            const result = await structureVisitTranscript(raw, { clientName, address });
            setSummary(result);
            setEdited(null);
            toast.success('Synthèse ajoutée en tête du compte rendu — relisez-la.');
        } catch (err) {
            toast.error(err.message || 'Mise au propre impossible pour le moment.');
        } finally {
            setSummarizing(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] sm:p-4" onClick={onClose}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Compte rendu de visite prédevis"
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* En-tête */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-violet-600 shrink-0" />
                            Compte rendu de visite
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Prêt à coller dans votre IA devis — modifiable avant envoi.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 -mt-1 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 shrink-0"
                        aria-label="Fermer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {/* Avancement du relevé */}
                    {total > 0 && (
                        <div>
                            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                                <span className="text-gray-500">Relevé complété</span>
                                <span className={pct === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                                    {done}/{total} points clés
                                </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Ce qui manque — pendant qu'on est encore sur place */}
                    {missing.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                À compléter avant de quitter le chantier
                            </p>
                            <ul className="space-y-0.5">
                                {missing.map(({ key, label }) => (
                                    <li key={key} className="text-xs text-amber-800 flex items-start gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1" />
                                        {label}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-amber-700 mt-2">
                                Ces points partent aussi dans le compte rendu, pour que l'IA les demande au lieu de les inventer.
                            </p>
                        </div>
                    )}

                    {/* Transcription des enregistrements */}
                    {stillRunning > 0 && !transcribing && (
                        <p className="flex items-center justify-center gap-2 px-4 py-3 bg-violet-50 border border-violet-200 text-violet-700 text-sm font-semibold rounded-xl">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Transcription en cours — {stillRunning} enregistrement{stillRunning > 1 ? 's' : ''} restant{stillRunning > 1 ? 's' : ''}
                        </p>
                    )}
                    {(leftover > 0 || transcribing) && (
                        <button
                            type="button"
                            onClick={handleTranscribe}
                            disabled={Boolean(transcribing)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-50 border border-violet-200 text-violet-700 text-sm font-semibold rounded-xl hover:bg-violet-100 transition-colors disabled:opacity-60"
                        >
                            {transcribing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Transcription {transcribing.done + 1}/{transcribing.total}…</>
                                : <><Mic className="w-4 h-4" /> Transcrire {leftover} enregistrement{leftover > 1 ? 's' : ''}</>}
                        </button>
                    )}

                    {/* Mise au propre par l'IA */}
                    {!pending.length && voiceNotes.length > 0 && !summary && (
                        <button
                            type="button"
                            onClick={handleSummarize}
                            disabled={summarizing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
                        >
                            {summarizing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Mise au propre en cours…</>
                                : <><Wand2 className="w-4 h-4" /> Mettre au propre (synthèse en tête)</>}
                        </button>
                    )}

                    {/* Texte du compte rendu */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Compte rendu</p>
                            {edited !== null && (
                                <button
                                    type="button"
                                    onClick={() => setEdited(null)}
                                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-violet-600"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Régénérer
                                </button>
                            )}
                        </div>
                        <textarea
                            value={text}
                            onChange={(e) => setEdited(e.target.value)}
                            rows={14}
                            spellCheck={false}
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono leading-relaxed text-gray-800 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-y"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-gray-100 space-y-2">
                    <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                        {saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement de la visite…</>
                        ) : savedReportId ? (
                            <>
                                <Archive className="w-3.5 h-3.5 text-emerald-500" />
                                Visite enregistrée avec ses photos
                                <button
                                    type="button"
                                    onClick={() => onOpenSaved?.(savedReportId)}
                                    className="text-violet-600 underline font-semibold"
                                >
                                    Voir
                                </button>
                            </>
                        ) : (
                            <><Archive className="w-3.5 h-3.5" /> Visite non encore enregistrée</>
                        )}
                    </p>
                    <button
                        onClick={handleCopy}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors active:scale-[0.98]"
                    >
                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                        {copied ? 'Copié !' : 'Copier pour mon IA devis'}
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={handleShare}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors active:scale-[0.98]"
                        >
                            <Share2 className="w-4 h-4" />
                            Partager
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors active:scale-[0.98]"
                        >
                            <Download className="w-4 h-4" />
                            Fichier .txt
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PredevisReportModal;
