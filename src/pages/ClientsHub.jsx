import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Kanban } from 'lucide-react';
import Clients from './Clients';
import WorksitePilot from './CRM';
import { SegmentedControl } from '../components/ui';

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
            <SegmentedControl
                options={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
                value={activeId}
                onChange={handleSelect}
            />

            <ActiveComponent />
        </div>
    );
};

export default ClientsHub;
