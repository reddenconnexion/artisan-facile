import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, FileText, Zap } from 'lucide-react';

const actions = [
    {
        label: 'Nouveau devis',
        shortcut: 'Alt+D',
        icon: FileText,
        color: 'bg-blue-600 hover:bg-blue-700',
        iconColor: 'text-white',
        path: '/app/devis/new',
    },
    {
        label: 'Nouveau client',
        shortcut: 'Alt+C',
        icon: Users,
        color: 'bg-emerald-600 hover:bg-emerald-700',
        iconColor: 'text-white',
        path: '/app/clients/new',
    },
    {
        label: 'Nouveau RDV',
        shortcut: 'Alt+R',
        icon: Calendar,
        color: 'bg-violet-600 hover:bg-violet-700',
        iconColor: 'text-white',
        path: '/app/agenda',
        state: { openNewEvent: true },
    },
];

const QuickActions = () => {
    const navigate = useNavigate();

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions rapides</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
                {actions.map((action) => (
                    <button
                        key={action.label}
                        onClick={() => navigate(action.path, action.state ? { state: action.state } : undefined)}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-medium text-white transition-all shadow-sm hover:shadow-md active:scale-95 ${action.color}`}
                        title={`${action.label} (${action.shortcut})`}
                    >
                        <action.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{action.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QuickActions;
