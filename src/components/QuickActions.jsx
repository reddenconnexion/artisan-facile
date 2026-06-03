import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useFrequentShortcuts } from '../hooks/useUsageTracking';

/**
 * Panneau « Actions rapides » adaptatif : il remonte automatiquement les pages
 * et actions les plus utilisées de l'artisan (voir useUsageTracking). Aucun
 * réglage manuel — le classement suit l'usage réel et se réordonne tout seul.
 */
const QuickActions = () => {
    const navigate = useNavigate();
    const shortcuts = useFrequentShortcuts(4);

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-gray-200/70 dark:border-white/10 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-[#007AFF]" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions rapides</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 normal-case font-normal">· d'après votre utilisation</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {shortcuts.map((action) => (
                    <button
                        key={action.id}
                        onClick={() => navigate(action.path)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100/70 dark:bg-white/5 hover:bg-gray-200/70 dark:hover:bg-white/10 transition-all active:scale-95"
                        title={action.label}
                    >
                        <span className={`p-1.5 rounded-lg flex-shrink-0 ${action.color}`}>
                            <action.icon className="w-4 h-4" />
                        </span>
                        <span className="truncate">{action.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QuickActions;
