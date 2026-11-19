import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { REVIEW_PLATFORMS } from '../utils/autopilot';

/**
 * Fiche client : plateformes où le client a déjà laissé un avis. Le pilote
 * ne lui en redemande pas sur celles-ci et propose la suivante (Google,
 * Facebook, PagesJaunes) à son prochain chantier.
 * Enregistré au clic, hors du formulaire de la fiche.
 */
const ClientReviewsLeft = ({ clientId, initial = [] }) => {
    const [left, setLeft] = useState(() => (Array.isArray(initial) ? initial : []));
    const [saving, setSaving] = useState(false);

    const toggle = async (key) => {
        const previous = left;
        const next = left.includes(key) ? left.filter((k) => k !== key) : [...left, key];
        setLeft(next);
        setSaving(true);
        const { error } = await supabase.from('clients').update({ reviews_left: next }).eq('id', clientId);
        setSaving(false);
        if (error) {
            setLeft(previous);
            toast.error('Réglage non enregistré : ' + error.message);
        }
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Star size={14} className="text-amber-500" /> Avis déjà laissés par ce client
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Au prochain chantier, l'appli ne lui redemandera pas d'avis sur ces plateformes et proposera la suivante.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {REVIEW_PLATFORMS.map(({ key, label }) => {
                    const checked = left.includes(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            disabled={saving}
                            onClick={() => toggle(key)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors disabled:opacity-60 ${checked
                                ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300 dark:border-green-600'
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                        >
                            {checked ? '✓ ' : ''}{label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ClientReviewsLeft;
