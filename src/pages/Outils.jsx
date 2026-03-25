import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, X, Save, Search, Copy, FolderOpen, ChevronRight } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const Outils = () => {
    const iframeRef = useRef(null);
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Modal sauvegarde
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingSave, setPendingSave] = useState(null);
    const [planName, setPlanName] = useState('');
    const [clients, setClients] = useState([]);
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [saving, setSaving] = useState(false);

    // Modal copie d'un plan existant
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyClients, setCopyClients] = useState([]);
    const [copyClientSearch, setCopyClientSearch] = useState('');
    const [copySelectedClient, setCopySelectedClient] = useState(null);
    const [copyPlans, setCopyPlans] = useState([]);
    const [loadingCopyPlans, setLoadingCopyPlans] = useState(false);

    // Ref pour synchroniser l'envoi du plan avec la disponibilité de l'iframe
    const pendingPlanRef = useRef(null);
    const iframeReadyRef = useRef(false);
    const pdfImportRef = useRef(null);

    const sendPlanToIframe = useCallback((plan) => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage({ type: 'planelec-load', plan }, '*');
    }, []);

    // Chargement d'un plan depuis URL ?plan_id=X
    useEffect(() => {
        const planId = searchParams.get('plan_id');
        if (!planId || !user) return;
        iframeReadyRef.current = false;
        pendingPlanRef.current = null;
        supabase
            .from('client_plans')
            .select('plan_data, name')
            .eq('id', planId)
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
                if (!data) return;
                const plan = { ...data.plan_data, name: data.name };
                if (iframeReadyRef.current) {
                    sendPlanToIframe(plan);
                } else {
                    pendingPlanRef.current = plan;
                }
            });
    }, [searchParams, user, sendPlanToIframe]);

    // Injection de la config Supabase dans l'iframe
    const injectConfig = useCallback(async () => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        const { data: { session } } = await supabase.auth.getSession();
        iframe.contentWindow.postMessage({
            type: 'planelec-config',
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            accessToken: session?.access_token || null,
        }, '*');
    }, []);

    // Rendu PDF → dataURL pour le fond de plan (demandé par l'iframe)
    const handlePdfImport = useCallback(async (file) => {
        const iframe = iframeRef.current;
        if (!file || !iframe?.contentWindow) return;
        try {
            toast.info('Rendu du PDF en cours…');
            const arrayBuffer = await file.arrayBuffer();
            const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            // Rendre à ×5 (zoom max de l'éditeur) pour une qualité pixel-perfect
            const RENDER_SCALE = 5;
            const vp   = page.getViewport({ scale: RENDER_SCALE });
            const off  = document.createElement('canvas');
            off.width  = vp.width;
            off.height = vp.height;
            const octx = off.getContext('2d');
            // Fond blanc obligatoire pour JPEG (pas de canal alpha)
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, off.width, off.height);
            await page.render({ canvasContext: octx, viewport: vp }).promise;
            // JPEG 92 % : ~6× plus léger que PNG, qualité excellente pour un plan
            const dataUrl = off.toDataURL('image/jpeg', 0.92);
            iframe.contentWindow.postMessage({
                type: 'planelec-pdf-rendered',
                dataUrl,
                pageCount: pdf.numPages,
                // Dimensions brutes du PDF (sans le facteur de rendu)
                // → l'iframe les utilise pour le dessin afin d'être indépendant
                //   de la résolution de rendu
                basePdfWidth:  vp.width  / RENDER_SCALE,
                basePdfHeight: vp.height / RENDER_SCALE,
            }, '*');
        } catch (err) {
            toast.error('Erreur rendu PDF : ' + err.message);
            iframe.contentWindow.postMessage({ type: 'planelec-pdf-error', message: err.message }, '*');
        }
    }, []);

    // Réception des messages de l'iframe
    useEffect(() => {
        const handleMessage = async (e) => {
            if (e.data?.type === 'planelec-ready') {
                injectConfig();
                iframeReadyRef.current = true;
                if (pendingPlanRef.current) {
                    sendPlanToIframe(pendingPlanRef.current);
                    pendingPlanRef.current = null;
                }
                return;
            }
            if (e.data?.type === 'planelec-render-pdf') {
                pdfImportRef.current?.click();
                return;
            }
            if (e.data?.type !== 'planelec-save') return;
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
    }, [injectConfig, sendPlanToIframe]);

    const handleSave = async () => {
        if (!selectedClientId || !planName.trim()) return;
        setSaving(true);

        const { data: existing } = await supabase
            .from('client_plans')
            .select('id')
            .eq('user_id', user.id)
            .eq('client_id', parseInt(selectedClientId))
            .eq('name', planName.trim())
            .maybeSingle();

        let savedId;
        if (existing) {
            const { data, error } = await supabase
                .from('client_plans')
                .update({ plan_data: pendingSave.planData, thumbnail: pendingSave.thumbnail })
                .eq('id', existing.id)
                .select('id')
                .single();
            setSaving(false);
            if (error) { toast.error('Erreur lors de la sauvegarde'); return; }
            savedId = data.id;
            toast.success('Plan mis à jour dans la fiche client');
        } else {
            const { data, error } = await supabase
                .from('client_plans')
                .insert({
                    user_id: user.id,
                    client_id: parseInt(selectedClientId),
                    name: planName.trim(),
                    plan_data: pendingSave.planData,
                    thumbnail: pendingSave.thumbnail,
                })
                .select('id')
                .single();
            setSaving(false);
            if (error) { toast.error('Erreur lors de la sauvegarde'); return; }
            savedId = data.id;
            toast.success('Plan sauvegardé dans la fiche client');
        }

        iframeRef.current?.contentWindow?.postMessage({ type: 'planelec-saved' }, '*');
        setSearchParams({ plan_id: savedId });
        setShowSaveModal(false);
        setPendingSave(null);
    };

    // ── Copie d'un plan existant ──────────────────────────────────────────
    const openCopyModal = async () => {
        const { data } = await supabase
            .from('clients')
            .select('id, name')
            .order('name');
        setCopyClients(data || []);
        setCopyClientSearch('');
        setCopySelectedClient(null);
        setCopyPlans([]);
        setShowCopyModal(true);
    };

    const selectCopyClient = async (client) => {
        setCopySelectedClient(client);
        setLoadingCopyPlans(true);
        const { data } = await supabase
            .from('client_plans')
            .select('id, name, thumbnail, updated_at')
            .eq('client_id', client.id)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
        setCopyPlans(data || []);
        setLoadingCopyPlans(false);
    };

    const loadPlanCopy = async (plan) => {
        const { data } = await supabase
            .from('client_plans')
            .select('plan_data, name')
            .eq('id', plan.id)
            .single();
        if (!data) { toast.error('Plan introuvable'); return; }

        // Charger dans l'éditeur sans plan_id dans l'URL (= copie, nouveau plan)
        setSearchParams({});
        sendPlanToIframe({ ...data.plan_data, name: `Copie — ${data.name}` });
        setShowCopyModal(false);
        toast.success(`Plan "${data.name}" chargé — modifiez et sauvegardez comme nouveau plan`);
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );
    const filteredCopyClients = copyClients.filter(c =>
        c.name.toLowerCase().includes(copyClientSearch.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col">
            <div className="px-4 mb-3 shrink-0 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Zap className="w-8 h-8 text-yellow-500" />
                        Outils
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Outils métier intégrés.</p>
                </div>
                <button
                    onClick={openCopyModal}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors border border-blue-200 dark:border-blue-800"
                >
                    <FolderOpen className="w-4 h-4" />
                    Copier un plan client
                </button>
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
            {/* Input PDF caché — déclenché par planelec-render-pdf */}
            <input
                type="file"
                ref={pdfImportRef}
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfImport(file);
                    e.target.value = '';
                }}
            />

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
                            {pendingSave?.thumbnail && (
                                <img
                                    src={pendingSave.thumbnail}
                                    alt="Aperçu du plan"
                                    className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                />
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du plan</label>
                                <input
                                    type="text"
                                    value={planName}
                                    onChange={e => setPlanName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Ex : Plan RDC Maison Dupont"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
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
                            <button onClick={() => setShowSaveModal(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
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

            {/* Modal copie d'un plan existant */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Copy className="w-5 h-5 text-blue-500" />
                                Copier un plan client existant
                            </h3>
                            <button onClick={() => setShowCopyModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-1 min-h-0">
                            {/* Colonne clients */}
                            <div className="w-56 border-r border-gray-100 dark:border-gray-700 flex flex-col shrink-0">
                                <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={copyClientSearch}
                                            onChange={e => setCopyClientSearch(e.target.value)}
                                            placeholder="Rechercher..."
                                            className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-xs dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {filteredCopyClients.length === 0 ? (
                                        <p className="p-3 text-xs text-gray-400 text-center">Aucun client</p>
                                    ) : filteredCopyClients.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => selectCopyClient(c)}
                                            className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between transition-colors ${
                                                copySelectedClient?.id === c.id
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {c.name}
                                            <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Colonne plans */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {!copySelectedClient ? (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-sm text-gray-400">Sélectionnez un client pour voir ses plans</p>
                                    </div>
                                ) : loadingCopyPlans ? (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : copyPlans.length === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-sm text-gray-400">Aucun plan pour ce client</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {copyPlans.map(plan => (
                                            <button
                                                key={plan.id}
                                                onClick={() => loadPlanCopy(plan)}
                                                className="group text-left border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden hover:border-blue-400 hover:shadow-md transition-all"
                                            >
                                                <div className="h-28 bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
                                                    {plan.thumbnail ? (
                                                        <img src={plan.thumbnail} alt={plan.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Zap className="w-8 h-8 text-gray-300 dark:text-gray-500" />
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-center justify-center">
                                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1.5">
                                                            <Copy className="w-3 h-3" /> Utiliser comme base
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="p-2.5">
                                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{plan.name}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {new Date(plan.updated_at).toLocaleDateString('fr-FR')}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
                            <p className="text-xs text-gray-400">
                                Le plan sélectionné sera chargé comme base de travail. L'original ne sera pas modifié.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Outils;
