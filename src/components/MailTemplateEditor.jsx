import { useRef, useState } from 'react';
import { Pencil, Loader2, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Éditeur d'un modèle de mail (objet + message) avec repères à insérer et
 * aperçu en direct sur un exemple. Le parent fournit les valeurs, le rendu
 * de l'aperçu et l'enregistrement.
 *
 * @param {object} p
 * @param {string} p.buttonLabel           libellé du lien qui ouvre l'éditeur
 * @param {boolean} p.customized           l'artisan a déjà écrit son modèle
 * @param {{subject: string, body: string}} p.initial  valeurs à l'ouverture
 * @param {{tag: string, label: string}[]} p.placeholders
 * @param {(v: {subject: string, body: string}) => {subject: string, body: string}} p.renderPreview
 * @param {(v: {subject: string, body: string}) => Promise<void>} p.onSave
 * @param {() => Promise<void>} p.onReset  revenir au modèle de l'appli
 * @param {string} [p.help]
 * @param {string} [p.title]           titre affiché en haut de l'éditeur ouvert
 */
const MailTemplateEditor = ({ buttonLabel, customized, initial, placeholders, renderPreview, onSave, onReset, help, title }) => {
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const bodyRef = useRef(null);

    const start = () => {
        setSubject(initial.subject);
        setBody(initial.body);
        setOpen(true);
    };

    const insert = (tag) => {
        const el = bodyRef.current;
        if (!el) { setBody((b) => b + tag); return; }
        const { selectionStart = body.length, selectionEnd = body.length } = el;
        setBody(body.slice(0, selectionStart) + tag + body.slice(selectionEnd));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(selectionStart + tag.length, selectionStart + tag.length);
        });
    };

    const run = async (fn, message) => {
        setBusy(true);
        try {
            await fn();
            toast.success(message);
            setOpen(false);
        } catch (e) {
            toast.error('Message non enregistré : ' + e.message);
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button type="button" onClick={start} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline text-left">
                <Pencil size={12} className="shrink-0" />
                {buttonLabel}
                {customized && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] font-semibold">personnalisé</span>}
            </button>
        );
    }

    const preview = renderPreview({ subject, body });

    return (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2.5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Pencil size={14} /> {title || buttonLabel}
            </p>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Objet
                <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Message
                <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white font-sans"
                />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Insérer :</span>
                {placeholders.map((p) => (
                    <button
                        key={p.tag}
                        type="button"
                        onClick={() => insert(p.tag)}
                        title={p.tag}
                        className="px-2 py-1 text-xs font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100"
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
                Les repères entre accolades sont remplacés pour chaque client. Votre signature est ajoutée à la fin.{help ? ` ${help}` : ''}
            </p>

            <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1.5">
                    <Eye size={12} /> Ce que recevra le client (exemple)
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 [overflow-wrap:anywhere]">{preview.subject}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line [overflow-wrap:anywhere]">{preview.body.replace(/\n\n-- \n[\s\S]*$/, '')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy || !body.trim()}
                    onClick={() => run(() => onSave({ subject: subject.trim(), body: body.trim() }), 'Message enregistré : c\'est lui qui partira.')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                    {busy && <Loader2 size={14} className="animate-spin" />} Enregistrer
                </button>
                <button type="button" onClick={() => setOpen(false)} className="px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                </button>
                {customized && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(onReset, "Message de l'appli rétabli.")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <RotateCcw size={14} /> Message de l'appli
                    </button>
                )}
            </div>
        </div>
    );
};

export default MailTemplateEditor;
