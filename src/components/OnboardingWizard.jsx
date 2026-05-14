import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Check, Sparkles, Building2, MapPin, Settings, Image as ImageIcon, Loader2, Upload, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useUserProfile, useInvalidateCache } from '../hooks/useDataCache';
import { TRADE_CONFIG } from '../constants/trades';

const STEPS = [
    { id: 'identity',  icon: Building2, label: 'Identité',  subtitle: 'Votre entreprise' },
    { id: 'address',   icon: MapPin,    label: 'Adresse',   subtitle: 'Coordonnées postales' },
    { id: 'settings',  icon: Settings,  label: 'Réglages',  subtitle: 'Email pro & paiement' },
    { id: 'logo',      icon: ImageIcon, label: 'Logo',      subtitle: 'Finalisation' },
];

const INITIAL_FORM = {
    company_name: '',
    trade: 'general',
    siret: '',
    phone: '',
    address: '',
    postal_code: '',
    city: '',
    professional_email: '',
    iban: '',
    ai_hourly_rate: '',
    logo_url: '',
};

/**
 * Wizard d'onboarding 4 étapes, lancé au premier login (ou via bouton "Reprendre").
 * Persiste le profil à chaque étape pour ne pas perdre la progression.
 * À la fin, set `user_metadata.onboarding_wizard_completed = true`.
 */
