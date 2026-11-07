import { useRef, useState } from 'react';
import { Pencil, Loader2, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { buildReviewRequestEmail, DEFAULT_REVIEW_BODY, DEFAULT_REVIEW_SUBJECT } from '../utils/autopilot';

const PLACEHOLDERS = [
    { tag: '{client}', label: 'Nom du client', example: 'Mme Dupont' },
    { tag: '{chantier}', label: 'Intitulé du devis', example: '« Remplacement du tableau »' },
    { tag: '{lien}', label: "Lien d'avis Google", example: 'votre lien' },
    { tag: '{entreprise}', label: 'Votre entreprise', example: '' },
];

const SAMPLE_CLIENT = { name: 'Mme DUPONT' };
const SAMPLE_DOC = { title: 'Remplacement du tableau électrique' };

/**
 * Message de la demande d'avis Google envoyée en fin de chantier : l'artisan
 * l'écrit une fois, l'appli remplace les repères pour chaque client.
 */
const ReviewTemplateEditor = ({ settings, save, profile }) => {
    const custom = Boolean(settings.review_subject || settings.review_body);
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const bodyRef = useRef(null);

    const start = () => {
        setSubject(settings.review_subject || DEFAULT_REVIEW_SUBJECT);
        setBody(settings.review_body || DEFAULT_REVIEW_BODY);
        setOpen(true);
    };

    const insert = (tag) => {
        const el = bodyRef.current;
        if (!el) { setBody((b) => b + tag); return; }
        const { selectionStart = body.length, selectionEnd = body.length } = el;
        const next = body.slice(0, selectionStart) + tag + body.slice(selectionEnd);
        setBody(next);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(selectionStart + tag.length, selectionStart + tag.length);
        });
    };

    const persist = async (patch, message) => {
        setBusy(true);
        try {
            await save(patch);
            toast.success(message);
            setOpen(false);
        } catch (e) {
            toast.error('Message non enregistré : ' + e.message);
        } finally {
            setBusy(false);
        }
    };

    const preview = buildReviewRequestEmail(SAMPLE_DOC, {
        client: SAMPLE_CLIENT,
        profile,
        reviewUrl: profile?.google_review_url || 'https://g.page/r/votre-lien/review',
        settings: { review_subject: subject, review_body: body },
    });

    if (!open) {
        return (
            <button type="button" onClick={start} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                <Pencil size={12} />
                {custom ? 'Modifier mon message de demande d\'avis' : 'Modifier le message envoyé au client'}
            </button>
        );
    }

    return (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2.5">
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
                    rows={9}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white font-sans"
                />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Insérer :</span>
                {PLACEHOLDERS.map((p) => (
                    <button
                        key={p.tag}
                        type="button"
                        onClick={() => insert(p.tag)}
                        className="px-2 py-1 text-xs font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100"
                        title={p.tag}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
                Les repères entre accolades sont remplacés pour chaque client. Votre signature est ajoutée à la fin. Si vous retirez {'{lien}'}, le lien d'avis est remis en bas du message.
            </p>

            <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1.5">
                    <Eye size={12} /> Ce que recevra le client (exemple)
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{preview.subject}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line [overflow-wrap:anywhere]">{preview.body.replace(/\n\n-- \n[\s\S]*$/, '')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy || !body.trim()}
                    onClick={() => persist({ review_subject: subject.trim(), review_body: body.trim() }, "Message enregistré : c'est lui qui partira à la fin de vos chantiers.")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                    {busy && <Loader2 size={14} className="animate-spin" />} Enregistrer
                </button>
                <button type="button" onClick={() => setOpen(false)} className="px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Annuler
                </button>
                {custom && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => persist({ review_subject: null, review_body: null }, "Message de l'appli rétabli.")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <RotateCcw size={14} /> Message de l'appli
                    </button>
                )}
            </div>
        </div>
    );
};

export default ReviewTemplateEditor;
