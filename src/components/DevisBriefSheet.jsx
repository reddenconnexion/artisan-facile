import { useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Copy, Share2, ExternalLink, RefreshCw, FileText, Settings2 } from 'lucide-react';
import { isClaudeProjectUrl } from '../utils/devisBrief';

/** Copie dans le presse-papier, avec repli pour les navigateurs sans API Clipboard. */
const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        document.body.removeChild(area);
        return ok;
    }
};

/**
 * Résumé de la visite prêt pour le devis : les points utiles au chiffrage,
 * à coller dans le projet Claude où l'artisan fait ses devis. Le texte reste
 * modifiable avant l'envoi ; « Copier et ouvrir » enchaîne le presse-papier
 * et l'ouverture du projet, il ne reste qu'à coller.
 */
const DevisBriefSheet = ({
    open, onClose, text, onChange, loading, onRegenerate, projectUrl, onSaveProjectUrl,
}) => {
    const [editingUrl, setEditingUrl] = useState(false);
    const [urlDraft, setUrlDraft] = useState('');
    const [savingUrl, setSavingUrl] = useState(false);

    if (!open) return null;

    const hasText = Boolean(String(text ?? '').trim());
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const handleCopy = async () => {
        if (await copyText(text)) toast.success('Résumé copié — collez-le dans votre projet devis.');
        else toast.error('Copie impossible — sélectionnez le texte à la main.');
    };

    const handleShare = async () => {
        try {
            await navigator.share({ title: 'Résumé de visite pour devis', text });
        } catch (err) {
            if (err?.name !== 'AbortError') handleCopy();
        }
    };

    const handleCopyAndOpen = async () => {
        // La fenêtre s'ouvre dans le geste de l'utilisateur (sinon bloquée),
        // la copie suit.
        window.open(projectUrl, '_blank', 'noopener');
        if (await copyText(text)) toast.success('Résumé copié — collez-le dans la conversation du projet.');
        else toast.error('Copie impossible — sélectionnez le texte à la main.');
    };

    const startEditUrl = () => {
        setUrlDraft(projectUrl || '');
        setEditingUrl(true);
    };

    const saveUrl = async () => {
        const value = urlDraft.trim();
        if (value && !isClaudeProjectUrl(value)) {
            toast.error('Collez le lien de votre projet tel qu\'il apparaît dans claude.ai (https://claude.ai/project/…).');
            return;
        }
        setSavingUrl(true);
        try {
            await onSaveProjectUrl(value);
            setEditingUrl(false);
            toast.success(value ? 'Lien du projet enregistré.' : 'Lien du projet retiré.');
        } catch (err) {
            toast.error(err?.message || 'Enregistrement impossible.');
        } finally {
            setSavingUrl(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-t-3xl max-h-[92vh] flex flex-col safe-area-bottom"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Résumé pour devis"
            >
                <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 leading-tight">Résumé pour devis</p>
                        <p className="text-xs text-gray-500">Les points utiles au chiffrage — modifiable avant envoi</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-xl" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading && !hasText ? (
                        <div className="flex flex-col items-center gap-3 py-12 text-violet-700">
                            <Loader2 className="w-7 h-7 animate-spin" />
                            <p className="text-sm font-semibold">Rédaction du résumé…</p>
                            <p className="text-xs text-gray-500 text-center">Relevé, notes vocales et photos sont relus pour ne garder que ce qui sert au devis.</p>
                        </div>
                    ) : (
                        <textarea
                            value={text}
                            onChange={(e) => onChange(e.target.value)}
                            rows={16}
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm leading-relaxed font-mono focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            placeholder="Le résumé apparaîtra ici."
                        />
                    )}

                    <div className="flex items-center justify-between gap-2">
                        <button
                            onClick={onRegenerate}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {hasText ? 'Régénérer' : 'Générer'}
                        </button>
                        {!editingUrl && (
                            <button onClick={startEditUrl} className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Settings2 className="w-3.5 h-3.5" />
                                {projectUrl ? 'Lien du projet Claude' : 'Relier mon projet Claude'}
                            </button>
                        )}
                    </div>

                    {editingUrl && (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                            <p className="text-xs text-gray-600">
                                Lien de votre projet de devis dans Claude (ouvrez le projet sur claude.ai et copiez l'adresse).
                            </p>
                            <input
                                type="url"
                                value={urlDraft}
                                onChange={(e) => setUrlDraft(e.target.value)}
                                placeholder="https://claude.ai/project/…"
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={saveUrl}
                                    disabled={savingUrl}
                                    className="flex-1 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                                >
                                    {savingUrl ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                                <button
                                    onClick={() => setEditingUrl(false)}
                                    className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 space-y-2">
                    {projectUrl && (
                        <button
                            onClick={handleCopyAndOpen}
                            disabled={!hasText || loading}
                            className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl disabled:opacity-50"
                        >
                            <ExternalLink className="w-5 h-5" />
                            Copier et ouvrir mon projet devis
                        </button>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={handleCopy}
                            disabled={!hasText || loading}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 font-semibold rounded-xl disabled:opacity-50 ${
                                projectUrl ? 'border border-gray-300 text-gray-700' : 'bg-violet-600 hover:bg-violet-700 text-white'
                            }`}
                        >
                            <Copy className="w-4 h-4" />
                            Copier
                        </button>
                        {canShare && (
                            <button
                                onClick={handleShare}
                                disabled={!hasText || loading}
                                className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl disabled:opacity-50"
                            >
                                <Share2 className="w-4 h-4" />
                                Partager
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevisBriefSheet;
