import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
    Package, Search, AlertTriangle, Plus, Minus,
    X, ScanBarcode, ExternalLink
} from 'lucide-react';
import { useZxing } from 'react-zxing';

const BarcodeScanner = ({ onResult, onError, onClose }) => {
    const { ref } = useZxing({
        onDecodeResult(result) {
            onResult(result.getText());
        },
        onError(error) {
            // Ignore mostly, or log debug
        }
    });

    return (
        <div className="relative bg-black rounded-2xl overflow-hidden h-64 md:h-80 flex flex-col items-center justify-center">
            <video ref={ref} className="absolute inset-0 w-full h-full object-cover" />
            <div className="relative z-10 w-64 h-32 border-2 border-red-500/50 rounded-lg animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.5)]"></div>
            <p className="relative z-10 mt-4 text-white font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                Placez le code-barre dans le cadre
            </p>
            <button
                onClick={onClose}
                className="absolute top-4 right-4 bg-black/50 p-2 rounded-full text-white hover:bg-black/70"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
    );
};

const Inventory = () => {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // UI States
    const [showBarcodeModal, setShowBarcodeModal] = useState(false); // Barcode Modal
    const [showNewItemModal, setShowNewItemModal] = useState(false); // Create Item Modal

    // Barcode State
    const [scannedBarcode, setScannedBarcode] = useState(null);
    const [newItemData, setNewItemData] = useState({ description: '', category: 'Vrac', stock_quantity: 1, barcode: '' });

    useEffect(() => {
        if (user) {
            fetchStock();

            // Sub to changes
            const sub = supabase
                .channel('inventory_changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'price_library' }, () => fetchStock())
                .subscribe();
            return () => supabase.removeChannel(sub);
        }
    }, [user]);

    const fetchStock = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('price_library')
                .select('*')
                .or('type.eq.material,type.is.null')
                .order('stock_quantity', { ascending: true });

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching stock:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateStock = async (id, newQuantity) => {
        if (newQuantity < 0) return;
        try {
            setItems(items.map(i => i.id === id ? { ...i, stock_quantity: newQuantity } : i));

            const { error } = await supabase
                .from('price_library')
                .update({ stock_quantity: newQuantity, last_stock_update: new Date() })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            toast.error("Erreur mise à jour stock");
            fetchStock();
        }
    };

    // --- BARCODE LOGIC ---

    const handleBarcodeDetected = (barcode) => {
        setShowBarcodeModal(false);
        setScannedBarcode(barcode);

        const existingItem = items.find(i => i.barcode === barcode);
        if (existingItem) {
            toast.success(`Article trouvé: ${existingItem.description} `);
            // Highlight or scroll to item? For now just notify
            // Maybe open a quick edit modal for this item?
            // Let's filter the list to show this item
            setSearchTerm(existingItem.description); // Simple hack to find it
        } else {
            // New Item
            setNewItemData({ description: '', category: 'Matériel', stock_quantity: 1, barcode });
            setShowNewItemModal(true);
        }
    };

    const handleCreateItem = async () => {
        if (!newItemData.description) return toast.error("Description requise");

        try {
            const { error } = await supabase.from('price_library').insert({
                user_id: user.id,
                description: newItemData.description,
                category: newItemData.category,
                stock_quantity: newItemData.stock_quantity,
                barcode: newItemData.barcode,
                type: 'material',
                price: 0
            });

            if (error) throw error;
            toast.success("Article créé avec succès");
            setShowNewItemModal(false);
            fetchStock();
        } catch (e) {
            console.error(e);
            toast.error("Erreur création article");
        }
    };

    // --- RENDER ---

    const lowStockItems = items.filter(i => (i.stock_quantity || 0) <= (i.min_stock_alert || 5));
    const filteredItems = items.filter(i =>
        i.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.barcode && i.barcode.includes(searchTerm))
    );

    return (
        <div className="max-w-6xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Package className="w-8 h-8 mr-3 text-blue-600" />
                        Gestion de Stock
                    </h1>
                    <p className="text-gray-500">Suivez vos matériaux et scannez vos arrivages</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setScannedBarcode(null);
                            setNewItemData({ description: '', category: 'Matériel', stock_quantity: 1, barcode: '' });
                            setShowNewItemModal(true);
                        }}
                        className="flex items-center px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 transition-all font-medium"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        <span className="hidden md:inline">Ajouter</span>
                    </button>
                    <button
                        onClick={() => setShowBarcodeModal(true)}
                        className="flex items-center px-4 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all font-medium"
                    >
                        <ScanBarcode className="w-5 h-5 mr-2" />
                        <span className="hidden md:inline">Scanner</span>
                    </button>
                    <a
                        href="https://lens.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
                        title="Ouvrir Google Lens pour identifier un objet"
                    >
                        <ExternalLink className="w-5 h-5 md:mr-2 text-gray-500" />
                        <span className="hidden md:inline">Lens</span>
                    </a>
                </div>
            </div>

            {/* Stats / Alerts */}
            {lowStockItems.length > 0 && (
                <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start animate-in slide-in-from-top-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mr-3 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="font-semibold text-orange-800">Alerte Stock Faible</h3>
                        <p className="text-sm text-orange-700 mt-1">
                            {lowStockItems.length} articles sont sous le seuil d'alerte.
                        </p>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Rechercher (Nom, Categorie, Code-barre)..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Barcode Modal */}
            {showBarcodeModal && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg">Scanner un article</h3>
                            <button onClick={() => setShowBarcodeModal(false)}><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4">
                            <BarcodeScanner
                                onResult={handleBarcodeDetected}
                                onClose={() => setShowBarcodeModal(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* New Item Modal (from Barcode or Manual) */}
            {showNewItemModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold mb-4">
                            {scannedBarcode ? 'Nouvel Article Détecté' : 'Ajouter un article'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Code-Barre (Optionnel)</label>
                                <input
                                    type="text"
                                    disabled={!!scannedBarcode}
                                    value={newItemData.barcode}
                                    onChange={e => setNewItemData({ ...newItemData, barcode: e.target.value })}
                                    className={`w-full px-3 py-2 rounded-lg font-mono ${scannedBarcode ? 'bg-gray-100 text-gray-500' : 'border border-gray-300'}`}
                                    placeholder="Scanner ou laisser vide"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={newItemData.description}
                                    onChange={e => setNewItemData({ ...newItemData, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ex: Disjoncteur 16A..."
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                                    <select
                                        value={newItemData.category}
                                        onChange={e => setNewItemData({ ...newItemData, category: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    >
                                        <option>Matériel</option>
                                        <option>Consommable</option>
                                        <option>Outillage</option>
                                        <option>Vrac</option>
                                    </select>
                                </div>
                                <div className="w-24">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Qté</label>
                                    <input
                                        type="number"
                                        value={newItemData.stock_quantity}
                                        onChange={e => setNewItemData({ ...newItemData, stock_quantity: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                            </div>

                            <button onClick={handleCreateItem} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl mt-2">
                                Créer l'article
                            </button>
                            <button onClick={() => setShowNewItemModal(false)} className="w-full py-2 text-gray-500">Annuler</button>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="grid gap-3">
                {loading ? (
                    <div className="py-12 text-center text-gray-400">Chargement...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300">
                        <Package className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">Votre stock est vide ou aucun résultat.</p>
                        <p className="text-sm text-gray-400">Utilisez le scan Code-Barre pour commencer.</p>
                    </div>
                ) : (
                    filteredItems.map(item => (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-blue-200 transition-all">
                            <div className="flex-1 min-w-0 pr-4">
                                <h3 className="font-semibold text-gray-900 truncate">{item.description}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{item.category || 'Non classé'}</span>
                                    {item.barcode && <span className="text-xs text-gray-400 font-mono bg-blue-50 px-1 rounded flex items-center"><ScanBarcode className="w-3 h-3 mr-1" />{item.barcode}</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                                    <button
                                        onClick={() => updateStock(item.id, (item.stock_quantity || 0) - 1)}
                                        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white hover:text-red-600 rounded-md transition-all shadow-sm"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <div className={`w-12 text-center font-bold ${(item.stock_quantity || 0) <= (item.min_stock_alert || 5) ? 'text-red-600' : 'text-gray-700'}`}>
                                        {item.stock_quantity || 0}
                                    </div>
                                    <button
                                        onClick={() => updateStock(item.id, (item.stock_quantity || 0) + 1)}
                                        className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white hover:text-green-600 rounded-md transition-all shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Inventory;
