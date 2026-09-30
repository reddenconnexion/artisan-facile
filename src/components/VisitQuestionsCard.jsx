import { useState } from 'react';
import { HelpCircle, Loader2, Sparkles } from 'lucide-react';

/**
 * Précisions demandées par l'IA après le premier chiffrage d'une visite.
 * L'artisan répond à tout en une seule passe, puis le devis est recalculé
 * (sans nouvelle question : voir ANSWERS_INSTRUCTION dans utils/quoteMethod).
 * Les questions laissées vides restent traitées sur hypothèse.
 */
const VisitQuestionsCard = ({ questions, onSubmit, loading = false }) => {
    const [answers, setAnswers] = useState({});

    if (!questions?.length) return null;

    const answeredCount = questions.filter((_, i) => String(answers[i] ?? '').trim()).length;

    const submit = () => {
        onSubmit(questions.map((question, i) => ({ question, answer: answers[i] || '' })));
    };

    return (
        // Couleurs fixes, sans variante dark : la visite technique reste en thème
        // clair même quand le téléphone est en mode sombre, et un fond teinté
        // semi-transparent y rendait le texte illisible.
        <div className="p-4 rounded-2xl border-2 border-sky-300 bg-white shadow-sm space-y-3">
            <div className="flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-base font-bold text-gray-900">Précisions pour affiner le devis</p>
                    <p className="text-sm text-gray-600">
                        Répondez à ce que vous savez, en une fois. Le reste garde l'hypothèse de l'IA.
                    </p>
                </div>
            </div>

            {questions.map((q, i) => (
                <label key={i} className="block">
                    <span className="block text-sm font-medium text-gray-900 mb-1">{q}</span>
                    <input
                        type="text"
                        value={answers[i] || ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                        disabled={loading}
                        className="w-full px-3 py-2.5 text-base rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                </label>
            ))}

            <button
                type="button"
                onClick={submit}
                disabled={loading || answeredCount === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-700 text-white text-sm font-semibold disabled:bg-gray-300 disabled:text-gray-600 active:bg-sky-800"
            >
                {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Affinage en cours…</>
                    : <><Sparkles className="w-4 h-4" /> Affiner le devis ({answeredCount}/{questions.length})</>}
            </button>
        </div>
    );
};

export default VisitQuestionsCard;
