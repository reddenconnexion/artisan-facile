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
            <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 -mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeId === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleSelect(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                isActive
                                    ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
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
