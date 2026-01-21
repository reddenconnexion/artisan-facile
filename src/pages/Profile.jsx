import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Save, Building, MapPin, Phone, FileText, Layers, Bell } from 'lucide-react';
import { getNotificationTopic } from '../utils/notifications';
import { TRADE_CONFIG } from '../constants/trades';

const Profile = () => {
    // Component for managing artisan profile settings
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        company_name: '',
        full_name: '',
        email: '',
        professional_email: '',
        website: '',
        logo_url: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',

        siret: '',
        google_review_url: '',
        trade: 'general',
        iban: ''
    });

    useEffect(() => {
        if (user) {
            getProfile();
        }
    }, [user]);

    const getProfile = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data) {
                const aiPrefs = data.ai_preferences || {};
                setFormData({
                    company_name: data.company_name || '',
                    full_name: data.full_name || '',
                    email: user.email || '',
                    professional_email: data.professional_email || '',
                    website: data.website || '',
                    logo_url: data.logo_url || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    city: data.city || '',
                    postal_code: data.postal_code || '',

                    siret: data.siret || '',
                    google_review_url: data.google_review_url || '',
                    trade: data.trade || 'general',
                    iban: data.iban || '',
                    wero_phone: data.wero_phone || '',
                    openai_api_key: aiPrefs.openai_api_key || localStorage.getItem('openai_api_key') || '',
                    ai_provider: aiPrefs.ai_provider || localStorage.getItem('ai_provider') || 'openai',
                    ai_hourly_rate: aiPrefs.ai_hourly_rate || localStorage.getItem('ai_hourly_rate') || '',
                    // Zones
                    zone1_radius: aiPrefs.zone1_radius || localStorage.getItem('zone1_radius') || '',
                    zone1_price: aiPrefs.zone1_price || localStorage.getItem('zone1_price') || '',
                    zone2_radius: aiPrefs.zone2_radius || localStorage.getItem('zone2_radius') || '',
                    zone2_price: aiPrefs.zone2_price || localStorage.getItem('zone2_price') || '',
                    zone3_radius: aiPrefs.zone3_radius || localStorage.getItem('zone3_radius') || '',
                    zone3_price: aiPrefs.zone3_price || localStorage.getItem('zone3_price') || '',

                    ai_instructions: aiPrefs.ai_instructions || localStorage.getItem('ai_instructions') || ''
                });
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Erreur lors du chargement du profil');
        } finally {
            setLoading(false);
        }
    };

    const handleLogoUpload = async (e) => {
        try {
            setLoading(true);
            const file = e.target.files[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setFormData(prev => ({ ...prev, logo_url: publicUrl }));
            toast.success('Logo uploadé avec succès');
        } catch (error) {
            console.error('Error uploading logo:', error);
            toast.error('Erreur lors de l\'upload du logo');
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const { error } = await supabase
                .from('profiles')
                .update({
                    company_name: formData.company_name,
                    full_name: formData.full_name,
                    professional_email: formData.professional_email,
                    website: formData.website,
                    logo_url: formData.logo_url,
                    phone: formData.phone,
                    address: formData.address,
                    city: formData.city,
                    postal_code: formData.postal_code,

                    siret: formData.siret,
                    google_review_url: formData.google_review_url,
                    trade: formData.trade,
                    iban: formData.iban,
                    wero_phone: formData.wero_phone,

                    // Save AI prefs to JSONB column
                    ai_preferences: {
                        openai_api_key: formData.openai_api_key,
                        ai_provider: formData.ai_provider,
                        ai_hourly_rate: formData.ai_hourly_rate,
                        zone1_radius: formData.zone1_radius,
                        zone1_price: formData.zone1_price,
                        zone2_radius: formData.zone2_radius,
                        zone2_price: formData.zone2_price,
                        zone3_radius: formData.zone3_radius,
                        zone3_price: formData.zone3_price,
                        ai_instructions: formData.ai_instructions
                    },

                    updated_at: new Date(),
                })
                .eq('id', user.id);

            if (error) throw error;
            toast.success('Profil mis à jour avec succès');
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Erreur lors de la mise à jour du profil');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Paramètres de l'entreprise</h2>
                    <p className="text-gray-500 mt-1">Ces informations apparaîtront sur vos devis et factures.</p>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto">
                    <a
                        href="/app/settings/activity"
                        className="flex items-center justify-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                    >
                        <Building className="w-5 h-5 mr-2" />
                        Gérer mon activité (Fonctionnalités)
                    </a>
                    <button
                        onClick={async () => {
                            const { error } = await supabase.auth.signOut();
                            if (!error) window.location.href = '/login';
                        }}
                        className="text-sm text-red-500 hover:text-red-700 hover:underline text-center md:text-right"
                    >
                        Se déconnecter
                    </button>
                </div>
            </div>

            <form onSubmit={updateProfile} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-8 space-y-8">
                    {/* Identité */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Building className="w-5 h-5 mr-2 text-blue-600" />
                            Identité de l'entreprise
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
                                <input
                                    type="text"
                                    name="company_name"
                                    value={formData.company_name}
                                    onChange={handleChange}
                                    placeholder="Ex: Martin Rénovation"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Votre nom complet</label>
                                <input
                                    type="text"
                                    name="full_name"
                                    value={formData.full_name}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Numéro SIRET</label>
                                <input
                                    type="text"
                                    name="siret"
                                    value={formData.siret}
                                    onChange={handleChange}
                                    placeholder="14 chiffres"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Métier principal</label>
                                <select
                                    name="trade"
                                    value={formData.trade}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {Object.entries(TRADE_CONFIG).map(([key, config]) => (
                                        <option key={key} value={key}>
                                            {config.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Coordonnées */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                            Coordonnées
                        </h3>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Code Postal</label>
                                    <input
                                        type="text"
                                        name="postal_code"
                                        value={formData.postal_code}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                                    <input
                                        type="text"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Phone className="w-5 h-5 mr-2 text-blue-600" />
                            Contact & Web
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Professionnel (pour les devis)</label>
                                <input
                                    type="email"
                                    name="professional_email"
                                    value={formData.professional_email}
                                    onChange={handleChange}
                                    placeholder="contact@monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">Si vide, l'email de connexion ({formData.email}) sera utilisé.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Site Web</label>
                                <input
                                    type="text"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    onBlur={(e) => {
                                        let val = e.target.value.trim();
                                        if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                                            setFormData(prev => ({ ...prev, website: 'https://' + val }));
                                        }
                                    }}
                                    placeholder="monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Lien Avis Google</label>
                                <input
                                    type="url"
                                    name="google_review_url"
                                    value={formData.google_review_url}
                                    onChange={handleChange}
                                    placeholder="https://g.page/r/..."
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">Lien direct pour laisser un avis sur votre fiche Google Business.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">IBAN (pour factures)</label>
                                <input
                                    type="text"
                                    name="iban"
                                    value={formData.iban}
                                    onChange={handleChange}
                                    placeholder="FR76 ..."
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Numéro Wero / Paylib</label>
                                <input
                                    type="tel"
                                    name="wero_phone"
                                    value={formData.wero_phone}
                                    onChange={handleChange}
                                    placeholder="06 00 00 00 00"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">Si différent du téléphone de contact. Utile pour les paiements instantanés.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                                <div className="flex items-center space-x-4">
                                    {formData.logo_url && (
                                        <img src={formData.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-xl border border-gray-200" />
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                </div>
                                <input
                                    type="hidden"
                                    name="logo_url"
                                    value={formData.logo_url}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                    </button>
                </div>
            </form >

            {/* Notifications Mobile */}
            <div className="mt-8 bg-blue-50 rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                        <Bell className="w-5 h-5 mr-2" />
                        Notifications Mobile
                    </h3>
                    <p className="text-sm text-blue-800 mb-4">
                        Pour recevoir une notification sur votre téléphone lorsqu'un devis est signé :
                    </p>
                    <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2 mb-6">
                        <li>Téléchargez l'application gratuite <strong>Ntfy</strong> (Android / iOS)</li>
                        <li>Ajoutez un abonnement au sujet suivant :</li>
                    </ol>
                    <div className="bg-white p-4 rounded-lg border border-blue-200 flex items-center justify-between">
                        <code className="text-blue-600 font-mono font-bold select-all">
                            {getNotificationTopic(user?.id)}
                        </code>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(getNotificationTopic(user?.id));
                                toast.success('Sujet copié !');
                            }}
                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded transition-colors"
                        >
                            Copier
                        </button>
                    </div>
                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={async () => {
                                const { sendNotification } = await import('../utils/notifications'); // Dynamic import to avoid circular dep if any
                                try {
                                    await sendNotification(user?.id, "Ceci est un test de notification !", "Test Artisan Facile");
                                    toast.success('Notification de test envoyée !');
                                } catch (e) {
                                    toast.error('Erreur lors de l\'envoi');
                                    console.error(e);
                                }
                            }}
                            className="text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-4 py-2 rounded-lg flex items-center w-full sm:w-auto justify-center"
                        >
                            <Bell className="w-4 h-4 mr-2" />
                            Envoyer une notification de test
                        </button>
                        <p className="text-xs text-blue-600 mt-2">
                            Si vous ne recevez rien après avoir cliqué, vérifiez que vous êtes bien abonné au sujet ci-dessus dans l'application ntfy.
                        </p>
                    </div>
                </div>
            </div>

            {/* AI Settings */}
            <div className="mt-8 bg-purple-50 rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-purple-900 mb-4 flex items-center">
                        <span className="mr-2">✨</span>
                        Intelligence Artificielle
                    </h3>
                    <p className="text-sm text-purple-800 mb-6">
                        Configurez votre clé API pour activer les fonctionnalités d'assistant intelligent (génération de devis automatique, etc.).
                    </p>

                    <div className="max-w-md space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-purple-900 mb-2">Fournisseur d'IA</label>
                            <div className="flex gap-2 p-1 bg-purple-100 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'openai' });
                                        localStorage.setItem('ai_provider', 'openai');
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${(!formData.ai_provider || formData.ai_provider === 'openai')
                                        ? 'bg-white text-purple-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    OpenAI (GPT)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, ai_provider: 'gemini' });
                                        localStorage.setItem('ai_provider', 'gemini');
                                    }}
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formData.ai_provider === 'gemini'
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-purple-600 hover:text-purple-800'
                                        }`}
                                >
                                    Google Gemini
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-purple-900 mb-2">
                                Clé API ({(!formData.ai_provider || formData.ai_provider === 'openai') ? 'OpenAI' : 'Gemini'})
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    placeholder={(!formData.ai_provider || formData.ai_provider === 'openai') ? "sk-..." : "AIza..."}
                                    className="flex-1 px-3 py-2 border border-purple-200 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                                    value={formData.openai_api_key || ''}
                                    onChange={(e) => {
                                        setFormData({ ...formData, openai_api_key: e.target.value });
                                        localStorage.setItem('openai_api_key', e.target.value);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => toast.success("Clé sauvegardée localement")}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                    Sauvegarder
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-purple-100">
                            <h4 className="text-sm font-semibold text-purple-900 mb-3">Personnalisation du contexte</h4>

                            <div>
                                <label className="block text-xs font-medium text-purple-800 mb-1">Taux Horaire Moyen (€/h)</label>
                                <input
                                    type="number"
                                    placeholder="ex: 50"
                                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                    value={formData.ai_hourly_rate || ''}
                                    onChange={(e) => {
                                        setFormData({ ...formData, ai_hourly_rate: e.target.value });
                                        localStorage.setItem('ai_hourly_rate', e.target.value);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-purple-800 mb-2">Zones de Déplacement (Auto-calculé)</label>
                            <div className="space-y-2">
                                {[1, 2, 3].map((zoneIndex) => {
                                    const radiusKey = `zone${zoneIndex}_radius`;
                                    const priceKey = `zone${zoneIndex}_price`;
                                    return (
                                        <div key={zoneIndex} className="flex gap-2 items-center">
                                            <span className="text-xs text-purple-600 w-12 font-medium">Zone {zoneIndex}</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="km"
                                                    className="w-full pl-3 pr-8 py-1.5 border border-purple-200 rounded-md text-sm"
                                                    value={formData[radiusKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [radiusKey]: val }));
                                                        localStorage.setItem(radiusKey, val);
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400">km</span>
                                            </div>
                                            <span className="text-gray-400 text-xs">→</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    placeholder="€"
                                                    className="w-full pl-3 pr-6 py-1.5 border border-purple-200 rounded-md text-sm"
                                                    value={formData[priceKey] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFormData(prev => ({ ...prev, [priceKey]: val }));
                                                        localStorage.setItem(priceKey, val);
                                                    }}
                                                />
                                                <span className="absolute right-2 top-1.5 text-xs text-gray-400">€</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-purple-600 mt-1">
                                Laissez vide pour désactiver une zone. Le calcul se fera automatiquement selon l'adresse du client.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-purple-800 mb-1">Instructions Spéciales pour l'IA</label>
                            <textarea
                                rows={3}
                                placeholder="Ex: Ne touche jamais à l'électricité. Ajoute toujours 10% de marge sur les matériaux. Je suis plombier spécialisé..."
                                className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                                value={formData.ai_instructions || ''}
                                onChange={(e) => {
                                    setFormData({ ...formData, ai_instructions: e.target.value });
                                    localStorage.setItem('ai_instructions', e.target.value);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Zone de Danger / Maintenance */}
            < div className="mt-8 bg-red-50 rounded-xl shadow-sm border border-red-100 overflow-hidden" >
                <div className="p-8">
                    <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center">
                        ⚠️ Zone de Maintenance
                    </h3>
                    <p className="text-sm text-red-700 mb-6">
                        Si vous rencontrez des problèmes de mise à jour ou d'affichage, utilisez ces options.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            type="button"
                            onClick={async () => {
                                if ('serviceWorker' in navigator) {
                                    const registrations = await navigator.serviceWorker.getRegistrations();
                                    for (const registration of registrations) {
                                        await registration.unregister();
                                    }
                                }
                                window.location.reload();
                            }}
                            className="px-4 py-2 bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50 font-medium text-sm transition-colors"
                        >
                            Forcer la mise à jour (Recharger)
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                if (window.confirm('Attention : Cela va effacer les données en mémoire locale et recharger l\'application. Vos données sur le serveur ne seront pas effacées. Continuer ?')) {
                                    localStorage.clear();
                                    if ('caches' in window) {
                                        const cacheNames = await caches.keys();
                                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                                    }
                                    if ('serviceWorker' in navigator) {
                                        const registrations = await navigator.serviceWorker.getRegistrations();
                                        for (const registration of registrations) {
                                            await registration.unregister();
                                        }
                                    }
                                    window.location.reload();
                                }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors"
                        >
                            Réinitialiser l'application
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
