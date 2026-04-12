import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Calendar, Settings, LogOut, Menu, X, User, Kanban, Mic, HelpCircle, BookOpen, Wrench, Truck, Save, Moon, Sun, Box, Image as ImageIcon, Send, Calculator, Megaphone, ClipboardList, FlaskConical, Inbox, Keyboard, Crown, Zap, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import VoiceRecorderButton from '../components/VoiceRecorderButton';
import { ConfirmProvider } from '../context/ConfirmContext';
import { Toaster, toast } from 'sonner';
import VoiceHelpModal from '../components/VoiceHelpModal';
import TestModePanel from '../components/TestModePanel';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useVoice } from '../hooks/useVoice';
import { processVoiceCommand } from '../utils/voiceCommands';
import { usePlanLimits } from '../hooks/usePlanLimits';

import { JOB_LIBRARIES } from '../constants/jobLibraries';
import { useSignatureNotifications } from '../hooks/useSignatureNotifications';
import { usePendingCounts, useUserProfile } from '../hooks/useDataCache';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const { isTestMode, capturedEmails, enableTestMode } = useTestMode();
  const [showVoiceHelp, setShowVoiceHelp] = React.useState(false);
  const { user, signOut } = useAuth(); // Added user here
  const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
  const { total: pendingCount } = usePendingCounts();
  const { plan, isPro, isOwner } = usePlanLimits();
  const { data: profile } = useUserProfile();
  const profileBannerKey = `profile_banner_dismissed_${user?.id}`;
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(
    () => sessionStorage.getItem(profileBannerKey) === '1'
  );
  const profileIncomplete = profile && (!profile.company_name || !profile.siret);

  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('nav_expanded_groups');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleGroup = useCallback((groupName) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [groupName]: !prev[groupName] };
      localStorage.setItem('nav_expanded_groups', JSON.stringify(next));
      return next;
    });
  }, []);

  // Écouter les signatures de devis en temps réel
  useSignatureNotifications();

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    // Check local storage or system preference
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  // Job Library Hydration Logic
  React.useEffect(() => {
    const initLibrary = async () => {
      if (!user) return;

      const jobType = user.user_metadata?.job_type;
      // Simple localstorage check to avoid unneccessary DB calls
      const hasImported = localStorage.getItem(`library_imported_${user.id}`);

      if (jobType && !hasImported && JOB_LIBRARIES[jobType]) {
        try {
          // Check if library is effectively empty (safe check before auto-import)
          const { count, error } = await supabase
            .from('price_library')
            .select('*', { count: 'exact', head: true });

          if (!error && count === 0) {
            // Import default items
            const itemsToInsert = JOB_LIBRARIES[jobType].map(item => ({
              ...item,
              user_id: user.id
            }));

            const { error: insertError } = await supabase
              .from('price_library')
              .insert(itemsToInsert);

            if (!insertError) {
              const labels = {
                electricien: 'Électricien', plombier: 'Plombier', peintre: 'Peintre',
                macon: 'Maçon', menuisier: 'Menuisier', paysagiste: 'Paysagiste',
                chauffagiste: 'Chauffagiste', carreleur: 'Carreleur', plaquiste: 'Plaquiste',
                charpentier: 'Charpentier', multiservice: 'Multi-service',
              };
              const label = labels[jobType] || jobType;
              toast.success(`📚 Bibliothèque ${label} chargée`, {
                description: `${itemsToInsert.length} références prêtes à utiliser dans vos devis.`,
                duration: 6000,
                action: { label: 'Voir', onClick: () => navigate('/app/library') },
              });
              localStorage.setItem(`library_imported_${user.id}`, 'true');
            }
          } else {
            // Already has data, mark as imported locally to skip next check
            localStorage.setItem(`library_imported_${user.id}`, 'true');
          }
        } catch (err) {
          console.error("Error hydrating library:", err);
        }
      }
    };

    initLibrary();
  }, [user]);

  const navigationGroups = React.useMemo(() => {
    const jobType = user?.user_metadata?.job_type;
    const userSettings = user?.user_metadata?.activity_settings || {};

    // Smart defaults equivalent to ActivitySettings.jsx to avoid flickering empty nav
    const settings = {
      enable_agenda: userSettings.enable_agenda ?? true,
      enable_crm: userSettings.enable_crm ?? true,
      enable_price_library: userSettings.enable_price_library ?? true,
      enable_inventory: userSettings.enable_inventory ?? true,
      enable_maintenance: userSettings.enable_maintenance ?? ['plombier', 'chauffagiste', 'electricien'].includes(jobType),
      enable_rentals: userSettings.enable_rentals ?? (['macon', 'gros_oeuvre', 'peintre', 'paysagiste', 'terrassier'].includes(jobType) || !jobType),
      enable_intervention_reports: userSettings.enable_intervention_reports ?? true,
      enable_portfolio: userSettings.enable_portfolio ?? false,
      enable_marketing: userSettings.enable_marketing ?? false,
    };

    const chantierChildren = [
      ...(settings.enable_agenda ? [{ name: 'Agenda', href: '/app/agenda', icon: Calendar }] : []),
      ...(settings.enable_crm ? [{ name: 'Suivi Chantiers', href: '/app/crm', icon: Kanban }] : []),
      ...(settings.enable_intervention_reports ? [{ name: 'Rapports', href: '/app/interventions', icon: ClipboardList }] : []),
    ];

    const activiteChildren = [
      ...(settings.enable_portfolio ? [{ name: 'Portfolio', href: '/app/portfolio', icon: ImageIcon }] : []),
      ...(settings.enable_marketing ? [{ name: 'Marketing', href: '/app/marketing', icon: Megaphone }] : []),
      ...(settings.enable_inventory ? [{ name: 'Stock', href: '/app/inventory', icon: Box }] : []),
      ...(settings.enable_maintenance ? [{ name: 'Maintenance', href: '/app/maintenance', icon: Wrench }] : []),
    ];

    const outilsChildren = [
      ...(settings.enable_price_library ? [{ name: 'Bibliothèque prix', href: '/app/library', icon: BookOpen }] : []),
      { name: 'Mémos vocaux', href: '/app/voice-memos', icon: Mic },
      ...(settings.enable_rentals ? [{ name: 'Locations', href: '/app/rentals', icon: Truck }] : []),
      { name: 'Outils', href: '/app/outils', icon: Zap },
    ];

    // Skill level filtering — 'debutant' | 'intermediaire' | 'confirme'
    const skillLevel = userSettings.skill_level ?? 'debutant';
    const showInter = skillLevel === 'intermediaire' || skillLevel === 'confirme';
    const showConfirme = skillLevel === 'confirme';

    return [
      { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard },
      { name: 'Clients', href: '/app/clients', icon: Users },
      {
        name: 'Devis & Factures',
        icon: FileText,
        children: [
          { name: 'Devis & Factures', href: '/app/devis', icon: FileText },
          ...(showInter ? [{ name: 'Comptabilité', href: '/app/accounting', icon: Calculator }] : []),
        ],
      },
      ...(showInter && chantierChildren.length > 0 ? [{
        name: 'Chantiers',
        icon: Calendar,
        children: chantierChildren,
      }] : []),
      ...(showConfirme && activiteChildren.length > 0 ? [{
        name: 'Mon Activité',
        icon: ImageIcon,
        children: activiteChildren,
      }] : []),
      ...(showInter ? [{
        name: 'Outils',
        icon: Zap,
        children: outilsChildren.filter(c => showConfirme || c.href !== '/app/rentals'),
      }] : []),
      { name: 'Guide & Aide', href: '/app/guide', icon: HelpCircle },
    ];
  }, [user]);

  React.useEffect(() => {
    if (transcript) {
      const feedback = processVoiceCommand(transcript, navigate);
      if (feedback) {
        toast.success(feedback);
        resetTranscript();
        stopListening(); // Stop after successful command
      }
    }
  }, [transcript, navigate, resetTranscript, stopListening]);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Vous avez été déconnecté');
      navigate('/login');
    } catch (error) {
      toast.error('Erreur lors de la déconnexion');
    }
  };

  // Keyboard shortcuts
  const [showShortcuts, setShowShortcuts] = React.useState(false);

  const handleKeyboardShortcuts = useCallback((e) => {
    // Ignore shortcuts when typing in inputs/textareas
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

    if (e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          navigate('/app/devis/new');
          break;
        case 'c':
          e.preventDefault();
          navigate('/app/clients/new');
          break;
        case 'r':
          e.preventDefault();
          navigate('/app/agenda', { state: { openNewEvent: true } });
          break;
        case 'i':
          e.preventDefault();
          navigate('/app/interventions/new');
          break;
        case 'h':
          e.preventDefault();
          navigate('/app');
          break;
        default:
          break;
      }
    }

    if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      setShowShortcuts(prev => !prev);
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => document.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleKeyboardShortcuts]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Desktop Hover Logic
  const handleMouseEnter = () => {
    if (window.innerWidth >= 768) setIsCollapsed(false);
  };

  const handleMouseLeave = () => {
    if (window.innerWidth >= 768) setIsCollapsed(true);
  };

  // Close mobile menu on navigation
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Initial Collapsed State on Load
  React.useEffect(() => {
    setIsCollapsed(true);
  }, []);



  const [isDemo, setIsDemo] = React.useState(false);
  const [showConvertModal, setShowConvertModal] = React.useState(false);

  React.useEffect(() => {
    // Supabase anonymous auth sets is_anonymous = true
    // Fallback: detect local demo user by id
    const anonymous = user?.is_anonymous === true || user?.id === 'demo-local-fallback';
    setIsDemo(!!anonymous);
  }, [user]);

  const handleConvertAccount = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      const { error } = await supabase.auth.updateUser({ email, password });
      if (error) throw error;

      toast.success("Compte sauvegardé ! Veuillez confirmer votre nouvel email.");
      setShowConvertModal(false);
      // Ideally we should logout or just wait? If email changes, session might be invalid until confirm.
      // But usually we can keep using the session until expiry.
      // Let's just update the state to reflect it's not "demo" anymore (visually) or just say "Done".
      // Actually, `user` object might update via the subscription.
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde : " + err.message);
    }
  };

  return (
    <ConfirmProvider>
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />

      {/* Demo Banner */}
      {isDemo && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex-shrink-0 z-[60] flex items-center justify-center gap-3 text-sm px-4 py-2 shadow-md flex-wrap">
          <span className="font-medium">🧪 Mode démo — compte <strong>Électricité Moreau</strong>, données fictives</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConvertModal(true)}
              className="bg-white text-indigo-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-gray-100 transition-colors flex items-center gap-1"
            >
              <Save className="w-3 h-3" />
              Créer mon vrai compte
            </button>
          </div>
        </div>
      )}

      {/* Convert Demo → Real Account Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center">
                <Save className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Créer votre vrai compte</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Gratuit · Sans CB · Vos données démo seront conservées</p>
              </div>
              <button onClick={() => setShowConvertModal(false)} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Entrez un email et un mot de passe pour transformer cette session démo en compte permanent.
              Tous les devis et clients créés durant la démo seront conservés.
            </p>

            <form onSubmit={handleConvertAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email professionnel</label>
                <input
                  type="email" name="email" required
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="jean@electricite-moreau.fr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe (8 caractères min.)</label>
                <input
                  type="password" name="password" required minLength={8}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Un email de confirmation vous sera envoyé. Gratuit pour toujours sur l'essentiel.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowConvertModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  Annuler
                </button>
                <button type="submit" className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                  Créer mon compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Sidebar Overlay for Mobile */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`fixed md:relative inset-y-0 left-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            } md:translate-x-0 transition-all duration-300 ease-in-out bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col ${isCollapsed ? 'md:w-20' : 'md:w-64'
            } w-64`}
        >
          {/* Desktop Header / Logo */}
          <div className={`p-6 md:flex items-center hidden ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            <div className="flex items-center">
              <img src="/favicon.svg" alt="Logo Artisan Facile" className="w-10 h-10 rounded-lg" />
              {!isCollapsed && <h1 className="ml-3 text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">Artisan Facile</h1>}
            </div>
          </div>

          {/* Mobile Sidebar Header */}
          <div className="md:hidden p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="font-bold text-lg dark:text-white">Menu</span>
            <button onClick={() => setIsMobileMenuOpen(false)} className="dark:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-0.5 mt-4 md:mt-0 overflow-y-auto">
            {navigationGroups.map((group) => {
              const hasChildren = !!group.children;

              if (!hasChildren) {
                // Single link item
                const isActive = group.href === '/app'
                  ? location.pathname === '/app'
                  : location.pathname === group.href || location.pathname.startsWith(group.href + '/');
                return (
                  <Link
                    key={group.name}
                    to={group.href}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                      } ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
                  >
                    <group.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
                    {(!isCollapsed || isMobileMenuOpen) && group.name}
                  </Link>
                );
              }

              // Group with collapsible children
              const groupActive = group.children.some(child =>
                location.pathname === child.href || location.pathname.startsWith(child.href + '/')
              );
              const groupExpanded = groupActive || (expandedGroups[group.name] ?? false);
              const showBadge = group.name === 'Devis & Factures' && pendingCount > 0;

              return (
                <div key={group.name}>
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      groupActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                    } ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
                  >
                    <div className="relative flex-shrink-0">
                      <group.icon className={`w-5 h-5 ${groupActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
                      {showBadge && (
                        <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {pendingCount > 9 ? '9+' : pendingCount}
                        </span>
                      )}
                    </div>
                    {(!isCollapsed || isMobileMenuOpen) && (
                      <>
                        <span className="flex-1 text-left flex items-center gap-2">
                          {group.name}
                          {showBadge && (
                            <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              {pendingCount}
                            </span>
                          )}
                        </span>
                        {groupExpanded
                          ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        }
                      </>
                    )}
                  </button>
                  {groupExpanded && (!isCollapsed || isMobileMenuOpen) && (
                    <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l-2 border-gray-100 dark:border-gray-800 pl-3">
                      {group.children.map(child => {
                        const childActive = location.pathname === child.href || location.pathname.startsWith(child.href + '/');
                        return (
                          <Link
                            key={child.name}
                            to={child.href}
                            className={`flex items-center px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap ${
                              childActive
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                          >
                            <child.icon className={`w-4 h-4 mr-2.5 flex-shrink-0 ${childActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
            {/* Plan Badge */}
            <button
              onClick={() => navigate('/app/subscription')}
              className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''} ${
                isOwner
                  ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                  : isPro
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={`Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} — Voir l'abonnement`}
            >
              <Crown className={`w-5 h-5 flex-shrink-0 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'} ${
                isOwner ? 'text-violet-500' : isPro ? 'text-blue-500' : 'text-gray-400'
              }`} />
              {(!isCollapsed || isMobileMenuOpen) && (
                <span className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isOwner
                      ? 'bg-violet-200 dark:bg-violet-700 text-violet-800 dark:text-violet-100'
                      : isPro
                      ? 'bg-blue-200 dark:bg-blue-700 text-blue-800 dark:text-blue-100'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}>
                    {isOwner ? 'Owner' : isPro ? 'Pro' : 'Gratuit'}
                  </span>
                  {!isPro && <span className="text-xs text-gray-400 dark:text-gray-500">Passer au Pro</span>}
                </span>
              )}
            </button>

            {/* Dark Mode Toggle Button */}
            <button
              onClick={toggleDarkMode}
              className={`flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
              title={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {isDarkMode ? (
                <Sun className={`w-5 h-5 flex-shrink-0 text-yellow-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              ) : (
                <Moon className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              )}
              {(!isCollapsed || isMobileMenuOpen) && (isDarkMode ? 'Mode Clair' : 'Mode Sombre')}
            </button>

            <button
              onClick={() => setShowShortcuts(true)}
              className={`hidden md:flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
              title="Raccourcis clavier (?)"
            >
              <Keyboard className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              {(!isCollapsed || isMobileMenuOpen) && 'Raccourcis clavier'}
            </button>
            {/* Mode terrain — accès rapide depuis la sidebar */}
            <button
              onClick={() => navigate('/terrain')}
              className={`flex items-center w-full px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/10 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
              title="Mode terrain — vue simplifiée sur chantier"
            >
              <Wrench className={`w-5 h-5 flex-shrink-0 text-orange-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              {(!isCollapsed || isMobileMenuOpen) && 'Mode terrain'}
            </button>

            <button
              onClick={() => navigate('/app/settings')}
              className={`flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
            >
              <Settings className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              {(!isCollapsed || isMobileMenuOpen) && 'Paramètres'}
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
            >
              <LogOut className={`w-5 h-5 flex-shrink-0 text-red-400 dark:text-red-500 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
              {(!isCollapsed || isMobileMenuOpen) && 'Déconnexion'}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:pt-0">
          <main className="flex-1 overflow-y-auto">
            {/* Mobile Header - Scrolls with content */}
            <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center px-4 md:hidden flex-shrink-0">
              <div className="flex items-center gap-2">
                <img src="/favicon.svg" alt="Logo Artisan Facile" className="w-7 h-7 rounded-md" />
                <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Artisan Facile</h1>
              </div>
            </div>

            {/* Bannière profil incomplet */}
            {profileIncomplete && !profileBannerDismissed && (
              <div className="mx-4 md:mx-8 mt-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3 text-sm">
                <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
                <p className="text-amber-800 dark:text-amber-300 flex-1">
                  <span className="font-semibold">Profil incomplet —</span> vos devis n'auront pas les mentions légales obligatoires (nom d'entreprise, SIRET).{' '}
                  <Link to="/app/settings" className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200">
                    Compléter mon profil →
                  </Link>
                </p>
                <button
                  onClick={() => {
                    sessionStorage.setItem(profileBannerKey, '1');
                    setProfileBannerDismissed(true);
                  }}
                  className="p-1 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 rounded flex-shrink-0"
                  title="Masquer pour cette session"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="p-4 md:p-8 pb-24 md:pb-8">
              <Outlet />
            </div>
          </main>

          <VoiceHelpModal isOpen={showVoiceHelp} onClose={() => setShowVoiceHelp(false)} />
          {showTestPanel && <TestModePanel onClose={() => setShowTestPanel(false)} />}

          {/* Bannière mode test en bas de l'écran */}
          {isTestMode && !showTestPanel && (
            <button
              onClick={() => setShowTestPanel(true)}
              className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full shadow-lg transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              MODE TEST ACTIF
              {capturedEmails.length > 0 && (
                <span className="bg-white text-amber-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {capturedEmails.length}
                </span>
              )}
            </button>
          )}


          {/* Voice Pipeline Button */}
          <VoiceRecorderButton />

          {/* Contextual FAB — mobile only, action principale de la page courante */}
          {(() => {
            const FAB_ACTIONS = {
              '/app':               { label: 'Mode terrain',    Icon: Wrench,        to: '/terrain' },
              '/app/clients':       { label: 'Nouveau client',  Icon: Users,         to: '/app/clients/new' },
              '/app/devis':         { label: 'Nouveau devis',   Icon: FileText,      to: '/app/devis/new' },
              '/app/interventions': { label: 'Nouveau rapport', Icon: ClipboardList, to: '/app/interventions/new' },
            };
            const fab = FAB_ACTIONS[location.pathname];
            if (!fab) return null;
            return (
              <button
                onClick={() => navigate(fab.to)}
                className={`fixed bottom-[4.5rem] left-4 z-40 md:hidden flex items-center gap-2 pl-3 pr-4 py-3 text-white rounded-full shadow-lg transition-all active:scale-95 ${
                  fab.to === '/terrain'
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                aria-label={fab.label}
              >
                {fab.to === '/terrain'
                  ? <fab.Icon className="w-5 h-5 shrink-0" />
                  : <Plus className="w-5 h-5 shrink-0" />
                }
                <span className="text-sm font-semibold">{fab.label}</span>
              </button>
            );
          })()}
          {/* <div className="fixed bottom-24 md:bottom-6 right-6 flex items-center gap-3 z-30">
            <button
              onClick={() => setShowVoiceHelp(true)}
              className="p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-all transform hover:scale-105 active:scale-95"
              title="Aide commandes vocales"
            >
              <HelpCircle className="w-5 h-5 md:w-6 md:h-6" />
            </button>

            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-600 dark:bg-blue-500'
                } text-white`}
              title="Assistant Vocal"
            >
              <Mic className="w-6 h-6 md:w-6 md:h-6" />
            </button>
          </div> */}
        </div>
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-blue-600" />
                Raccourcis clavier
              </h2>
              <button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-4 h-4 dark:text-gray-300" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { keys: ['Alt', 'D'], label: 'Nouveau devis' },
                { keys: ['Alt', 'C'], label: 'Nouveau client' },
                { keys: ['Alt', 'R'], label: 'Nouveau RDV (agenda)' },
                { keys: ['Alt', 'I'], label: 'Nouveau rapport d\'intervention' },
                { keys: ['Alt', 'H'], label: 'Tableau de bord' },
                { keys: ['?'], label: 'Afficher / masquer cette aide' },
              ].map(({ keys, label }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="text-gray-700 dark:text-gray-300">{label}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k, i) => (
                      <React.Fragment key={k}>
                        <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-mono border border-gray-200 dark:border-gray-600">{k}</kbd>
                        {i < keys.length - 1 && <span className="text-gray-400 text-xs">+</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">Les raccourcis sont désactivés dans les champs de saisie</p>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation - Amazon Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 md:hidden flex justify-around items-center h-16 pb-safe safe-area-bottom">
        {[
          { name: 'Accueil', href: '/app', icon: LayoutDashboard },
          { name: 'Clients', href: '/app/clients', icon: Users },
          { name: 'Devis', href: '/app/devis', icon: FileText },
          // Check if Agenda is enabled
          ...(navigationGroups.some(g => g.children?.some(c => c.name === 'Agenda')) ? [{ name: 'Agenda', href: '/app/agenda', icon: Calendar }] : [])
        ].map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isMobileMenuOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
            }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </div>
    </ConfirmProvider>
  );
};

export default Layout;
