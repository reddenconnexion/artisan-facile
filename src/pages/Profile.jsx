import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Building, Settings, Send, SlidersHorizontal, Crown, ChevronRight } from 'lucide-react';
import SegmentedControl from '../components/ui/SegmentedControl';
import AchievementsCard from '../components/AchievementsCard';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useConfirm } from '../context/ConfirmContext';
import { useInvalidateCache } from '../hooks/useDataCache';
import { useProfileForm } from './profile/useProfileForm';
import { useB2BReceiver } from './profile/useB2BReceiver';
import { useAiSettings } from './profile/useAiSettings';
import { usePdpConfig } from './profile/usePdpConfig';
import { useSmtpSettings } from './profile/useSmtpSettings';
import { useEmailSignature } from './profile/useEmailSignature';
import { useLoginEmailChange } from './profile/useLoginEmailChange';
import CompanyForm from './profile/CompanyForm';
import PushNotificationsSection from './profile/PushNotificationsSection';
import SmtpSection from './profile/SmtpSection';
import EmailSignatureSection from './profile/EmailSignatureSection';
import PreferencesSection from './profile/PreferencesSection';
import AdminSection from './profile/AdminSection';
import AdvancedSettingsSection from './profile/AdvancedSettingsSection';
import PdpSection from './profile/PdpSection';
import LoginEmailSection from './profile/LoginEmailSection';
import AppUpdateSection from './profile/AppUpdateSection';
import ActivitySettings from './settings/ActivitySettings';

