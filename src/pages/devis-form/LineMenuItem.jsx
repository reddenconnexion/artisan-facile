import { Check } from 'lucide-react';

// Entrée du menu « ⋯ » d'une ligne de devis.
const LineMenuItem = ({ icon, label, onClick, disabled = false, active = false }) => {
    const Icon = icon;
    return (
    <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-200'}`}
    >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{label}</span>
        {active && <Check className="w-4 h-4 shrink-0" />}
    </button>
    );
};

export default LineMenuItem;
