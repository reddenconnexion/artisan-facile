import React, { useState } from 'react';
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
        <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-900/40 space-y-3">
            <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">Précisions pour affiner le devis</p>
                    <p className="text-xs text-sky-700 dark:text-sky-300">
                        Répondez à ce que vous savez, en une fois. Le reste garde l'hypothèse de l'IA.
                    </p>
                </div>
            </div>

            {questions.map((q, i) => (
                <label key={i} className="block">
                    <span className="block text-sm text-gray-800 dark:text-gray-200 mb-1">{q}</span>
                    <input
                        type="text"
                        value={answers[i] || ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                        disabled={loading}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-sky-200 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                </label>
            ))}

            <button
                type="button"
                onClick={submit}
                disabled={loading || answeredCount === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold disabled:opacity-50 active:bg-sky-700"
            >
                {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Affinage en cours…</>
                    : <><Sparkles className="w-4 h-4" /> Affiner le devis ({answeredCount}/{questions.length})</>}
            </button>
        </div>
    );
};

export default VisitQuestionsCard;