const Profile = () => {
    // Component for managing artisan profile settings
    const { user } = useAuth();
    const confirm = useConfirm();
    const { invalidateProfile } = useInvalidateCache();
    const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, isLoading: isPushLoading, permission: pushPermission, subscribe: subscribePush, unsubscribe: unsubscribePush, sendTestNotification: sendTestPush } = usePushNotifications();
    const [isTestingPush, setIsTestingPush] = useState(false);

    // Onglet des réglages : « entreprise » (ce qui figure sur les documents),
    // « envoi » (notifications, email, facture électronique), « modules »
    // (fonctions affichées, relances, objectif), « application ».
    // Un lien peut ouvrir un onglet précis : /app/settings?tab=modules.
    const SETTINGS_TABS = ['entreprise', 'envoi', 'modules', 'application'];
    const [searchParams] = useSearchParams();
    const [settingsTab, setSettingsTab] = useState(() => {
        const fromUrl = searchParams.get('tab');
        if (SETTINGS_TABS.includes(fromUrl)) return fromUrl;
        try {
            const saved = localStorage.getItem('settings_tab');
            return SETTINGS_TABS.includes(saved) ? saved : 'entreprise';
        } catch { return 'entreprise'; }
    });
    const changeTab = (id) => {
        setSettingsTab(id);
        try { localStorage.setItem('settings_tab', id); } catch { /* stockage indisponible */ }
    };

    // Tout l'état des sections vit ici (hooks appelés sans condition) et non
    // dans les composants d'onglet, rendus conditionnellement : une saisie non
    // enregistrée (SMTP, clé API, PDP…) survit ainsi à un changement d'onglet.
    const b2b = useB2BReceiver();
    const profileForm = useProfileForm({
        user,
        invalidateProfile,
        b2bReceiverStatus: b2b.b2bReceiverStatus,
        registerB2BReceiver: b2b.registerB2BReceiver,
    });
    const ai = useAiSettings();
    const pdp = usePdpConfig(user);
    const smtp = useSmtpSettings(confirm);
    const signature = useEmailSignature(user);
    const loginEmail = useLoginEmailChange(user);

    const { setLoading } = profileForm;

    useEffect(() => {
        if (user) {
            getProfile();
        }
    }, [user]);

    const getProfile = async () => {
        try {
            setLoading(true);
            // RPC `get_my_profile_safe` : strippe les clés API sensibles côté serveur
            // → la clé OpenAI/PDP n'arrive jamais dans la mémoire du navigateur.
            const { data, error } = await supabase.rpc('get_my_profile_safe');

            if (error) throw error;

            if (data) {
                ai.loadFromProfile(data);
                pdp.loadFromProfile(data);
                smtp.loadFromProfile(data);
                signature.loadFromProfile(data);
                profileForm.loadFromProfile(data);
                b2b.loadFromProfile(data);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Erreur lors du chargement du profil');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="ios-title">Réglages</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {settingsTab === 'entreprise' && 'Ces informations apparaîtront sur vos devis et factures.'}
                        {settingsTab === 'envoi' && 'Comment vos documents partent et comment vous êtes prévenu.'}
                        {settingsTab === 'modules' && 'Les fonctions affichées dans le menu, vos relances et votre objectif.'}
                        {settingsTab === 'application' && 'Préférences, tarifs, abonnement et compte.'}
                    </p>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto">
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

            <SegmentedControl
                className="mb-6"
                value={settingsTab}
                onChange={changeTab}
                options={[
                    { id: 'entreprise', label: 'Mon entreprise', icon: Building },
                    { id: 'envoi', label: 'Envoi & documents', icon: Send },
                    { id: 'modules', label: 'Modules', icon: SlidersHorizontal },
                    { id: 'application', label: 'Application', icon: Settings },
                ]}
            />

            {settingsTab === 'entreprise' && (<>
            <CompanyForm
                formData={profileForm.formData}
                setFormData={profileForm.setFormData}
                handleChange={profileForm.handleChange}
                updateProfile={profileForm.updateProfile}
                loading={profileForm.loading}
                siretCheck={profileForm.siretCheck}
                handleLogoUpload={profileForm.handleLogoUpload}
                b2bReceiverStatus={b2b.b2bReceiverStatus}
                b2bReceiverError={b2b.b2bReceiverError}
                registerB2BReceiver={b2b.registerB2BReceiver}
            />
            </>)}


            {settingsTab === 'envoi' && (<>
            {/* Notifications Push */}
            <PushNotificationsSection
                isPushSupported={isPushSupported}
                isPushSubscribed={isPushSubscribed}
                isPushLoading={isPushLoading}
                pushPermission={pushPermission}
                subscribePush={subscribePush}
                unsubscribePush={unsubscribePush}
                sendTestPush={sendTestPush}
                isTestingPush={isTestingPush}
                setIsTestingPush={setIsTestingPush}
            />

            {/* Envoi direct par email (SMTP perso) */}
            <SmtpSection
                smtpForm={smtp.smtpForm}
                smtpPasswordConfigured={smtp.smtpPasswordConfigured}
                savingSmtp={smtp.savingSmtp}
                testingSmtp={smtp.testingSmtp}
                showSmtpPanel={smtp.showSmtpPanel}
                setShowSmtpPanel={smtp.setShowSmtpPanel}
                handleSmtpFieldChange={smtp.handleSmtpFieldChange}
                handleSmtpPreset={smtp.handleSmtpPreset}
                handleSaveSmtp={smtp.handleSaveSmtp}
                handleTestSmtp={smtp.handleTestSmtp}
                handleDeleteSmtp={smtp.handleDeleteSmtp}
            />

            {/* Signature email */}
            <EmailSignatureSection
                emailSignatureHtml={signature.emailSignatureHtml}
                setEmailSignatureHtml={signature.setEmailSignatureHtml}
                savingSignature={signature.savingSignature}
                signaturePreview={signature.signaturePreview}
                setSignaturePreview={signature.setSignaturePreview}
                signatureImageWidth={signature.signatureImageWidth}
                setSignatureImageWidth={signature.setSignatureImageWidth}
                handleSaveSignature={signature.handleSaveSignature}
                handleSignatureImageUpload={signature.handleSignatureImageUpload}
            />

            {/* Plateforme Agréée (e-facture) */}
            <PdpSection
                pdpKeyConfigured={pdp.pdpKeyConfigured}
                pdpUrlInput={pdp.pdpUrlInput}
                setPdpUrlInput={pdp.setPdpUrlInput}
                pdpServiceInput={pdp.pdpServiceInput}
                setPdpServiceInput={pdp.setPdpServiceInput}
                pdpKeyInput={pdp.pdpKeyInput}
                setPdpKeyInput={pdp.setPdpKeyInput}
                savingPdpConfig={pdp.savingPdpConfig}
                handleSavePdpConfig={pdp.handleSavePdpConfig}
                handleDeletePdpConfig={pdp.handleDeletePdpConfig}
            />
            </>)}

            {settingsTab === 'modules' && <ActivitySettings embedded />}

            {settingsTab === 'application' && (<>
            {/* Abonnement — auparavant accessible seulement en touchant son nom */}
            <Link
                to="/app/subscription"
                className="mt-2 flex items-center justify-between gap-3 px-6 py-4 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
                <span className="flex items-center gap-3">
                    <Crown className="w-5 h-5 text-violet-500" />
                    <span>
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white">Abonnement</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">Votre formule, l'utilisation et la facturation</span>
                    </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>

            {/* Jalons de maîtrise (gamification discrète) */}
            <AchievementsCard />

            {/* Préférences de l'application */}
            <PreferencesSection />

            {/* Pilotage plateforme — administrateur uniquement */}
            <AdminSection />

            {/* AI Settings — Paramètres avancés */}
            <AdvancedSettingsSection
                formData={profileForm.formData}
                setFormData={profileForm.setFormData}
                showAdvanced={ai.showAdvanced}
                setShowAdvanced={ai.setShowAdvanced}
                apiKeyConfigured={ai.apiKeyConfigured}
                apiKeyInput={ai.apiKeyInput}
                setApiKeyInput={ai.setApiKeyInput}
                savingApiKey={ai.savingApiKey}
                handleSaveApiKey={ai.handleSaveApiKey}
                handleDeleteApiKey={ai.handleDeleteApiKey}
                calcCatalog={ai.calcCatalog}
                setCalcCatalog={ai.setCalcCatalog}
                calcDiscount={ai.calcDiscount}
                setCalcDiscount={ai.setCalcDiscount}
                updateProfile={profileForm.updateProfile}
                loading={profileForm.loading}
            />

            {/* Zone de Danger / Maintenance */}
            <LoginEmailSection
                user={user}
                newEmail={loginEmail.newEmail}
                setNewEmail={loginEmail.setNewEmail}
                emailChanging={loginEmail.emailChanging}
                emailChangeSent={loginEmail.emailChangeSent}
                handleEmailChange={loginEmail.handleEmailChange}
            />

            {/* Mise à jour de l'app + réinitialisation */}
            <AppUpdateSection />
            </>)}

        </div>
    );
};

export default Profile;
