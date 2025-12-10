
import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Trash2, Plus, GripVertical, Droplet, Layers } from 'lucide-react';
import { toast } from 'sonner';

const ClientReferences = ({ clientId }) => {
    const [references, setReferences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newRef, setNewRef] = useState({
        category: 'peinture',
        reference: '',
        brand: '',
        location: '',
        notes: ''
    });

    useEffect(() => {
        if (clientId) {
            fetchReferences();
        }
    }, [clientId]);

    const fetchReferences = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('client_references')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReferences(data || []);
        } catch (error) {
            console.error('Error fetching references:', error);
            toast.error('Erreur chargement références');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newRef.reference) return;

        try {
            const { data, error } = await supabase
                .from('client_references')
                .insert([{
                    client_id: clientId,
                    user_id: (await supabase.auth.getUser()).data.user.id,
                    ...newRef
                }])
                .select()
                .single();

            if (error) throw error;

            setReferences([data, ...references]);
            setNewRef({ category: 'peinture', reference: '', brand: '', location: '', notes: '' });
            toast.success('Référence ajoutée');
        } catch (error) {
            console.error('Error adding reference:', error);
            toast.error("Erreur lors de l'ajout");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer cette référence ?')) return;
        try {
            const { error } = await supabase
                .from('client_references')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setReferences(references.filter(r => r.id !== id));
            toast.success('Référence supprimée');
        } catch (error) {
            toast.error('Erreur suppression');
        }
    };

    return (
        <div className="space-y-6">
            <form onSubmit={handleAdd} className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                <h4 className="font-medium text-gray-900 mb-2">Ajouter une référence matériau</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newRef.category}
                            onChange={e => setNewRef({ ...newRef, category: e.target.value })}
                        >
                            <option value="peinture">Peinture</option>
                            <option value="carrelage">Carrelage</option>
                            <option value="sol_souple">Sol Souple / Parquet</option>
                            <option value="papier_peint">Papier Peint</option>
                            <option value="autre">Autre</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Emplacement (ex: Salon)</label>
                        <input
                            type="text"
                            placeholder="Salon, Cuisine..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newRef.location}
                            onChange={e => setNewRef({ ...newRef, location: e.target.value })}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Référence / Couleur (ex: RAL 7016)</label>
                        <input
                            type="text"
                            required
                            placeholder="Code couleur, Ref produit..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newRef.reference}
                            onChange={e => setNewRef({ ...newRef, reference: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Marque / Fournisseur</label>
                        <input
                            type="text"
                            placeholder="Tollens, Leroy Merlin..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newRef.brand}
                            onChange={e => setNewRef({ ...newRef, brand: e.target.value })}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <input
                        type="text"
                        placeholder="Détails, finition (mat/satin)..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        value={newRef.notes}
                        onChange={e => setNewRef({ ...newRef, notes: e.target.value })}
                    />
                </div>
                <button
                    type="submit"
                    className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter cette référence
                </button>
            </form>

            <div className="space-y-3">
                {loading ? (
                    <p className="text-center text-gray-500 text-sm">Chargement...</p>
                ) : references.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm italic">Aucune référence enregistrée pour ce client.</p>
                ) : (
                    references.map((ref) => (
                        <div key={ref.id} className="flex items-start justify-between bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                            <div className="flex items-start space-x-3">
                                <div className={`p-2 rounded-lg ${ref.category === 'peinture' ? 'bg-pink-50 text-pink-600' :
                                        ref.category === 'carrelage' ? 'bg-cyan-50 text-cyan-600' :
                                            'bg-gray-100 text-gray-600'
                                    }`}>
                                    {ref.category === 'peinture' ? <Droplet className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900">{ref.reference}</h4>
                                    <p className="text-sm text-gray-500">
                                        {ref.category.toUpperCase()} • {ref.location || 'Non spécifié'}
                                        {ref.brand && <span className="text-gray-400"> • {ref.brand}</span>}
                                    </p>
                                    {ref.notes && <p className="text-xs text-gray-400 mt-1 italic">{ref.notes}</p>}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(ref.id)}
                                className="text-gray-300 hover:text-red-500 p-1"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ClientReferences;
