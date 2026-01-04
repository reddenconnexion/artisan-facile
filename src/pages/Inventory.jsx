import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
    Package, Camera, Search, AlertTriangle, Plus, Minus,
    Save, X, BrainCircuit, Loader2, Settings, ScanBarcode
} from 'lucide-react';
import { useZxing } from 'react-zxing';
import { analyzeStockImage } from '../utils/aiScanner';

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
    const [showScanModal, setShowScanModal] = useState(false); // AI Modal
    const [showBarcodeModal, setShowBarcodeModal] = useState(false); // Barcode Modal
    const [showNewItemModal, setShowNewItemModal] = useState(false); // Create Item Modal

    // Barcode State
    const [scannedBarcode, setScannedBarcode] = useState(null);
    const [newItemData, setNewItemData] = useState({ description: '', category: 'Vrac', stock_quantity: 1, barcode: '' });

    // AI/Scan State
    const [scanImage, setScanImage] = useState(null);
    const [scanResult, setScanResult] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
    const [showKeyInput, setShowKeyInput] = useState(false);
    const fileInputRef = useRef(null);

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
            toast.success(`Article trouvé : ${existingItem.description}`);
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

    // --- AI SCANNER LOGIC (Legacy/Alternative) ---

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setScanImage(reader.result);
            reader.readAsDataURL(file);
            analyzeImage(file);
        }
    };

    const analyzeImage = async (file) => {
        setIsAnalyzing(true);
        setScanResult(null);
        try {
            const results = await analyzeStockImage(file, apiKey);
            setScanResult(results.map(r => ({ ...r, selected: true })));
            if (!apiKey) {
                toast.info("Mode Démo Gemini", { duration: 3000 });
            }
        } catch (error) {
            toast.error("Analyse échouée : " + error.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveScan = async () => {
        if (!scanResult) return;
        const toImport = scanResult.filter(r => r.selected);
        let importedCount = 0;
        let updatedCount = 0;

        try {
            for (const item of toImport) {
                const existing = items.find(i => i.description.toLowerCase().includes(item.description.toLowerCase()));

                if (existing) {
                    await supabase.from('price_library')
                        .update({
                            stock_quantity: (existing.stock_quantity || 0) + (item.quantity || 1),
                            last_stock_update: new Date()
                        })
                        .eq('id', existing.id);
                    updatedCount++;
                } else {
                    await supabase.from('price_library').insert({
                        user_id: user.id,
                        description: item.description,
                        stock_quantity: item.quantity || 1,
                        category: item.category || 'Vrac',
                        type: 'material',
                        price: 0
                    });
                    importedCount++;
                }
            }
            toast.success(`${importedCount} nouveaux, ${updatedCount} mis à jour.`);
            setShowScanModal(false);
            setScanImage(null);
            setScanResult(null);
            fetchStock();
        } catch (e) {
            toast.error("Erreur sauvegarde scan");
        }
    };

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('gemini_api_key', key);
        setShowKeyInput(false);
        toast.success("Clé API enregistrée");
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
                        onClick={() => setShowBarcodeModal(true)}
                        className="flex items-center px-4 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all font-medium"
                    >
                        <ScanBarcode className="w-5 h-5 mr-2" />
                        Scanner Code-Barre
                    </button>
                    <button
                        onClick={() => setShowScanModal(true)}
                        className="flex items-center px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
                        title="Scan Intelligent via Photo"
                    >
                        <BrainCircuit className="w-5 h-5 mr-2 text-purple-600" />
                        <span className="hidden md:inline">Scan IA</span>
                    </button>
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

            {/* New Item Modal (from Barcode) */}
            {showNewItemModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold mb-4">Nouvel Article Détecté</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Code-Barre</label>
                                <input type="text" disabled value={newItemData.barcode} className="w-full px-3 py-2 bg-gray-100 rounded-lg font-mono" />
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

            {/* AI Scan Modal (Existing) */}
            {showScanModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <BrainCircuit className="w-6 h-6 text-purple-600" />
                                Assistant Stock IA
                            </h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowKeyInput(!showKeyInput)} className="p-2 text-gray-400 hover:text-gray-700 bg-gray-50 rounded-lg">
                                    <Settings className="w-5 h-5" />
                                </button>
                                <button onClick={() => setShowScanModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {showKeyInput && (
                                <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Clé API Google Gemini (Vision)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            placeholder="AIzaSy..."
                                            className="flex-1 px-3 py-2 border rounded-lg"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                        />
                                        <button
                                            onClick={() => saveApiKey(apiKey)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                        >
                                            Sauvegarder
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">La clé est stockée localement sur votre appareil. Laissez vide pour essayer le mode démo.</p>
                                </div>
                            )}

                            {!scanImage ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-3 border-dashed border-gray-300 rounded-2xl h-64 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all group"
                                >
                                    <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                        <Camera className="w-8 h-8 text-purple-600" />
                                    </div>
                                    <p className="font-semibold text-gray-700">Prendre une photo ou importer</p>
                                    <p className="text-sm text-gray-400 mt-1">L'IA analysera le contenu automatiquement</p>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        ref={fileInputRef}
                                        className="hidden"
                                        onChange={handleImageSelect}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="relative rounded-xl overflow-hidden h-48 bg-black flex justify-center">
                                        <img src={scanImage} alt="Scan" className="h-full object-contain" />
                                        {isAnalyzing && (
                                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                                                <Loader2 className="w-10 h-10 animate-spin mb-3 text-purple-400" />
                                                <p className="font-medium animate-pulse">Analyse de l'image en cours...</p>
                                            </div>
                                        )}
                                    </div>

                                    {scanResult && (
                                        <div className="animate-in fade-in slide-in-from-bottom-4">
                                            <h3 className="font-bold text-gray-900 mb-3">Articles détectés :</h3>
                                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                                {scanResult.map((item, idx) => (
                                                    <div key={idx} className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.selected}
                                                            onChange={(e) => {
                                                                const newRes = [...scanResult];
                                                                newRes[idx].selected = e.target.checked;
                                                                setScanResult(newRes);
                                                            }}
                                                            className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500 mr-3"
                                                        />
                                                        <div className="flex-1">
                                                            <p className="font-medium text-gray-900">{item.description}</p>
                                                            <p className="text-xs text-gray-500">{item.category}</p>
                                                        </div>
                                                        <div className="bg-white px-3 py-1 rounded-md border text-sm font-bold shadow-sm">
                                                            x{item.quantity}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={handleSaveScan}
                                                className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center transition-all"
                                            >
                                                <Save className="w-5 h-5 mr-2" />
                                                Valider et Ajouter au Stock
                                            </button>
                                        </div>
                                    )}

                                    {!isAnalyzing && !scanResult && (
                                        <button onClick={() => setScanImage(null)} className="w-full text-center text-gray-500 hover:text-gray-900 text-sm">
                                            Recommencer
                                        </button>
                                    )}
                                </div>
                            )}
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
