import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Kanban } from 'lucide-react';
import Clients from './Clients';
import WorksitePilot from './CRM';

const TABS = [
    { id: 'clients', label: 'Mes clients', icon: Users, Component: Clients },
    { id: 'worksites', label: 'Chantiers', icon: Kanban, Component: WorksitePilot },
];

const ClientsHub = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get('view');
    const activeId = TABS.some(t => t.id === requested) ? requested : 'clients';
    const ActiveComponent = TABS.find(t => t.id === activeId).Component;

    const handleSelect = (tabId) => {
        if (tabId === activeId) return;
        if (tabId === 'clients') {
            searchParams.delete('view');
        } else {
            searchParams.set('view', tabId);
        }
        setSearchParams(searchParams, { replace: true });
    };

    return (
        <div className="space-y-6">
            <div className="inline-flex items-center gap-1 p-1 bg-gray-200/70 dark:bg-white/10 rounded-xl overflow-x-auto max-w-full">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeId === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleSelect(tab.id)}
                            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium whitespace-nowrap rounded-lg transition-all ${
                                isActive
                                    ? 'bg-white dark:bg-[#1c1c1e] text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <ActiveComponent />
        </div>
    );
};

export default ClientsHub;
