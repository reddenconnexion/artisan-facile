import { Link } from 'react-router-dom';
import { BarChart3, MessageSquarePlus, LineChart, ChevronRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../constants/admin';
import { useNewFeedbackCount } from '../../hooks/useDataCache';

// Pilotage de la plateforme (statistiques, retours des artisans) : sorti du
// menu du quotidien, il n'apparaît que dans Réglages › Application et
// seulement pour l'administrateur.
const LINKS = [
    { to: '/app/admin', icon: BarChart3, label: 'Statistiques', hint: "Qui utilise l'application" },
    { to: '/app/admin/feedback', icon: MessageSquarePlus, label: 'Retours artisans', hint: 'Bugs et idées envoyés par les artisans', badge: true },
    { to: '/app/admin/reports', icon: LineChart, label: 'Rapports hebdo', hint: 'Synthèse hebdomadaire des retours' },
];

const AdminSection = () => {
    const { user } = useAuth();
    const newFeedbackCount = useNewFeedbackCount();
    if (!isAdmin(user)) return null;

    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <ShieldCheck className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                    Administration
                </h3>
                <div className="space-y-3">
                    {LINKS.map(({ to, icon: Icon, label, hint, badge }) => (
                        <Link
                            key={to}
                            to={to}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                            <span className="flex items-center gap-3">
                                <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                <span>
                                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>
                                </span>
                            </span>
                            <span className="flex items-center gap-2">
                                {badge && newFeedbackCount > 0 && (
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {newFeedbackCount > 9 ? '9+' : newFeedbackCount}
                                    </span>
                                )}
                                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminSection;
