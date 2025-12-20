
import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { Calendar, Wrench, AlertTriangle, CheckCircle, Search, Filter } from 'lucide-react';
import { format, addMonths, isBefore, isAfter, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

const Maintenance = () => {
    const { user } = useAuth();
    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({ total: 0, due: 0, late: 0 });

    useEffect(() => {
        if (user) {
            fetchContracts();

            // Realtime subscription
            const subscription = supabase
                .channel('maintenance_contracts_subscription')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'maintenance_contracts' },
                    () => {
                        fetchContracts();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
            };
        }
    }, [user]);

    const fetchContracts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('maintenance_contracts')
                .select(`
                    *,
                    clients (name, phone, address, city)
                `)
                .order('next_maintenance_date', { ascending: true });

            if (error) throw error;

            setContracts(data || []);

            // Calculate stats
            const now = new Date();
            const due = data.filter(c => {
                if (!c.next_maintenance_date) return false;
                const date = parseISO(c.next_maintenance_date);
                // Due if within next 30 days OR late
                const thirtyDaysFromNow = addMonths(now, 1);
                return isBefore(date, thirtyDaysFromNow);
            }).length;

            const late = data.filter(c => {
                if (!c.next_maintenance_date) return false;
                // Late if date is passed
                return isBefore(parseISO(c.next_maintenance_date), now);
            }).length;

            setStats({
                total: data.length,
                due,
                late
            });

        } catch (error) {
            console.error('Error fetching contracts:', error);
            toast.error('Erreur lors du chargement des contrats');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateCertificate = (contract) => {
        // Placeholder for certificate generation
        toast.info("Génération de l'attestation en cours... (Fonctionnalité complète à venir)");
    };

    const filteredContracts = contracts.filter(c =>
        c.equipment_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.clients.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Suivi Maintenance</h1>
                    <p className="text-gray-500">Gérez vos contrats d'entretien et rappels.</p>
                </div>
                {/* Add Contract Button could go here (linking to Client Form modal) */}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Contrats Actifs</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                        </div>
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <Wrench className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">À prévoir (30j)</p>
                            <p className="text-2xl font-bold text-orange-600 mt-1">{stats.due}</p>
                        </div>
                        <div className="p-3 bg-orange-100 rounded-lg">
                            <Calendar className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">En retard</p>
                            <p className="text-2xl font-bold text-red-600 mt-1">{stats.late}</p>
                        </div>
                        <div className="p-3 bg-red-100 rounded-lg">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Rechercher un client ou un équipement..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="flex items-center px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <Filter className="w-4 h-4 mr-2" />
                    Filtres
                </button>
            </div>

            {/* Contracts List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Client</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Équipement</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Dernière Visite</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Prochaine Visite</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="5" className="p-8 text-center">Chargement...</td></tr>
                        ) : filteredContracts.length === 0 ? (
                            <tr><td colSpan="5" className="p-8 text-center text-gray-500">Aucun contrat trouvé.</td></tr>
                        ) : (
                            filteredContracts.map(contract => {
                                const nextDate = contract.next_maintenance_date ? parseISO(contract.next_maintenance_date) : null;
                                const isLate = nextDate && isBefore(nextDate, new Date());
                                const isDueSoon = nextDate && isBefore(nextDate, addMonths(new Date(), 1));

                                return (
                                    <tr key={contract.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{contract.clients.name}</div>
                                            <div className="text-xs text-gray-500">{contract.clients.city}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{contract.equipment_name}</div>
                                            <div className="text-xs text-gray-500">{contract.serial_number || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {contract.last_maintenance_date ? format(parseISO(contract.last_maintenance_date), 'dd MMM yyyy', { locale: fr }) : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {nextDate ? (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isLate ? 'bg-red-100 text-red-800' :
                                                    isDueSoon ? 'bg-orange-100 text-orange-800' :
                                                        'bg-green-100 text-green-800'
                                                    }`}>
                                                    {format(nextDate, 'dd MMM yyyy', { locale: fr })}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleGenerateCertificate(contract)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                            >
                                                Attestation
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Maintenance;
