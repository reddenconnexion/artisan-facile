import React, { useState, useEffect } from 'react';
import { Plus, Search, Truck, Calendar, CheckCircle, AlertTriangle, Trash2, X } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { format, isPast, addDays, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

const Rentals = () => {
    const { user } = useAuth();
    const [rentals, setRentals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('active'); // 'active', 'returned', 'all'
    const [showModal, setShowModal] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        equipment_name: '',
        supplier: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        cost: '',
        notes: ''
    });

    useEffect(() => {
        if (user) fetchRentals();
    }, [user]);

    const fetchRentals = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('project_rentals')
                .select('*')
                .eq('user_id', user.id)
                .order('start_date', { ascending: false });

            if (error) throw error;
            setRentals(data || []);
        } catch (error) {
            console.error('Error fetching rentals:', error);
            toast.error("Erreur lors du chargement des locations");
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('project_rentals')
                .insert([{
                    user_id: user.id,
                    ...formData,
                    status: 'active'
                }]);

            if (error) throw error;

            toast.success("Location ajoutée");
            setShowModal(false);
            setFormData({
                equipment_name: '',
                supplier: '',
                start_date: new Date().toISOString().split('T')[0],
                end_date: '',
                cost: '',
                notes: ''
            });
            fetchRentals();
        } catch (error) {
            toast.error("Erreur lors de l'ajout");
        }
    };

    const handleReturn = async (id) => {
        if (!window.confirm("Marquer ce matériel comme rendu ?")) return;
        try {
            const { error } = await supabase
                .from('project_rentals')
                .update({ status: 'returned', end_date: new Date().toISOString().split('T')[0] })
                .eq('id', id);

            if (error) throw error;
            toast.success("Matériel rendu");
            fetchRentals();
        } catch (error) {
            toast.error("Erreur lors de la mise à jour");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Supprimer cette location ?")) return;
        try {
            const { error } = await supabase
                .from('project_rentals')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchRentals();
            toast.success("Supprimé");
        } catch (error) {
            toast.error("Erreur de suppression");
        }
    };

    const filteredRentals = rentals.filter(r => {
        if (filter === 'active') return r.status === 'active';
        if (filter === 'returned') return r.status === 'returned';
        return true;
    });

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Truck className="w-8 h-8 mr-3 text-blue-600" />
                        Locations de Matériel
                    </h1>
                    <p className="text-gray-500 mt-1">Suivez vos locations en cours et à rendre.</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouvelle Location
                </button>
            </div>

            {/* Filters */}
            <div className="flex space-x-2 border-b border-gray-200">
                {['active', 'returned', 'all'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filter === f
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {f === 'active' ? 'En cours' : f === 'returned' ? 'Terminés' : 'Tout'}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="grid gap-4">
                {loading ? (
                    <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : filteredRentals.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                        <Truck className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">Aucune location trouvée.</p>
                    </div>
                ) : (
                    filteredRentals.map((rental) => {
                        const isLate = rental.status === 'active' && rental.end_date && isPast(new Date(rental.end_date)) && !differenceInDays(new Date(), new Date(rental.end_date)) === 0;

                        return (
                            <div key={rental.id} className={`bg-white rounded-xl p-6 border shadow-sm transition-all hover:shadow-md ${isLate ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-3 rounded-lg ${rental.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                            <Truck className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg text-gray-900">{rental.equipment_name}</h3>
                                            <div className="flex items-center text-sm text-gray-600 mt-1 gap-4">
                                                <span className="flex items-center">
                                                    <span className="font-medium mr-1">Fournisseur :</span> {rental.supplier || 'N/A'}
                                                </span>
                                                {rental.cost && (
                                                    <span>
                                                        {rental.cost}€
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className={`flex items-center text-sm ${isLate ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
                                                    <Calendar className="w-4 h-4 mr-1" />
                                                    {format(new Date(rental.start_date), 'dd/MM/yyyy')}
                                                    {rental.end_date && ` → ${format(new Date(rental.end_date), 'dd/MM/yyyy')}`}
                                                </div>
                                                {rental.status === 'active' && rental.end_date && (
                                                    <div className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                        J-{differenceInDays(new Date(rental.end_date), new Date())}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {rental.status === 'active' && (
                                            <button
                                                onClick={() => handleReturn(rental.id)}
                                                className="flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Marquer rendu
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(rental.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold">Nouvelle Location</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Matériel</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="ex: Mini-pelle 2.5T"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    value={formData.equipment_name}
                                    onChange={e => setFormData({ ...formData, equipment_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                                <input
                                    type="text"
                                    placeholder="ex: Kiloutou"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    value={formData.supplier}
                                    onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Début</label>
                                    <input
                                        type="date"
                                        required
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        value={formData.start_date}
                                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fin prévue</label>
                                    <input
                                        type="date"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        value={formData.end_date}
                                        onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coût (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    value={formData.cost}
                                    onChange={e => setFormData({ ...formData, cost: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                            >
                                Ajouter
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Rentals;
