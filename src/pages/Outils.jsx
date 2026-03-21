import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, X, Save, Search } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const Outils = () => {
    const iframeRef = useRef(null);
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    // Modal sauvegarde
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingSave, setPendingSave] = useState(null);
    const [planName, setPlanName] = useState('');
    const [clients, setClients] = useState([]);
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [saving, setSaving] = useState(false);

    // Chargement d'un plan depuis URL ?plan_id=X
    const sendPlanToIframe = useCallback((plan) => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const send = () => iframe.contentWindow?.postMessage({ type: 'planelec-load', plan }, '*');
        // Attendre que l'iframe soit prête
        if (iframe.contentDocument?.readyState === 'complete') {
            send();
        } else {
            iframe.addEventListener('load', send, { once: true });
        }
    }, []);

    useEffect(() => {
        const planId = searchParams.get('plan_id');
        if (!planId || !user) return;
        supabase
            .from('client_plans')
            .select('plan_data, name')
            .eq('id', planId)
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
                if (data) sendPlanToIframe({ ...data.plan_data, name: data.name });
            });
    }, [searchParams, user, sendPlanToIframe]);

    // Injection de la config Supabase dans l'iframe (pour l'import IA)
    const injectConfig = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage({
            type: 'planelec-config',
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }, '*');
    }, []);

    // Réception des messages de l'iframe
    useEffect(() => {
        const handleMessage = async (e) => {
            // L'iframe demande la config (prête à recevoir)
            if (e.data?.type === 'planelec-ready') { injectConfig(); return; }
            if (e.data?.type !== 'planelec-save') return;
            // Charger la liste des clients
            const { data } = await supabase
                .from('clients')
                .select('id, name')
                .order('name');
            setClients(data || []);
            setSelectedClientId('');
            setClientSearch('');
            setPlanName(e.data.planName || 'Plan électrique');
            setPendingSave({ planData: e.data.planData, thumbnail: e.data.thumbnail });
            setShowSaveModal(true);
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [injectConfig]);

    const handleSave = async () => {
        if (!selectedClientId || !planName.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('client_plans').insert({
            user_id: user.id,
            client_id: parseInt(selectedClientId),
            name: planName.trim(),
            plan_data: pendingSave.planData,
            thumbnail: pendingSave.thumbnail,
        });
        setSaving(false);
        if (error) { toast.error('Erreur lors de la sauvegarde'); return; }
        toast.success('Plan sauvegardé dans la fiche client');
        iframeRef.current?.contentWindow?.postMessage({ type: 'planelec-saved' }, '*');
        setShowSaveModal(false);
        setPendingSave(null);
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            <div className="px-4 mb-3 shrink-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Zap className="w-8 h-8 text-yellow-500" />
                    Outils
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Outils métier intégrés.</p>
            </div>

            <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 mx-4 mb-4">
                <iframe
                    ref={iframeRef}
                    src="/plan-electrique.html"
                    title="Plan électrique"
                    className="w-full h-full border-0"
                    allow="clipboard-write"
                    onLoad={injectConfig}
                />
            </div>

            {/* Modal sauvegarde dans fiche client */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Save className="w-5 h-5 text-green-500" />
                                Sauvegarder dans une fiche client
                            </h3>
                            <button onClick={() => setShowSaveModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Miniature */}
                            {pendingSave?.thumbnail && (
                                <img
                                    src={pendingSave.thumbnail}
                                    alt="Aperçu du plan"
                                    className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                />
                            )}

                            {/* Nom du plan */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nom du plan
                                </label>
                                <input
                                    type="text"
                                    value={planName}
                                    onChange={e => setPlanName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Ex : Plan RDC Maison Dupont"
                                />
                            </div>

                            {/* Sélection client */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Client
                                </label>
                                <div className="relative mb-2">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={clientSearch}
                                        onChange={e => setClientSearch(e.target.value)}
                                        placeholder="Rechercher un client..."
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredClients.length === 0 ? (
                                        <div className="p-3 text-sm text-gray-400 text-center">Aucun client trouvé</div>
                                    ) : filteredClients.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSelectedClientId(String(c.id))}
                                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                                selectedClientId === String(c.id)
                                                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!selectedClientId || !planName.trim() || saving}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Outils;
