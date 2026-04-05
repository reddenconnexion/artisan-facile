import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Check, Rocket, Building2, Users, FileText, Send, BarChart3, Sparkles, Mic, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClients, useQuotes } from '../hooks/useDataCache';

const SLIDES = [
    {
        id: 'welcome',
        icon: Rocket,
        iconBg: 'bg-blue-600',
        title: 'Bienvenue sur Artisan Facile 👋',
        subtitle: 'Votre assistant devis professionnel',
        content: (
            <div className="space-y-3">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    Artisan Facile vous permet de créer, envoyer et faire signer des devis professionnels
                    depuis votre téléphone — en moins de 2 minutes, depuis n'importe où.
                </p>
                <div className="grid grid-cols-1 gap-2 mt-4">
                    {[
                        { emoji: '⚡', text: 'Devis en 2 minutes, même sur chantier' },
                        { emoji: '✍️', text: 'Signature électronique par vos clients' },
                        { emoji: '📊', text: 'Comptabilité URSSAF automatique' },
                        { emoji: '🎤', text: 'Dictée vocale avec IA intégrée' },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2.5">
                            <span className="text-lg">{item.emoji}</span>
                            <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                        </div>
                    ))}
                </div>
            </div>
        ),
    },
    {
        id: 'profile',
        icon: Building2,
        iconBg: 'bg-amber-500',
        title: 'Commencez par votre profil 🏢',
        subtitle: 'Obligatoire pour des devis légalement valides',
        content: (
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    Vos informations apparaissent sur chaque devis. Sans elles, vos devis ne sont
                    pas conformes légalement.
                </p>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
                    {[
                        { label: 'Nom / raison sociale', required: true },
                        { label: 'Numéro SIRET', required: true },
                        { label: 'Adresse professionnelle', required: true },
                        { label: 'Logo de l\'entreprise', required: false },
                        { label: 'Coordonnées bancaires (pour les factures)', required: false },
                    ].map((field, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${field.required ? 'bg-amber-500' : 'bg-gray-300'}`} />
                            <span className="text-gray-700 dark:text-gray-300">{field.label}</span>
                            {field.required && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium ml-auto">Requis</span>}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Accessible via <strong>Paramètres</strong> → votre profil artisan.
                </p>
            </div>
        ),
        action: { label: 'Compléter mon profil', href: '/app/settings' },
    },
    {
        id: 'clients',
        icon: Users,
        iconBg: 'bg-green-600',
        title: 'Ajoutez vos clients 👥',
        subtitle: 'Une fiche réutilisable sur tous vos devis',
        content: (
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    Créez une fiche pour chaque client. Ses coordonnées se pré-remplissent
                    automatiquement sur tous les devis que vous lui créez.
                </p>
                <div className="space-y-3">
                    <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <span className="text-2xl">1</span>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Clients → Nouveau client</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Nom, téléphone, adresse du chantier</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <span className="text-2xl">2</span>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Depuis la fiche client → Créer devis</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Le devis est pré-rempli avec ses infos</p>
                        </div>
                    </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm text-green-800 dark:text-green-300">
                    💡 Vous pouvez aussi créer le client directement depuis le formulaire devis.
                </div>
            </div>
        ),
        action: { label: 'Ajouter un client', href: '/app/clients/new' },
    },
    {
        id: 'quote',
        icon: FileText,
        iconBg: 'bg-violet-600',
        title: 'Créez votre premier devis 📝',
        subtitle: 'Main d\'œuvre, matériaux, sections',
        content: (
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    Le formulaire devis est conçu pour aller vite. Ajoutez des lignes en un clic
                    et laissez l'IA remplir les descriptions si vous le souhaitez.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', label: '🔧 Main d\'œuvre', desc: 'Prestations, pose, travaux' },
                        { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', label: '📦 Matériel', desc: 'Fournitures, produits' },
                        { color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300', label: '📋 Section', desc: 'Séparer les lots' },
                        { color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300', label: '✨ IA', desc: 'Auto-remplissage smart' },
                    ].map((btn, i) => (
                        <div key={i} className={`rounded-lg p-3 ${btn.color}`}>
                            <p className="text-xs font-semibold">{btn.label}</p>
                            <p className="text-xs mt-0.5 opacity-75">{btn.desc}</p>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <Mic className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                    <span>Astuce : utilisez le bouton <strong>micro</strong> en bas de l'écran pour dicter votre devis depuis le chantier.</span>
                </div>
            </div>
        ),
        action: { label: 'Créer un devis', href: '/app/devis/new' },
    },
    {
        id: 'send',
        icon: Send,
        iconBg: 'bg-sky-600',
        title: 'Envoyez et faites signer ✍️',
        subtitle: 'Le client signe depuis son téléphone',
        content: (
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    Une fois votre devis prêt, envoyez-le par email en un clic. Votre client
                    reçoit un lien sécurisé pour le consulter et le signer électroniquement.
                </p>
                <div className="space-y-2">
                    {[
                        { step: '1', label: 'Cliquez sur "Envoyer par email"', detail: 'Dans le devis, menu "Actions"' },
                        { step: '2', label: 'Le client reçoit un lien', detail: 'Page dédiée, sans compte requis' },
                        { step: '3', label: 'Il signe au doigt ou à la souris', detail: 'Signature légalement valide' },
                        { step: '4', label: 'Vous êtes notifié', detail: 'Notification push ou email' },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {item.step}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ),
    },
    {
        id: 'accounting',
        icon: BarChart3,
        iconBg: 'bg-emerald-600',
        title: 'Suivi & Comptabilité 📊',
        subtitle: 'Tableau de bord, URSSAF, livre de recettes',
        content: (
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    L'application gère automatiquement le cycle de vie de vos devis et
                    compile les données pour votre déclaration URSSAF.
                </p>
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cycle de vie d'un devis</p>
                    <div className="flex items-center gap-1 flex-wrap">
                        {['Brouillon', '→', 'Envoyé', '→', 'Accepté', '→', 'Payé'].map((label, i) => (
                            <span key={i} className={
                                label === '→'
                                    ? 'text-gray-300 text-sm'
                                    : 'text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }>
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Calcul URSSAF</p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Mensuel ou trimestriel, taux 2026</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Livre de recettes</p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Export CSV conforme légalement</p>
                    </div>
                </div>
            </div>
        ),
        action: { label: 'Voir la comptabilité', href: '/app/accounting' },
    },
    {
        id: 'advanced',
        icon: Sparkles,
        iconBg: 'bg-purple-600',
        title: 'Fonctionnalités avancées 🚀',
        subtitle: 'IA, mobile, raccourcis — allez plus loin',
        content: (
            <div className="space-y-3">
                {[
                    {
                        icon: Mic,
                        color: 'text-blue-500',
                        bg: 'bg-blue-50 dark:bg-blue-900/20',
                        label: 'Mémos vocaux',
                        desc: 'Dictez un devis depuis le chantier. L\'IA transcrit et crée les lignes automatiquement.',
                    },
                    {
                        icon: Smartphone,
                        color: 'text-green-500',
                        bg: 'bg-green-50 dark:bg-green-900/20',
                        label: 'Installer sur mobile',
                        desc: 'Ajoutez l\'app à votre écran d\'accueil iPhone/Android pour un accès instantané.',
                    },
                    {
                        icon: Sparkles,
                        color: 'text-violet-500',
                        bg: 'bg-violet-50 dark:bg-violet-900/20',
                        label: 'IA dans les devis',
                        desc: '"Générer avec l\'IA" remplit les lignes de main d\'œuvre et matériaux automatiquement.',
                    },
                ].map((feature, i) => {
                    const Icon = feature.icon;
                    return (
                        <div key={i} className={`flex items-start gap-3 rounded-lg p-3 ${feature.bg}`}>
                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${feature.color}`} />
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{feature.label}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{feature.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        ),
        action: { label: 'Voir le guide complet', href: '/app/guide' },
    },
];

const OnboardingGuide = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const dismissKey = `onboarding_guide_shown_${user?.id}`;
    const [open, setOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    const { data: clients = [], isLoading: loadingClients } = useClients();
    const { data: quotes = [], isLoading: loadingQuotes } = useQuotes();

    // Show for new users who haven't seen it yet
    useEffect(() => {
        if (!user?.id || loadingClients || loadingQuotes) return;
        if (localStorage.getItem(dismissKey) === '1') return;
        // New user = no quotes and no clients (or very fresh)
        if (clients.length === 0 && quotes.length === 0) {
            const t = setTimeout(() => setOpen(true), 1200);
            return () => clearTimeout(t);
        }
    }, [user?.id, loadingClients, loadingQuotes, clients.length, quotes.length]);

    const dismiss = () => {
        localStorage.setItem(dismissKey, '1');
        setOpen(false);
    };

    const goNext = () => {
        if (currentSlide < SLIDES.length - 1) {
            setCurrentSlide(s => s + 1);
        } else {
            dismiss();
        }
    };

    const goPrev = () => {
        if (currentSlide > 0) setCurrentSlide(s => s - 1);
    };

    const handleAction = (href) => {
        dismiss();
        navigate(href);
    };

    if (!open) return null;

    const slide = SLIDES[currentSlide];
    const SlideIcon = slide.icon;
    const isLast = currentSlide === SLIDES.length - 1;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${slide.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <SlideIcon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">{slide.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{slide.subtitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={dismiss}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                        title="Passer le guide"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-1.5 pb-3">
                    {SLIDES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentSlide(i)}
                            className={`rounded-full transition-all ${
                                i === currentSlide
                                    ? 'w-5 h-2 bg-blue-600'
                                    : i < currentSlide
                                    ? 'w-2 h-2 bg-blue-300'
                                    : 'w-2 h-2 bg-gray-200 dark:bg-gray-700'
                            }`}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="px-5 pb-4 flex-1 overflow-y-auto max-h-96">
                    {slide.content}
                </div>

                {/* Footer */}
                <div className="px-5 pt-3 pb-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                    <button
                        onClick={goPrev}
                        disabled={currentSlide === 0}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Préc.
                    </button>

                    <div className="flex items-center gap-2 flex-1 justify-end">
                        {slide.action && (
                            <button
                                onClick={() => handleAction(slide.action.href)}
                                className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            >
                                {slide.action.label}
                            </button>
                        )}
                        <button
                            onClick={goNext}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                            {isLast ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    Démarrer
                                </>
                            ) : (
                                <>
                                    Suivant
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OnboardingGuide;