const OnboardingWizard = ({ open, onClose }) => {
    const { user } = useAuth();
    const { data: profile } = useUserProfile();
    const { invalidateProfile } = useInvalidateCache();
    const navigate = useNavigate();

    const [stepIdx, setStepIdx] = useState(0);
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    // Pré-remplir depuis le profil existant à l'ouverture
    useEffect(() => {
        if (!open) return;
        setStepIdx(0);
        setFormData({
            company_name: profile?.company_name || '',
            trade: profile?.trade || 'general',
            siret: profile?.siret || '',
            phone: profile?.phone || '',
            address: profile?.address || '',
            postal_code: profile?.postal_code || '',
            city: profile?.city || '',
            professional_email: profile?.professional_email || user?.email || '',
            iban: profile?.iban || '',
            ai_hourly_rate: profile?.ai_preferences?.ai_hourly_rate || '',
            logo_url: profile?.logo_url || '',
        });
    }, [open, profile?.id, user?.email]);

    const step = STEPS[stepIdx];
    const isLast = stepIdx === STEPS.length - 1;
    const isFirst = stepIdx === 0;

    const update = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

    const canContinue = () => {
        if (step.id === 'identity') return !!formData.company_name.trim();
        return true;
    };

    const saveStep = async () => {
        if (!user) return false;
        setSaving(true);
        try {
            const payload = {};
            if (step.id === 'identity') {
                payload.company_name = formData.company_name.trim();
                payload.trade = formData.trade;
                payload.siret = formData.siret.replace(/\s/g, '');
                payload.phone = formData.phone.trim();
            } else if (step.id === 'address') {
                payload.address = formData.address.trim();
                payload.postal_code = formData.postal_code.trim();
                payload.city = formData.city.trim();
            } else if (step.id === 'settings') {
                payload.professional_email = formData.professional_email.trim();
                payload.iban = formData.iban.replace(/\s/g, '');
                const existingAi = profile?.ai_preferences || {};
                payload.ai_preferences = {
                    ...existingAi,
                    ai_hourly_rate: formData.ai_hourly_rate,
                };
            } else if (step.id === 'logo') {
                payload.logo_url = formData.logo_url;
            }

            const { error } = await supabase
                .from('profiles')
                .update(payload)
                .eq('id', user.id);
            if (error) throw error;
            invalidateProfile();
            return true;
        } catch (err) {
            toast.error(err.message || 'Impossible d\'enregistrer');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleNext = async () => {
        const ok = await saveStep();
        if (!ok) return;
        if (isLast) {
            await supabase.auth.updateUser({ data: { onboarding_wizard_completed: true } });
            toast.success('Profil configuré — vous êtes prêt à facturer !');
            onClose();
        } else {
            setStepIdx(i => i + 1);
        }
    };

    const handlePrev = () => setStepIdx(i => Math.max(0, i - 1));

    const handleSkipAll = async () => {
        await supabase.auth.updateUser({ data: { onboarding_wizard_completed: true } });
        onClose();
    };

    const handleFinishAndCreateQuote = async () => {
        const ok = await saveStep();
        if (!ok) return;
        await supabase.auth.updateUser({ data: { onboarding_wizard_completed: true } });
        toast.success('Profil configuré !');
        onClose();
        navigate('/app/devis/new');
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Logo trop volumineux (max 2 Mo)');
            return;
        }
        setUploadingLogo(true);
        try {
            const ext = file.name.split('.').pop();
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const filePath = `${user.id}-${hex}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from('logos')
                .upload(filePath, file, { contentType: file.type });
            if (upErr) throw upErr;
            const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
            update('logo_url', data.publicUrl);
            toast.success('Logo téléchargé');
        } catch (err) {
            toast.error(err.message || 'Erreur upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                                <Rocket className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Configuration initiale
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                            title="Reprendre plus tard"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    {/* Progress dots */}
                    <div className="flex items-center gap-2">
                        {STEPS.map((s, i) => {
                            const isDone = i < stepIdx;
                            const isActive = i === stepIdx;
                            const Icon = s.icon;
                            return (
                                <React.Fragment key={s.id}>
                                    <div
                                        className={`flex items-center gap-1.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : isDone ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'}`}
                                    >
                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                                isActive ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500' :
                                                isDone   ? 'bg-green-100 dark:bg-green-900/40' :
                                                           'bg-gray-100 dark:bg-gray-800'
                                            }`}
                                        >
                                            {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                                        </div>
                                        <span className="hidden sm:inline text-xs font-semibold">{s.label}</span>
                                    </div>
                                    {i < STEPS.length - 1 && (
                                        <div className={`flex-1 h-0.5 rounded-full ${isDone ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{step.label}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{step.subtitle}</p>

                    {step.id === 'identity' && (
                        <div className="space-y-4">
                            <Field label="Nom de l'entreprise" required>
                                <input
                                    type="text"
                                    value={formData.company_name}
                                    onChange={e => update('company_name', e.target.value)}
                                    placeholder="Ex. Dupont Plomberie"
                                    autoFocus
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                            <Field label="Métier" hint="Adapte les libellés et catégories de matériaux">
                                <select
                                    value={formData.trade}
                                    onChange={e => update('trade', e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                >
                                    {Object.entries(TRADE_CONFIG).map(([key, config]) => (
                                        <option key={key} value={key}>{config.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="SIRET" hint="14 chiffres — obligatoire sur les devis légaux">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formData.siret}
                                    onChange={e => update('siret', e.target.value)}
                                    placeholder="123 456 789 00012"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                            <Field label="Téléphone professionnel">
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => update('phone', e.target.value)}
                                    placeholder="06 12 34 56 78"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                        </div>
                    )}

                    {step.id === 'address' && (
                        <div className="space-y-4">
                            <Field label="Adresse" hint="Apparaît sur vos devis et factures">
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={e => update('address', e.target.value)}
                                    placeholder="12 rue de la Paix"
                                    autoFocus
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Code postal">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formData.postal_code}
                                        onChange={e => update('postal_code', e.target.value)}
                                        placeholder="75001"
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    />
                                </Field>
                                <div className="col-span-2">
                                    <Field label="Ville">
                                        <input
                                            type="text"
                                            value={formData.city}
                                            onChange={e => update('city', e.target.value)}
                                            placeholder="Paris"
                                            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                        />
                                    </Field>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                💡 Ces informations permettent aussi de calculer automatiquement vos frais de déplacement plus tard.
                            </p>
                        </div>
                    )}

                    {step.id === 'settings' && (
                        <div className="space-y-4">
                            <Field label="Email professionnel" hint="Adresse où vos clients vous répondent">
                                <input
                                    type="email"
                                    value={formData.professional_email}
                                    onChange={e => update('professional_email', e.target.value)}
                                    placeholder="contact@monentreprise.fr"
                                    autoFocus
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                            <Field label="Taux horaire indicatif (€/h)" hint="Utilisé par l'IA pour estimer le coût de la main-d'œuvre">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={formData.ai_hourly_rate}
                                    onChange={e => update('ai_hourly_rate', e.target.value)}
                                    placeholder="45"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </Field>
                            <Field label="IBAN" hint="Apparaît sur les factures pour faciliter le règlement">
                                <input
                                    type="text"
                                    value={formData.iban}
                                    onChange={e => update('iban', e.target.value)}
                                    placeholder="FR76 …"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                                />
                            </Field>
                        </div>
                    )}

                    {step.id === 'logo' && (
                        <div className="space-y-4">
                            <Field label="Logo de l'entreprise (optionnel)" hint="Apparaît en haut de vos devis et factures">
                                {formData.logo_url ? (
                                    <div className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                                        <img src={formData.logo_url} alt="Logo" className="w-16 h-16 object-contain bg-white rounded" />
                                        <div className="flex-1">
                                            <p className="text-sm text-green-600 dark:text-green-400 font-medium">Logo téléchargé</p>
                                            <button
                                                type="button"
                                                onClick={() => update('logo_url', '')}
                                                className="text-xs text-red-500 hover:text-red-700"
                                            >
                                                Supprimer
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
                                        {uploadingLogo ? (
                                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                                        ) : (
                                            <Upload className="w-6 h-6 text-gray-400" />
                                        )}
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {uploadingLogo ? 'Téléchargement…' : 'Cliquer pour choisir un fichier'}
                                        </span>
                                        <span className="text-xs text-gray-400">PNG ou JPG · max 2 Mo</span>
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/svg+xml"
                                            onChange={handleLogoUpload}
                                            disabled={uploadingLogo}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </Field>

                            <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Tout est prêt !
                                        </p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            Vous pouvez démarrer immédiatement avec votre premier devis ou explorer le tableau de bord.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={isFirst ? handleSkipAll : handlePrev}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-50"
                    >
                        {isFirst ? (
                            'Passer'
                        ) : (
                            <>
                                <ChevronLeft className="w-4 h-4" />
                                Précédent
                            </>
                        )}
                    </button>

                    <div className="flex items-center gap-2">
                        {isLast ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Terminer'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleFinishAndCreateQuote}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg disabled:opacity-50 shadow-sm"
                                >
                                    Créer mon 1er devis
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={saving || !canContinue()}
                                className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 shadow-sm"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                    <>
                                        Continuer
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

const Field = ({ label, hint, required, children }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
        {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
);

export default OnboardingWizard;
