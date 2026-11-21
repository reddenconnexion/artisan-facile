import { useState } from 'react';
import { Zap, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const OPTIONS = [
    {
        value: 'auto',
        icon: Zap,
        title: 'Envoi automatique',
        text: "Relances et demandes d'avis partent seules : les relances aux dates prévues, la demande d'avis à la fin du chantier.",
    },
    {
        value: 'validation',
        icon: ShieldCheck,
        title: 'Après ma vérification',
        text: "L'appli prépare relances et demandes d'avis ; elles attendent votre feu vert dans l'écran Pilote. Rien ne part sans vous.",
    },
];

/**
 * Choix du mode d'envoi des relances de devis, rappels de factures et
 * demandes d'avis :
 * automatique, ou après vérification par l'artisan.
 */
const RelancesModeChoice = ({ settings, save, disabled = false }) => {
    const [saving, setSaving] = useState(false);
    const current = settings.relances_mode === 'validation' ? 'validation' : 'auto';

    const choose = async (value) => {
        if (value === current || saving) return;
        setSaving(true);
        try {
            await save({ relances_mode: value });
            toast.success(value === 'validation'
                ? "Relances et demandes d'avis attendront votre feu vert dans l'écran Pilote."
                : "Relances et demandes d'avis partiront automatiquement.");
        } catch (e) {
            toast.error('Réglage non enregistré : ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <fieldset disabled={disabled || saving}>
            <legend className="text-sm font-medium text-gray-800 dark:text-gray-100">Envoi des relances et des demandes d'avis</legend>
            <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
                {OPTIONS.map(({ value, icon: Icon, title, text }) => {
                    const selected = current === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => choose(value)}
                            className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-60 ${selected
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                        >
                            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                <Icon size={16} className={selected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
                                {title}
                            </span>
                            <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">{text}</span>
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
};

export default RelancesModeChoice;
