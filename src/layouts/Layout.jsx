import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Calendar, Settings, LogOut, Menu, X, Wrench, Save, Box, Megaphone, ClipboardList, FlaskConical, Inbox, Calculator, Crown, Zap, ChevronDown, ChevronRight, Plus, MessageSquare, MessageSquarePlus, Search, Repeat, Sun, Moon, ShoppingCart, Image, BarChart3, Scale, LineChart, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import VoiceRecorderButton from '../components/VoiceRecorderButton';
import SearchPalette from '../components/SearchPalette';
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
import { isAdmin } from '../constants/admin';

import { JOB_LIBRARIES } from '../constants/jobLibraries';
import { useSignatureNotifications } from '../hooks/useSignatureNotifications';
import { usePendingCounts, useUserProfile, useNewReceivedInvoicesCount, useUnreadPortalMessagesCount, useNewFeedbackCount } from '../hooks/useDataCache';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTrackUsage, useFrequentShortcuts } from '../hooks/useUsageTracking';
import { useAdaptiveOrder } from '../hooks/useAdaptiveOrder';
import { SHORTCUT_CATALOG } from '../constants/shortcuts';
import KeyboardShortcutsHelp from '../components/KeyboardShortcutsHelp';
import NotificationCenter from '../components/NotificationCenter';
import FeedbackModal from '../components/FeedbackModal';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showTestPanel, setShowTestPanel] = useState(false);
  const { isTestMode, capturedEmails, enableTestMode } = useTestMode();
  const [showVoiceHelp, setShowVoiceHelp] = React.useState(false);
  const { user, signOut } = useAuth(); // Added user here
  const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
  const { total: pendingCount } = usePendingCounts();
  const newReceivedCount = useNewReceivedInvoicesCount();
  const unreadPortalMessages = useUnreadPortalMessagesCount();
  const newFeedbackCount = useNewFeedbackCount();
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

  // Périphérique avec un vrai pointeur (souris/trackpad) — sur PC on ouvre
  // les sous-menus au survol; sur tactile on garde le toggle au tap.
  const isHoverDevice = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches,
    []
  );
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const hoverTimerRef = React.useRef(null);
  const handleGroupEnter = useCallback((name) => {
    if (!isHoverDevice) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredGroup(name);
  }, [isHoverDevice]);
  const handleGroupLeave = useCallback(() => {
    if (!isHoverDevice) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredGroup(null), 120);
  }, [isHoverDevice]);

  // Écouter les signatures de devis en temps réel
  useSignatureNotifications();

  // Apprentissage de l'usage pour adapter les raccourcis du tableau de bord
  useTrackUsage();
  // Destinations les plus utilisées pour la barre de navigation mobile (sans
  // les écrans de création, réservés au bouton flottant contextuel).
  const mobileFrequent = useFrequentShortcuts(3, { fillDefaults: false, excludeActions: true });

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
      enable_recurring: userSettings.enable_recurring ?? true,
    };

    const activiteChildren = [
      ...(settings.enable_agenda ? [{ name: 'Agenda', href: '/app/agenda', icon: Calendar }] : []),
      ...(settings.enable_intervention_reports ? [{ name: 'Rapports', href: '/app/interventions', icon: ClipboardList }] : []),
      { name: 'À commander', href: '/app/procurement', icon: ShoppingCart },
      { name: 'Comparateur achats', href: '/app/supplier-comparator', icon: Scale },
      ...(settings.enable_inventory ? [{ name: 'Stock', href: '/app/inventory', icon: Box }] : []),
      ...(settings.enable_maintenance ? [{ name: 'Maintenance', href: '/app/maintenance', icon: Wrench }] : []),
      ...(settings.enable_marketing ? [{ name: 'Marketing', href: '/app/marketing', icon: Megaphone }] : []),
      ...(settings.enable_portfolio ? [{ name: 'Portfolio', href: '/app/portfolio', icon: Image }] : []),
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
          { name: 'Tous les devis', href: '/app/devis', icon: FileText },
          ...(settings.enable_recurring ? [{ name: 'Factures récurrentes', href: '/app/recurring', icon: Repeat }] : []),
          { name: 'Factures reçues', href: '/app/received-invoices', icon: Inbox },
          { name: 'Comptabilité', href: '/app/accounting', icon: Calculator },
        ],
      },
      ...(showInter && activiteChildren.length > 0 ? [{
        name: 'Mon activité',
        icon: Calendar,
        children: showConfirme
          ? activiteChildren
          : activiteChildren.filter(c =>
              ['/app/agenda', '/app/interventions', '/app/procurement', '/app/supplier-comparator'].includes(c.href)
            ),
      }] : []),
      ...(showInter ? [{ name: 'Outils', href: '/app/ressources', icon: Zap }] : []),
    ];
  }, [user]);

  // Barre de navigation mobile adaptative : Accueil + 3 destinations les plus
  // utilisées + Menu. À froid (aucun usage appris), on retombe sur les valeurs
  // historiques (Devis, Clients, Agenda si activé) pour ne rien dégrader.
  const mobileNavItems = React.useMemo(() => {
    const home = { id: 'home', name: 'Accueil', href: '/app', icon: LayoutDashboard };
    const agendaEnabled = navigationGroups.some(g => g.children?.some(c => c.name === 'Agenda'));
    const fallback = [
      { id: 'devis', name: 'Devis', href: '/app/devis', icon: FileText },
      { id: 'clients', name: 'Clients', href: '/app/clients', icon: Users },
      ...(agendaEnabled ? [{ id: 'agenda', name: 'Agenda', href: '/app/agenda', icon: Calendar }] : []),
    ];
    const picks = [];
    for (const s of mobileFrequent) {
      if (picks.length >= 3) break;
      picks.push({ id: s.id, name: s.short || s.label, href: s.path, icon: s.icon });
    }
    for (const f of fallback) {
      if (picks.length >= 3) break;
      if (!picks.some(p => p.id === f.id)) picks.push(f);
    }
    return [home, ...picks];
  }, [mobileFrequent, navigationGroups]);

  // --- Réordonnancement adaptatif de la barre latérale ---
  // L'id catalogue d'une destination se déduit de son chemin (ex. /app/devis →
  // 'devis'). « Tableau de bord » (/app) et « Outils » (/app/ressources) n'ont
  // pas d'id : score 0 (le 1er est épinglé, le 2nd coule en bas).
  const idForHref = useCallback(
    (href) => SHORTCUT_CATALOG.find(s => s.path === href)?.id,
    []
  );
  const navNodeId = useCallback((node) => `nav:${node.name}`, []);

  // Enfants des deux seuls groupes à enfants (appels de hooks en nombre fixe).
  const findGroup = (name) => navigationGroups.find(g => g.name === name);
  const devisGroup = findGroup('Devis & Factures');
  const activiteGroup = findGroup('Mon activité');
  const devisChildIds = (devisGroup?.children || []).map(c => idForHref(c.href) || c.name);
  const activiteChildIds = (activiteGroup?.children || []).map(c => idForHref(c.href) || c.name);
  const childScoreFn = useCallback((id, scores) => scores[id] || 0, []);

  const orderedDevisChildIds = useAdaptiveOrder('nav_devis', devisChildIds, childScoreFn);
  const orderedActiviteChildIds = useAdaptiveOrder('nav_activite', activiteChildIds, childScoreFn);

  // Ordre des entrées de premier niveau (« Tableau de bord » épinglé).
  const topNodeById = React.useMemo(
    () => new Map(navigationGroups.map(n => [navNodeId(n), n])),
    [navigationGroups, navNodeId]
  );
  const topScoreFn = useCallback((id, scores) => {
    const node = topNodeById.get(id);
    if (!node) return 0;
    if (node.children) return node.children.reduce((sum, c) => sum + (scores[idForHref(c.href)] || 0), 0);
    return scores[idForHref(node.href)] || 0;
  }, [topNodeById, idForHref]);

  const topIds = navigationGroups.map(navNodeId);
  const orderedTopIds = useAdaptiveOrder('nav', topIds, topScoreFn, { pinnedIds: ['nav:Tableau de bord'] });

  // Reconstruit les groupes dans l'ordre adaptatif, enfants réordonnés.
  const orderedNavigationGroups = React.useMemo(() => {
    const reorderChildren = (children, orderedIds) => {
      if (!children) return children;
      const byId = new Map(children.map(c => [idForHref(c.href) || c.name, c]));
      const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean);
      // Sécurité : compléter avec d'éventuels enfants non couverts.
      for (const c of children) if (!reordered.includes(c)) reordered.push(c);
      return reordered;
    };
    return orderedTopIds
      .map(id => topNodeById.get(id))
      .filter(Boolean)
      .map(node => {
        if (node === devisGroup) return { ...node, children: reorderChildren(node.children, orderedDevisChildIds) };
        if (node === activiteGroup) return { ...node, children: reorderChildren(node.children, orderedActiviteChildIds) };
        return node;
      });
  }, [orderedTopIds, topNodeById, devisGroup, activiteGroup, orderedDevisChildIds, orderedActiviteChildIds, idForHref]);

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
  const [showSearch, setShowSearch] = React.useState(false);
  const [showFeedback, setShowFeedback] = React.useState(false);

  const focusSearchInput = useCallback(() => {
    const input = document.querySelector(
      'input[type="search"], input[placeholder*="echerch" i], input[aria-label*="echerch" i]'
    );
    if (input) {
      input.focus();
      if (typeof input.select === 'function') input.select();
    }
  }, []);

  const newOnCurrentPage = useCallback(() => {
    const path = location.pathname;
    if (path.startsWith('/app/devis')) navigate('/app/devis/new');
    else if (path.startsWith('/app/clients')) navigate('/app/clients/new');
    else if (path.startsWith('/app/interventions')) navigate('/app/interventions/new');
    else if (path.startsWith('/app/agenda')) navigate('/app/agenda', { state: { openNewEvent: true } });
    else navigate('/app/devis/new');
  }, [location.pathname, navigate]);

  useKeyboardShortcuts({
    // Cmd+K / Ctrl+K : palette de recherche globale (fonctionne aussi dans
    // les inputs — c'est le standard universel pour les command palettes).
    'meta+k': (e) => { e.preventDefault(); setShowSearch((v) => !v); },
    'ctrl+k': (e) => { e.preventDefault(); setShowSearch((v) => !v); },
    'alt+d': () => navigate('/app/devis/new'),
    'alt+c': () => navigate('/app/clients/new'),
    'alt+r': () => navigate('/app/agenda', { state: { openNewEvent: true } }),
    'alt+i': () => navigate('/app/interventions/new'),
    'alt+h': () => navigate('/app'),
    'g h': () => navigate('/app'),
    'g d': () => navigate('/app/devis'),
    'g c': () => navigate('/app/clients'),
    'g a': () => navigate('/app/agenda'),
    n: newOnCurrentPage,
    '/': (e) => {
      e.preventDefault();
      focusSearchInput();
    },
    '?': () => setShowShortcuts((v) => !v),
    Escape: () => setShowShortcuts(false),
  });

  // Allow Profile/Settings page to control theme & shortcuts modal via window events
  useEffect(() => {
    const onToggleTheme = () => setIsDarkMode(prev => !prev);
    const onOpenShortcuts = () => setShowShortcuts(true);
    const onOpenFeedback = () => setShowFeedback(true);
    window.addEventListener('artisan:toggle-theme', onToggleTheme);
    window.addEventListener('artisan:open-shortcuts', onOpenShortcuts);
    window.addEventListener('artisan:open-feedback', onOpenFeedback);
    return () => {
      window.removeEventListener('artisan:toggle-theme', onToggleTheme);
      window.removeEventListener('artisan:open-shortcuts', onOpenShortcuts);
      window.removeEventListener('artisan:open-feedback', onOpenFeedback);
    };
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Repli de la barre latérale (desktop uniquement) : réduite à une colonne
  // d'icônes. Le choix est mémorisé ; au survol, on déplie temporairement
  // pour laisser lire les libellés sans changer la préférence.
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [railHovered, setRailHovered] = React.useState(false);
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch { /* stockage indisponible */ }
      return next;
    });
  }, []);
  // État visuel « réduit » : replié ET non survolé. Toutes les classes
  // ci-dessous l'appliquent via le préfixe `md:` pour ne toucher que le
  // desktop (sur mobile, le tiroir reste pleine largeur avec ses libellés).
  const railCollapsed = sidebarCollapsed && !railHovered;

  // Track which bottom nav item is bouncing
  const [bouncingHref, setBouncingHref] = React.useState(null);
  const prevPathnameRef = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      setBouncingHref(location.pathname);
      prevPathnameRef.current = location.pathname;
      const t = setTimeout(() => setBouncingHref(null), 500);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  // Close mobile menu on navigation
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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

  // Nom & initiales affichés dans la barre latérale (cellule profil iOS)
  const displayName =
    profile?.company_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'Artisan');
  const initials =
    displayName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'AF';

  // Couleur d'accent système iOS
  const IOS_BLUE = '#007AFF';

  return (
    <ConfirmProvider>
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-black overflow-hidden transition-colors duration-200">
      <Toaster
        position="top-right"
        richColors
        theme={isDarkMode ? 'dark' : 'light'}
        mobileOffset={{ top: '12px', right: '12px', left: '12px' }}
        toastOptions={{
          style: {
            maxWidth: 'calc(100vw - 24px)',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          },
        }}
      />

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
              <button
                onClick={() => setShowConvertModal(false)}
                className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Fermer la modal"
              >
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

        {/* Overlay du menu latéral (mobile) */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* ===== Barre latérale — style iPadOS ===== */}
        <aside
          onMouseEnter={() => { if (sidebarCollapsed) setRailHovered(true); }}
          onMouseLeave={() => setRailHovered(false)}
          className={`fixed md:relative inset-y-0 left-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            } md:translate-x-0 transition-all duration-300 ease-in-out bg-gray-100/90 dark:bg-[#1c1c1e]/90 backdrop-blur-2xl border-r border-gray-200/80 dark:border-white/10 flex flex-col w-72 max-w-[85vw] ${railCollapsed ? 'md:w-[4.5rem]' : 'md:w-64'}`}
        >
          {/* En-tête : logo */}
          <div className={`px-4 pt-5 pb-2 flex items-center justify-between ${railCollapsed ? 'md:px-0 md:justify-center' : ''}`}>
            <Link
              to="/app"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2.5"
            >
              <img src="/logo-bleu.svg" alt="Logo Artisan Facile" className="w-9 h-9 rounded-xl shadow-sm flex-shrink-0" />
              <span className={`text-[22px] font-bold tracking-tight text-gray-900 dark:text-white ${railCollapsed ? 'md:hidden' : ''}`}>Artisan Facile</span>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-200/60 dark:hover:bg-white/10"
              aria-label="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Recherche (champ style iOS) */}
          <div className="px-4 pt-1 pb-2">
            <button
              onClick={() => setShowSearch(true)}
              className={`flex items-center gap-2 w-full h-9 px-3 rounded-xl bg-gray-200/70 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-white/15 transition-colors ${railCollapsed ? 'md:justify-center md:px-0' : ''}`}
              title="Rechercher (Ctrl+K)"
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className={railCollapsed ? 'md:hidden' : ''}>Rechercher…</span>
            </button>
          </div>

          {/* Liste de navigation */}
          <nav className="flex-1 px-3 space-y-0.5 mt-1 overflow-y-auto">
            {orderedNavigationGroups.map((group) => {
              const hasChildren = !!group.children;

              if (!hasChildren) {
                const isActive = group.href === '/app'
                  ? location.pathname === '/app'
                  : location.pathname === group.href || location.pathname.startsWith(group.href + '/');
                return (
                  <Link
                    key={group.name}
                    to={group.href}
                    title={group.name}
                    className={`flex items-center gap-3 px-3 py-2.5 text-[15px] font-medium rounded-xl transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''} ${
                      isActive
                        ? 'bg-[#007AFF] text-white shadow-sm'
                        : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <group.icon
                      className="w-[22px] h-[22px] flex-shrink-0"
                      style={{ color: isActive ? '#fff' : IOS_BLUE }}
                    />
                    <span className={`flex-1 ${railCollapsed ? 'md:hidden' : ''}`}>{group.name}</span>
                  </Link>
                );
              }

              const groupActive = group.children.some(child =>
                location.pathname === child.href || location.pathname.startsWith(child.href + '/')
              );
              const groupHovered = hoveredGroup === group.name;
              const groupExpanded = isHoverDevice
                ? (groupActive || groupHovered)
                : (groupActive || (expandedGroups[group.name] ?? false));
              const showBadge = group.name === 'Devis & Factures' && pendingCount > 0;

              return (
                <div
                  key={group.name}
                  onMouseEnter={() => handleGroupEnter(group.name)}
                  onMouseLeave={handleGroupLeave}
                >
                  <button
                    onClick={() => { if (!isHoverDevice) toggleGroup(group.name); }}
                    title={group.name}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''} ${
                      groupActive
                        ? 'bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF]'
                        : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className="relative flex-shrink-0">
                      <group.icon
                        className="w-[22px] h-[22px]"
                        style={{ color: IOS_BLUE }}
                      />
                      {/* Pastille de rappel quand le menu est réduit : le badge
                          textuel étant masqué, on garde un point rouge visible. */}
                      {showBadge && railCollapsed && (
                        <span className="hidden md:block absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-gray-100 dark:ring-[#1c1c1e]" />
                      )}
                    </span>
                    <span className={`flex-1 text-left flex items-center gap-2 ${railCollapsed ? 'md:hidden' : ''}`}>
                      {group.name}
                      {showBadge && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {pendingCount > 9 ? '9+' : pendingCount}
                        </span>
                      )}
                    </span>
                    {groupExpanded
                      ? <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 ${railCollapsed ? 'md:hidden' : ''}`} />
                      : <ChevronRight className={`w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 ${railCollapsed ? 'md:hidden' : ''}`} />
                    }
                  </button>
                  {groupExpanded && (
                    <div className={`mt-0.5 mb-1 space-y-0.5 pl-[2.35rem] pr-1 ${railCollapsed ? 'md:hidden' : ''}`}>
                      {group.children.map(child => {
                        const childActive = location.pathname === child.href || location.pathname.startsWith(child.href + '/');
                        const isReceivedInvoices = child.href === '/app/received-invoices';
                        const childBadge = isReceivedInvoices && newReceivedCount > 0 ? newReceivedCount : 0;
                        return (
                          <Link
                            key={child.name}
                            to={child.href}
                            className={`flex items-center gap-2.5 px-3 py-2 text-[14px] rounded-lg transition-colors whitespace-nowrap ${
                              childActive
                                ? 'bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF] font-semibold'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'
                            }`}
                          >
                            <child.icon className="w-4 h-4 flex-shrink-0" style={{ color: childActive ? IOS_BLUE : undefined }} />
                            <span className="flex-1">{child.name}</span>
                            {childBadge > 0 && (
                              <span className="ml-1.5 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {childBadge > 9 ? '9+' : childBadge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mode terrain — entrée rapide */}
            <button
              onClick={() => navigate('/terrain')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''}`}
              title="Mode terrain — vue simplifiée sur chantier"
            >
              <Wrench className="w-[22px] h-[22px] flex-shrink-0 text-orange-500" />
              <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>Mode terrain</span>
            </button>

            {/* Donner mon avis — collecte des retours d'utilisation */}
            <button
              onClick={() => setShowFeedback(true)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''}`}
              title="Signaler un bug ou proposer une amélioration"
            >
              <MessageSquarePlus className="w-[22px] h-[22px] flex-shrink-0 text-emerald-500" />
              <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>Donner mon avis</span>
            </button>

            {/* Statistiques plateforme — réservé à l'administrateur */}
            {isAdmin(user) && (
              <Link
                to="/app/admin"
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''} ${
                  location.pathname === '/app/admin'
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Statistiques plateforme — qui utilise l'application"
              >
                <BarChart3
                  className="w-[22px] h-[22px] flex-shrink-0"
                  style={{ color: location.pathname === '/app/admin' ? '#fff' : IOS_BLUE }}
                />
                <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>Statistiques</span>
              </Link>
            )}

            {/* Retours des artisans — réservé à l'administrateur */}
            {isAdmin(user) && (
              <Link
                to="/app/admin/feedback"
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''} ${
                  location.pathname.startsWith('/app/admin/feedback')
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Retours envoyés par les artisans"
              >
                <MessageSquarePlus
                  className="w-[22px] h-[22px] flex-shrink-0"
                  style={{ color: location.pathname.startsWith('/app/admin/feedback') ? '#fff' : IOS_BLUE }}
                />
                <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>Retours artisans</span>
                {newFeedbackCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${railCollapsed ? 'md:hidden' : ''} ${
                    location.pathname.startsWith('/app/admin/feedback')
                      ? 'bg-white text-[#007AFF]'
                      : 'bg-red-500 text-white'
                  }`}>
                    {newFeedbackCount > 9 ? '9+' : newFeedbackCount}
                  </span>
                )}
              </Link>
            )}

            {/* Rapports hebdomadaires des retours — réservé à l'administrateur */}
            {isAdmin(user) && (
              <Link
                to="/app/admin/reports"
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium rounded-xl transition-colors whitespace-nowrap ${railCollapsed ? 'md:justify-center md:px-2' : ''} ${
                  location.pathname.startsWith('/app/admin/reports')
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Synthèse hebdomadaire des retours artisans"
              >
                <LineChart
                  className="w-[22px] h-[22px] flex-shrink-0"
                  style={{ color: location.pathname.startsWith('/app/admin/reports') ? '#fff' : IOS_BLUE }}
                />
                <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>Rapports hebdo</span>
              </Link>
            )}
          </nav>

          {/* Pied : cellule profil + actions (style iOS Réglages) */}
          <div className="p-3 border-t border-gray-200/70 dark:border-white/10 space-y-2">
            {/* Réduire / agrandir la barre — desktop uniquement */}
            <button
              onClick={toggleSidebarCollapsed}
              className={`hidden md:flex items-center gap-3 w-full px-3 py-2 text-[13px] font-medium rounded-xl text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${railCollapsed ? 'md:justify-center md:px-2' : ''}`}
              title={sidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="w-5 h-5 flex-shrink-0" />
                : <PanelLeftClose className="w-5 h-5 flex-shrink-0" />
              }
              <span className={`flex-1 text-left ${railCollapsed ? 'md:hidden' : ''}`}>
                {sidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
              </span>
            </button>

            <button
              onClick={() => navigate('/app/subscription')}
              className={`flex items-center gap-3 w-full p-2 rounded-2xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left ${railCollapsed ? 'md:justify-center' : ''}`}
              title={`Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} — Voir l'abonnement`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                style={{ backgroundColor: IOS_BLUE }}
              >
                {initials}
              </div>
              <div className={`flex-1 min-w-0 ${railCollapsed ? 'md:hidden' : ''}`}>
                <div className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{displayName}</div>
                <div className="flex items-center gap-1 text-xs">
                  <Crown className={`w-3 h-3 ${isOwner ? 'text-violet-500' : isPro ? 'text-blue-500' : 'text-gray-400'}`} />
                  <span className="text-gray-500 dark:text-gray-400">
                    {isOwner ? 'Owner' : isPro ? 'Pro' : 'Gratuit'}{!isPro && ' · Passer au Pro'}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 ${railCollapsed ? 'md:hidden' : ''}`} />
            </button>

            {/* Rangée d'actions rapides */}
            <div className={`flex items-center justify-around bg-gray-200/50 dark:bg-white/5 rounded-2xl p-1 ${railCollapsed ? 'md:flex-col md:gap-1' : ''}`}>
              <button
                onClick={() => navigate('/app/portal-messages')}
                className={`relative p-2 rounded-xl transition-colors ${
                  location.pathname.startsWith('/app/portal-messages')
                    ? 'text-[#007AFF] bg-white dark:bg-white/10'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10'
                }`}
                title="Messages clients"
                aria-label="Messages clients"
              >
                <MessageSquare className="w-5 h-5" />
                {unreadPortalMessages > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">
                    {unreadPortalMessages > 9 ? '9+' : unreadPortalMessages}
                  </span>
                )}
              </button>
              <NotificationCenter />
              <button
                onClick={() => setIsDarkMode(prev => !prev)}
                className="p-2 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors"
                title={isDarkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
                aria-label={isDarkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
              >
                {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => navigate('/app/settings')}
                className={`p-2 rounded-xl transition-colors ${
                  location.pathname.startsWith('/app/settings')
                    ? 'text-[#007AFF] bg-white dark:bg-white/10'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10'
                }`}
                title="Paramètres"
                aria-label="Paramètres"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 text-red-500 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors"
                title="Déconnexion"
                aria-label="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:pt-0">
          <main className="flex-1 overflow-y-auto">
            {/* En-tête mobile translucide (style iOS) */}
            <div className="sticky top-0 z-30 h-14 bg-gray-100/80 dark:bg-black/70 backdrop-blur-xl border-b border-gray-200/70 dark:border-white/10 flex items-center justify-between px-3 md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-[#007AFF] rounded-full active:bg-black/5 dark:active:bg-white/10"
                aria-label="Ouvrir le menu"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-[17px] font-semibold text-gray-900 dark:text-white">Artisan Facile</h1>
              <div className="flex items-center gap-0.5">
                <NotificationCenter />
                <button
                  onClick={() => setShowSearch(true)}
                  className="p-2 text-[#007AFF] rounded-full active:bg-black/5 dark:active:bg-white/10"
                  title="Recherche"
                  aria-label="Recherche globale"
                >
                  <Search className="w-5 h-5" />
                </button>
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
                    : 'bg-[#007AFF] hover:bg-[#0066d6]'
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
        </div>
      </div>

      {/* Palette de recherche globale (Cmd+K / Ctrl+K) */}
      <SearchPalette isOpen={showSearch} onClose={() => setShowSearch(false)} />

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Donner mon avis — recueil des retours artisans */}
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* Barre d'onglets mobile — translucide style iOS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border-t border-gray-200/70 dark:border-white/10 z-50 md:hidden flex justify-around items-center h-16 pb-safe safe-area-bottom">
        {mobileNavItems.map((item) => {
          const isActive = item.href === '/app'
            ? location.pathname === '/app'
            : location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.id}
              to={item.href}
              className={`flex flex-col items-center justify-center w-full h-full gap-0.5 ${isActive ? 'text-[#007AFF]' : 'text-gray-500 dark:text-gray-400'
                }`}
            >
              <item.icon className={`w-6 h-6 ${bouncingHref === item.href ? 'animate-nav-bounce' : ''}`} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full gap-0.5 ${isMobileMenuOpen ? 'text-[#007AFF]' : 'text-gray-500 dark:text-gray-400'
            }`}
        >
          <Menu className="w-6 h-6" />
          <span className="text-[10px] font-medium">Plus</span>
        </button>
      </div>
    </div>
    </ConfirmProvider>
  );
};

export default Layout;
