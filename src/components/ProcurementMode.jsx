import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import {
    ArrowLeft, Mic, MicOff, Plus, Trash2, ShoppingCart,
    Loader2, ChevronDown, Hammer, Package,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../hooks/useVoice';
import { parseProcurementTranscript } from '../utils/procurementParser';

const CATEGORIES = [
    {
        id: 'materiel',
        label: 'Matériel',
        Icon: Package,
        activeClass: 'bg-blue-50 border-blue-400 text-blue-700',
        iconClass: 'text-blue-500',
    },
    {
        id: 'outillage',
        label: 'Outillage',
        Icon: Hammer,
        activeClass: 'bg-amber-50 border-amber-400 text-amber-700',
        iconClass: 'text-amber-500',
    },
    {
        id: 'consommable',
        label: 'Consommable',
        Icon: ShoppingCart,
        activeClass: 'bg-emerald-50 border-emerald-400 text-emerald-700',
        iconClass: 'text-emerald-500',
    },
];

const ProcurementMode = ({ onBack }) => {
    const { user } = useAuth();
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();

    // Site context
    const [clients, setClients] = useState([]);
    const [clientId, setClientId] = useState(null);
    const [clientName, setClientName] = useState('');
    const [showClientList, setShowClientList] = useState(false);
    const [siteLabel, setSiteLabel] = useState('');

    // Working list (only pending items created in this session OR previously saved as pending)
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('materiel');
    const [manualText, setManualText] = useState('');
    const [saving, setSaving] = useState(false);
    const lastTranscriptRef = useRef('');

    // ── Load clients & pending items ────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        supabase.from('clients')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data }) => setClients(data || []));
    }, [user]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        supabase.from('procurement_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(50)
            .then(({ data, error }) => {
                if (error) {
                    console.error(error);
                    toast.error('Erreur de chargement de la liste');
                }
                setItems(data || []);
                setLoading(false);
            });
    }, [user]);

    const filteredClients = useMemo(
        () => clients.filter(c => !clientName || c.name.toLowerCase().includes(clientName.toLowerCase())),
        [clients, clientName]
    );

    // ── Insertion helpers ──────────────────────────────────────────────────
    const insertItems = async (parsed, source) => {
        if (!parsed.length) return;
        setSaving(true);
        try {
            const rows = parsed.map(p => ({
                user_id: user.id,
                client_id: clientId || null,
                site_label: siteLabel.trim() || clientName.trim() || null,
                description: p.description,
                quantity: p.quantity,
                unit: p.unit || 'u',
                category,
                source,
            }));
            const { data, error } = await supabase
                .from('procurement_items')
                .insert(rows)
                .select();
            if (error) throw error;
            setItems(prev => [...(data || []), ...prev]);
            toast.success(
                rows.length === 1
                    ? 'Ajouté à la liste'
                    : `${rows.length} articles ajoutés`
            );
        } catch (err) {
            console.error(err);
            toast.error("Impossible d'ajouter à la liste");
        } finally {
            setSaving(false);
        }
    };

    // ── Voice → parsed items ───────────────────────────────────────────────
    useEffect(() => {
        if (!transcript || transcript === lastTranscriptRef.current) return;
        lastTranscriptRef.current = transcript;
        const parsed = parseProcurementTranscript(transcript);
        if (parsed.length === 0) {
            toast.error("Je n'ai pas compris, essayez à nouveau");
            resetTranscript();
            return;
        }
        insertItems(parsed, 'voice').then(() => resetTranscript());
    }, [transcript]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleVoiceToggle = () => {
        if (isListening) {
            stopListening();
        } else {
            resetTranscript();
            startListening();
        }
    };

    const handleManualAdd = async () => {
        const text = manualText.trim();
        if (!text) return;
        const parsed = parseProcurementTranscript(text);
        if (!parsed.length) return;
        await insertItems(parsed, 'manual');
        setManualText('');
    };

    // ── Item actions ───────────────────────────────────────────────────────
    const updateQty = async (id, delta) => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        const newQty = Math.max(0, parseFloat(item.quantity) + delta);
        if (newQty === 0) return removeItem(id);
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i));
        const { error } = await supabase
            .from('procurement_items')
            .update({ quantity: newQty })
            .eq('id', id);
        if (error) {
            toast.error('Mise à jour impossible');
            setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: item.quantity } : i));
        }
    };

    const removeItem = async (id) => {
        const previous = items;
        setItems(prev => prev.filter(i => i.id !== id));
        const { error } = await supabase
            .from('procurement_items')
            .delete()
            .eq('id', id);
        if (error) {
            toast.error('Suppression impossible');
            setItems(previous);
        }
    };

    // Group items by category for display
    const grouped = useMemo(() => {
        const groups = {};
        for (const cat of CATEGORIES) groups[cat.id] = [];
        for (const item of items) {
            (groups[item.category] || (groups[item.category] = [])).push(item);
        }
        return groups;
    }, [items]);

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col font-sans overflow-hidden">
            <Toaster position="top-center" richColors toastOptions={{ style: { maxWidth: 'calc(100vw - 24px)', wordBreak: 'break-word', overflowWrap: 'anywhere' } }} />

            {/* Header */}
            <div className="shrink-0 bg-white border-b border-gray-200 shadow-sm px-3 py-3 flex items-center gap-2">
                <button
                    onClick={onBack}
                    className="p-2 -ml-1 text-gray-500 hover:text-gray-800 rounded-xl active:bg-gray-100"
                    aria-label="Retour"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-base leading-tight">Matériel à commander</p>
                    <p className="text-xs text-gray-500 truncate">
                        {items.length === 0 ? 'Liste vide' : `${items.length} article${items.length > 1 ? 's' : ''} en attente`}
                    </p>
                </div>
                {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-32">
                {/* Site context */}
                <div className="p-4 space-y-3 bg-white border-b border-gray-100">
                    <div className="relative">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                            Chantier / client (optionnel)
                        </label>
                        <div className="relative flex gap-2">
                            <input
                                type="text"
                                value={clientName}
                                onChange={e => { setClientName(e.target.value); setClientId(null); }}
                                onFocus={() => setShowClientList(true)}
                                onBlur={() => setTimeout(() => setShowClientList(false), 200)}
                                placeholder="Nom du client"
                                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {clients.length > 0 && (
                                <button
                                    type="button"
                                    onMouseDown={() => setShowClientList(v => !v)}
                                    className="px-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-600"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {showClientList && filteredClients.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-2xl border border-gray-200 shadow-xl max-h-52 overflow-y-auto">
                                {filteredClients.map(c => (
                                    <button
                                        key={c.id}
                                        onMouseDown={() => { setClientId(c.id); setClientName(c.name); setShowClientList(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm font-medium text-gray-800 border-b border-gray-50 last:border-0 first:rounded-t-2xl last:rounded-b-2xl"
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <input
                        type="text"
                        value={siteLabel}
                        onChange={e => setSiteLabel(e.target.value)}
                        placeholder="Repère du chantier (ex. Rue de Lyon, 3e étage)"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Category picker */}
                <div className="px-4 pt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Catégorie</p>
                    <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.map((cat) => {
                            const CatIcon = cat.Icon;
                            const active = category === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                                        active
                                            ? cat.activeClass
                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    <CatIcon className="w-5 h-5" />
                                    <span className="text-xs font-semibold">{cat.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Manual input */}
                <div className="px-4 pt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Ajouter</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={manualText}
                            onChange={e => setManualText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleManualAdd(); }}
                            placeholder='Ex : "3 mètres de gaine ICTA, 5 boîtes"'
                            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                            onClick={handleManualAdd}
                            disabled={!manualText.trim() || saving}
                            className="px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl"
                            aria-label="Ajouter"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                        Séparez plusieurs articles par une virgule ou « et ».
                    </p>
                </div>

                {/* List */}
                <div className="px-4 pt-6 space-y-5">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-10">
                            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm text-gray-400">
                                Aucun article pour l'instant.
                                <br />
                                Appuyez sur le micro et dictez vos besoins.
                            </p>
                        </div>
                    ) : (
                        CATEGORIES.map((cat) => {
                            const list = grouped[cat.id] || [];
                            if (list.length === 0) return null;
                            const CatIcon = cat.Icon;
                            return (
                                <div key={cat.id}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CatIcon className={`w-4 h-4 ${cat.iconClass}`} />
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                            {cat.label} ({list.length})
                                        </p>
                                    </div>
                                    <ul className="space-y-2">
                                        {list.map(item => (
                                            <li
                                                key={item.id}
                                                className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2.5"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {item.description}
                                                    </p>
                                                    {item.site_label && (
                                                        <p className="text-[11px] text-gray-400 truncate">
                                                            {item.site_label}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={() => updateQty(item.id, -1)}
                                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
                                                        aria-label="Diminuer"
                                                    >
                                                        −
                                                    </button>
                                                    <span className="min-w-[2.5rem] text-center text-sm font-bold tabular-nums">
                                                        {item.quantity}
                                                        <span className="text-xs font-normal text-gray-400 ml-0.5">{item.unit}</span>
                                                    </span>
                                                    <button
                                                        onClick={() => updateQty(item.id, +1)}
                                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
                                                        aria-label="Augmenter"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    className="ml-1 p-1.5 text-gray-300 hover:text-red-500 rounded-full"
                                                    aria-label="Supprimer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Floating mic button */}
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
                {isListening && (
                    <div className="pointer-events-auto bg-white px-4 py-2 rounded-full shadow-md border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        Dictez le matériel manquant…
                    </div>
                )}
                <button
                    onClick={handleVoiceToggle}
                    className={`pointer-events-auto relative w-20 h-20 rounded-full text-white flex items-center justify-center shadow-xl transition-transform active:scale-95 ${
                        isListening ? 'bg-red-500' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    aria-label={isListening ? 'Arrêter' : 'Dicter'}
                >
                    {isListening && (
                        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
                    )}
                    {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>
            </div>
        </div>
    );
};

export default ProcurementMode;
