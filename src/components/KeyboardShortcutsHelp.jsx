import React from 'react';
import { X, Keyboard } from 'lucide-react';

const Kbd = ({ children }) => (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm">
        {children}
    </kbd>
);

const SECTIONS = [
    {
        title: 'Création rapide',
        items: [
            { keys: [['Alt', 'D']], description: 'Nouveau devis' },
            { keys: [['Alt', 'C']], description: 'Nouveau client' },
            { keys: [['Alt', 'R']], description: 'Nouveau rendez-vous' },
            { keys: [['Alt', 'I']], description: "Nouveau rapport d'intervention" },
            { keys: [['n']], description: "Nouveau (selon la page : devis, client, rapport…)" },
        ],
    },
    {
        title: 'Navigation',
        items: [
            { keys: [['Alt', 'H']], description: 'Tableau de bord' },
            { keys: [['g'], ['h']], description: 'Tableau de bord (chord)' },
            { keys: [['g'], ['d']], description: 'Devis & factures' },
            { keys: [['g'], ['c']], description: 'Clients' },
            { keys: [['g'], ['a']], description: 'Agenda' },
        ],
    },
    {
        title: 'Recherche & navigation rapide',
        items: [
            { keys: [['/']], description: 'Placer le curseur dans la barre de recherche' },
            { keys: [['Échap']], description: 'Fermer la modal ouverte ou effacer la recherche' },
            { keys: [['?']], description: 'Afficher / masquer cette aide' },
        ],
    },
];

const KeyboardShortcutsHelp = ({ open, onClose }) => {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Raccourcis clavier"
        >
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Keyboard className="w-5 h-5 text-blue-600" />
                        Raccourcis clavier
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        aria-label="Fermer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="overflow-y-auto p-5 space-y-5">
                    {SECTIONS.map(({ title, items }) => (
                        <div key={title}>
                            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                                {title}
                            </h3>
                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex items-start justify-between gap-4">
                                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                                            {item.description}
                                        </span>
                                        <span className="flex items-center gap-1.5 flex-shrink-0">
                                            {item.keys.map((group, gi) => (
                                                <React.Fragment key={gi}>
                                                    {gi > 0 && (
                                                        <span className="text-gray-300 dark:text-gray-600 text-xs">
                                                            puis
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        {group.map((k, ki) => (
                                                            <React.Fragment key={ki}>
                                                                {ki > 0 && (
                                                                    <span className="text-gray-400 text-xs">+</span>
                                                                )}
                                                                <Kbd>{k}</Kbd>
                                                            </React.Fragment>
                                                        ))}
                                                    </span>
                                                </React.Fragment>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 text-center">
                    Les raccourcis sont désactivés quand le curseur est dans un champ.
                </div>
            </div>
        </div>
    );
};

export default KeyboardShortcutsHelp;
