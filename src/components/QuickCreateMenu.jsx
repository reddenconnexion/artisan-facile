import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, FileText, UserPlus, CalendarPlus, Wrench } from 'lucide-react';

// Raccourcis de création depuis l'accueil : l'accueil n'avait aucun bouton
// « Nouveau devis » (le bloc « Actions rapides » est masqué par défaut).
const ACTIONS = [
    { label: 'Nouveau devis', to: '/app/devis/new', Icon: FileText, tone: 'bg-blue-600' },
    { label: 'Nouveau client', to: '/app/clients/new', Icon: UserPlus, tone: 'bg-indigo-600' },
    { label: 'Nouveau RDV', to: '/app/agenda?new=1', Icon: CalendarPlus, tone: 'bg-violet-600' },
    { label: "Rapport d'intervention", to: '/app/interventions/new', Icon: Wrench, tone: 'bg-amber-600' },
];

/**
 * Bouton « + » flottant de l'accueil : un tap ouvre les 4 créations
 * courantes, un second tap lance l'action.
 */
const QuickCreateMenu = () => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <>
            {open && (
                <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />
            )}
            <div className="fixed bottom-[4.5rem] nav:bottom-6 left-4 nav:left-auto nav:right-6 z-40 flex flex-col items-start nav:items-end gap-2">
                {open && (
                    <div role="menu" aria-label="Créer" className="flex flex-col items-start nav:items-end gap-2 mb-1">
                        {ACTIONS.map(({ label, to, Icon, tone }) => (
                            <button
                                key={to}
                                type="button"
                                role="menuitem"
                                onClick={() => { setOpen(false); navigate(to); }}
                                className="flex items-center gap-3 pl-1.5 pr-4 py-1.5 rounded-full bg-white dark:bg-gray-800 shadow-lg text-sm font-semibold text-gray-900 dark:text-white active:scale-95 transition-transform"
                            >
                                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${tone}`}>
                                    <Icon className="w-4 h-4" />
                                </span>
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-expanded={open}
                    aria-label={open ? 'Fermer le menu de création' : 'Créer'}
                    className="flex items-center gap-2 pl-3 pr-4 py-3 text-white rounded-full shadow-lg transition-all active:scale-95 bg-[#007AFF] hover:bg-[#0066d6]"
                >
                    {open ? <X className="w-5 h-5 shrink-0" /> : <Plus className="w-5 h-5 shrink-0" />}
                    <span className="text-sm font-semibold">{open ? 'Fermer' : 'Créer'}</span>
                </button>
            </div>
        </>
    );
};

export default QuickCreateMenu;
