import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Plus, Upload, Trash2, Search, FileSpreadsheet, X, Save, Pencil } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const PriceLibrary = () => {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const fileInputRef = useRef(null);

    // New Item State
    const [newItem, setNewItem] = useState({
        description: '',
        price: '',
        unit: 'unité',
        category: '',
        barcode: '',
        reference: ''
    });
    const [editingItem, setEditingItem] = useState(null);

    useEffect(() => {
        if (user) {
            fetchItems();

            // Realtime subscription
            const subscription = supabase
                .channel('price_library_changes')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'price_library' },
                    () => {
                        fetchItems();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
            };
        }
    }, [user]);

    const fetchItems = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('price_library')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching library:', error);
            toast.error('Erreur lors du chargement de la bibliothèque');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fileExt = file.name.split('.').pop().toLowerCase();

        if (fileExt === 'csv') {
            parseCSV(file);
        } else if (['xlsx', 'xls'].includes(fileExt)) {
            parseExcel(file);
        } else {
            toast.error('Format de fichier non supporté. Utilisez CSV ou Excel.');
        }
    };

    const parseCSV = (file) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                processImportedData(results.data);
            },
            error: (error) => {
                toast.error('Erreur lors de la lecture du CSV');
                console.error(error);
            }
        });
    };

    const parseExcel = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                processImportedData(jsonData);
            } catch (error) {
                toast.error("Erreur lors de la lecture du fichier Excel");
                console.error(error);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processImportedData = async (data) => {
        // Expected columns: Description, Prix, Unité, Catégorie (optional)
        // Map various common column names
        const formattedData = data.map(row => {
            // Normalize keys to lowercase for easier matching
            const keys = Object.keys(row).reduce((acc, key) => {
                acc[key.toLowerCase().trim()] = row[key];
                return acc;
            }, {});

            const description = keys['description'] || keys['libellé'] || keys['ouvrage'] || keys['nom'];
            const price = keys['prix'] || keys['price'] || keys['pu'] || keys['prix unitaire'];
            const unit = keys['unité'] || keys['unit'] || keys['u'] || 'unité';
            const category = keys['catégorie'] || keys['category'] || keys['famille'] || '';

            // Separate mapping for Barcode (EAN) and Reference (Manufacturer)
            const barcode = keys['barcode'] || keys['ean'] || keys['code-barres'] || '';
            const reference = keys['reference'] || keys['ref'] || keys['référence'] || '';

            if (!description || !price) return null;

            return {
                user_id: user.id,
                description: description,
                price: parseFloat(String(price).replace(',', '.')) || 0,
                unit: unit,
                category: category,
                barcode: barcode,
                reference: reference
            };
        }).filter(item => item !== null);

        if (formattedData.length === 0) {
            toast.error("Aucune donnée valide trouvée. Vérifiez les colonnes (Description, Prix).");
            return;
        }

        try {
            const { error } = await supabase
                .from('price_library')
                .insert(formattedData);

            if (error) throw error;

            toast.success(`${formattedData.length} articles importés avec succès`);
            setShowImportModal(false);
            fetchItems();
        } catch (error) {
            console.error('Import error:', error);
            toast.error("Erreur lors de l'importation en base de données");
        }
    };

    const handleEdit = (item) => {
        setNewItem({
            description: item.description,
            price: item.price,
            unit: item.unit,
            category: item.category || '',
            type: item.type || 'service',
            barcode: item.barcode || '',
            reference: item.reference || ''
        });
        setEditingItem(item);
        setShowAddModal(true);
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        try {
            if (editingItem) {
                const { error } = await supabase
                    .from('price_library')
                    .update({
                        description: newItem.description,
                        price: parseFloat(newItem.price),
                        unit: newItem.unit,
                        category: newItem.category,
                        type: newItem.type || 'service',
                        barcode: newItem.barcode,
                        reference: newItem.reference
                    })
                    .eq('id', editingItem.id);

                if (error) throw error;
                toast.success('Article modifié');
            } else {
                const { error } = await supabase
                    .from('price_library')
                    .insert([{
                        user_id: user.id,
                        ...newItem,
                        price: parseFloat(newItem.price)
                    }]);

                if (error) throw error;
                toast.success('Article ajouté');
            }

            setNewItem({ description: '', price: '', unit: 'unité', category: '', barcode: '', reference: '' });
            setEditingItem(null);
            setShowAddModal(false);
            fetchItems();
        } catch (error) {
            console.error(error);
            toast.error(editingItem ? "Erreur lors de la modification" : "Erreur lors de l'ajout");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer cet article ?')) return;
        try {
            const { error } = await supabase
                .from('price_library')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Article supprimé');
            setItems(items.filter(i => i.id !== id));
        } catch (error) {
            toast.error("Erreur lors de la suppression");
        }
    };

    const filteredItems = items.filter(item =>
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bibliothèque de Prix</h1>
                    <p className="text-gray-500">Gérez vos ouvrages et tarifs</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Importer (Excel/CSV)
                    </button>
                    <button
                        onClick={() => {
                            setEditingItem(null);
                            setNewItem({ description: '', price: '', unit: 'unité', category: '', barcode: '', reference: '' });
                            setShowAddModal(true);
                        }}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nouvel Article
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Rechercher un ouvrage..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Description</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Catégorie</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Prix Unitaire</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">Chargement...</td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                        Aucun article trouvé. Ajoutez-en un ou importez une liste.
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-gray-900 font-medium">
                                            {item.description}
                                            <div className="flex flex-col gap-0.5 mt-1">
                                                {item.reference && <span className="text-xs text-blue-600 font-mono">Réf: {item.reference}</span>}
                                                {item.barcode && <span className="text-xs text-gray-400 font-mono">EAN: {item.barcode}</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {item.category && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {item.category}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-900 font-medium">
                                            {item.price.toFixed(2)} € <span className="text-gray-400 text-sm font-normal">/ {item.unit}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.type === 'material' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                    Matériel
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                    MO
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 mr-2"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Importer une liste de prix</h3>
                            <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 text-blue-700 rounded-lg text-sm">
                                <p className="font-semibold mb-1">Format attendu (Excel ou CSV) :</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Colonnes : <strong>Description</strong>, <strong>Prix</strong></li>
                                    <li>Optionnel : Unité, Catégorie</li>
                                </ul>
                            </div>
                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}>
                                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                <p className="text-gray-600 font-medium">Cliquez pour sélectionner un fichier</p>
                                <p className="text-xs text-gray-400 mt-1">.csv, .xlsx, .xls</p>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Item Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                {editingItem ? "Modifier l'article" : "Nouvel Article"}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setEditingItem(null);
                                    setNewItem({ description: '', price: '', unit: 'unité', category: '', barcode: '', reference: '' });
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddItem} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={newItem.description}
                                    onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Prix</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.price}
                                        onChange={e => setNewItem({ ...newItem, price: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.unit}
                                        onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.category}
                                        onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                                        placeholder="Ex: Plomberie"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.type || 'service'}
                                        onChange={e => setNewItem({ ...newItem, type: e.target.value })}
                                    >
                                        <option value="service">Main d'oeuvre</option>
                                        <option value="material">Matériel</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Référence Fabricant</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.reference || ''}
                                        onChange={e => setNewItem({ ...newItem, reference: e.target.value })}
                                        placeholder="Ex: REF-123"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Code-barres (EAN)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={newItem.barcode || ''}
                                        onChange={e => setNewItem({ ...newItem, barcode: e.target.value })}
                                        placeholder="Scan..."
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Enregistrer
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PriceLibrary;
