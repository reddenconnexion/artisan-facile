import { useEffect, useState } from 'react';
import { Percent, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useInvalidateCache, useUserProfile } from '../hooks/useDataCache';
import { MAX_MARGIN_COEF, MIN_MARGIN_COEF, parseMarginCoefficient } from '../utils/marginCoefficient';

/**
 * Coefficient de marge par défaut, réglable là où il sert : en tête de la
 * Bibliothèque de prix. Le même réglage reste dans Profil → Tarifs, zones de
 * déplacement et IA (même champ de `profiles.ai_preferences`).
 *
 * Prix de vente = prix d'achat × coefficient : ajout d'un article, import d'un
 * tarif, « Répertorier » depuis l'approvisionnement.
 */
const MarginCoefficientSetting = () => {
    const { user } = useAuth();
    const { data: profile } = useUserProfile();
    const { invalidateProfile } = useInvalidateCache();
    const saved = profile?.default_margin_coefficient ? String(profile.default_margin_coefficient) : '';
    const [value, setValue] = useState(saved);
    const [saving, setSaving] = useState(false);

    useEffect(() => { setValue(saved); }, [saved]);

    const dirty = value.trim().replace(',', '.') !== saved.replace(',', '.');

    const handleSave = async () => {
        const coef = parseMarginCoefficient(value);
        if (coef === null) {
            toast.error(`Coefficient invalide : entre ${MIN_MARGIN_COEF} et ${MAX_MARGIN_COEF} (ex. 1,58).`);
            return;
        }
        setSaving(true);
        try {
            // Relire les préférences avant d'écrire : elles portent aussi la clé
            // API, le taux horaire, les zones… à ne pas effacer.
            const { data: current, error: readError } = await supabase
                .from('profiles')
                .select('ai_preferences')
                .eq('id', user.id)
                .single();
            if (readError) throw readError;
            const { error } = await supabase
                .from('profiles')
                .update({
                    ai_preferences: { ...(current?.ai_preferences || {}), default_margin_coefficient: String(coef) },
                    updated_at: new Date(),
                })
                .eq('id', user.id);
            if (error) throw error;
            invalidateProfile();
            setValue(String(coef));
            toast.success(`Coefficient enregistré : × ${String(coef).replace('.', ',')}`);
        } catch (err) {
            console.error('Error saving margin coefficient:', err);
            toast.error("Impossible d'enregistrer le coefficient.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mb-6 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
                <Percent className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Coefficient de marge sur le matériel</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Prix de vente = prix d'achat × coefficient, à l'ajout d'un article et à l'import d'un tarif.
                        {!saved && <span className="text-amber-700 dark:text-amber-400"> Non réglé : aucun prix de vente n'est calculé.</span>}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">×</span>
                <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Coefficient de marge"
                    placeholder="1,58"
                    value={value.replace('.', ',')}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && dirty) handleSave(); }}
                    className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg text-sm text-right focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center"
                >
                    {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    Enregistrer
                </button>
            </div>
        </div>
    );
};

export default MarginCoefficientSetting;
