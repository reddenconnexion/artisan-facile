import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Calendar, Settings, LogOut, Menu, X, User, Kanban, Mic, HelpCircle, BookOpen, Wrench, Truck, Save, Moon, Sun, Box, Image as ImageIcon, Send, Calculator } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import VoiceHelpModal from '../components/VoiceHelpModal';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../hooks/useVoice';
import { processVoiceCommand } from '../utils/voiceCommands';

import { JOB_LIBRARIES } from '../constants/jobLibraries';
import GlobalAssistant from '../components/GlobalAssistant';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [showVoiceHelp, setShowVoiceHelp] = React.useState(false);
  const { user, signOut } = useAuth(); // Added user here
  const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();

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
              toast.success(`Espace configuré pour : ${jobType}. Bibliothèque de prix chargée.`);
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

  const navigation = React.useMemo(() => {
    // Default settings if not set
    const jobType = user?.user_metadata?.job_type;
    const userSettings = user?.user_metadata?.activity_settings || {};

    // Smart defaults equivalent to ActivitySettings.jsx to avoid flickering empty nav
    const settings = {
      enable_agenda: userSettings.enable_agenda ?? true,
      enable_crm: userSettings.enable_crm ?? true,
      enable_price_library: userSettings.enable_price_library ?? true,
      enable_inventory: userSettings.enable_inventory ?? true,
      enable_maintenance: userSettings.enable_maintenance ?? ['plombier', 'chauffagiste', 'electricien'].includes(jobType),
      enable_rentals: userSettings.enable_rentals ?? (['macon', 'gros_oeuvre', 'peintre', 'paysagiste', 'terrassier'].includes(jobType) || !jobType)
    };

    const nav = [
      { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard },
      { name: 'Comptabilité', href: '/app/accounting', icon: Calculator },
    ];

    if (settings.enable_agenda) {
      nav.push({ name: 'Agenda', href: '/app/agenda', icon: Calendar });
    }

    // Clients is always visible (core feature), but CRM (Kanban) is optional
    nav.push({ name: 'Clients', href: '/app/clients', icon: Users });

    if (settings.enable_crm) {
      nav.push({ name: 'Suivi Chantiers', href: '/app/crm', icon: Kanban });
      nav.push({ name: 'Relances', href: '/app/follow-ups', icon: Send });
    }

    nav.push({ name: 'Devis & Factures', href: '/app/devis', icon: FileText });

    nav.push({ name: 'Comptabilité', href: '/app/accounting', icon: Calculator });

    nav.push({ name: 'Portfolio', href: '/app/portfolio', icon: ImageIcon });

    if (settings.enable_price_library) {
      nav.push({ name: 'Bibliothèque', href: '/app/library', icon: BookOpen });
    }

    if (settings.enable_inventory) {
      nav.push({ name: 'Stock', href: '/app/inventory', icon: Box });
    }

    if (settings.enable_maintenance) {
      nav.push({ name: 'Maintenance', href: '/app/maintenance', icon: Wrench });
    }

    if (settings.enable_rentals) {
      nav.push({ name: 'Locations', href: '/app/rentals', icon: Truck });
    }

    return nav;
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
    if (user?.email?.endsWith('@artisan-facile.local')) {
      setIsDemo(true);
    } else {
      setIsDemo(false);
    }
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
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />

      {/* Demo Banner */}
      {isDemo && (
        <div className="h-10 bg-indigo-600 dark:bg-indigo-800 text-white flex-shrink-0 z-[60] flex items-center justify-center text-sm px-4 shadow-md">
          <span className="truncate mr-2">Vous êtes en mode Démo. Vos données sont temporaires.</span>
          <button
            onClick={() => setShowConvertModal(true)}
            className="bg-white text-indigo-600 px-3 py-0.5 rounded-full text-xs font-bold hover:bg-gray-100 transition-colors flex items-center"
          >
            <Save className="w-3 h-3 mr-1" />
            Sauvegarder mon compte
          </button>
        </div>
      )}

      {/* Convert Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Sauvegarder mon travail</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
              Transformez ce compte démo en compte réel pour conserver vos devis et clients.
              Entrez simplement vos vrais identifiants.
            </p>
            <form onSubmit={handleConvertAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Votre Email réel</label>
                <input type="email" name="email" required className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2" placeholder="jean@artisan.fr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Choisir un mot de passe</label>
                <input type="password" name="password" required className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2" minLength={6} placeholder="******" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowConvertModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Sauvegarder</button>
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
              <div className="bg-blue-600 p-2 rounded-lg">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
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

          <nav className="flex-1 px-4 space-y-2 mt-4 md:mt-0 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                    } ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
                  {(!isCollapsed || isMobileMenuOpen) && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
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
              <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Artisan Facile</h1>
            </div>

            <div className="p-4 md:p-8 pb-24 md:pb-8">
              <Outlet />
            </div>
          </main>

          <VoiceHelpModal isOpen={showVoiceHelp} onClose={() => setShowVoiceHelp(false)} />


          <GlobalAssistant />

          {/* Voice Assistant Controls Removed (Replaced by GlobalAssistant) */}
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

      {/* Mobile Bottom Navigation - Amazon Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 md:hidden flex justify-around items-center h-16 pb-safe safe-area-bottom">
        {[
          { name: 'Accueil', href: '/app', icon: LayoutDashboard },
          { name: 'Clients', href: '/app/clients', icon: Users },
          { name: 'Devis', href: '/app/devis', icon: FileText },
          // Check if Agenda is enabled
          ...(navigation.find(n => n.name === 'Agenda') ? [{ name: 'Agenda', href: '/app/agenda', icon: Calendar }] : [])
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
  );
};

export default Layout;
