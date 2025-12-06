import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Calendar, Settings, LogOut, Menu, X, User, Kanban, Mic, HelpCircle, BookOpen } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import VoiceHelpModal from '../components/VoiceHelpModal';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../hooks/useVoice';
import { processVoiceCommand } from '../utils/voiceCommands';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [showVoiceHelp, setShowVoiceHelp] = React.useState(false);
  const { signOut } = useAuth();
  const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();

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

  const navigation = [
    { name: 'Tableau de bord', href: '/app', icon: LayoutDashboard },
    { name: 'Agenda', href: '/app/agenda', icon: Calendar },
    { name: 'Clients', href: '/app/clients', icon: Users },
    { name: 'CRM / Suivi', href: '/app/crm', icon: Kanban },
    { name: 'Devis & Factures', href: '/app/devis', icon: FileText },
    { name: 'Bibliothèque', href: '/app/library', icon: BookOpen },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Toaster position="top-right" richColors />
      {/* Sidebar */}
      <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300`}>
        <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && <h1 className="text-2xl font-bold text-blue-600 truncate">Artisan Facile</h1>}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            {isCollapsed ? <Menu className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                title={isCollapsed ? item.name : ''}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-gray-400'} ${isCollapsed ? '' : 'mr-3'}`} />
                {!isCollapsed && item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => navigate('/app/settings')}
            title={isCollapsed ? 'Paramètres' : ''}
            className={`flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <Settings className={`w-5 h-5 text-gray-400 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && 'Paramètres'}
          </button>
          <button
            onClick={handleLogout}
            title={isCollapsed ? 'Déconnexion' : ''}
            className={`flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut className={`w-5 h-5 text-red-400 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && 'Déconnexion'}
          </button>
        </div>

        {/* Version Indicator */}
        <div className="px-6 py-2 text-xs text-gray-400 border-t border-gray-100 text-center">
          v{import.meta.env.PACKAGE_VERSION || '0.1.1'}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto relative">
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-16">
          <Outlet />
        </main>
        <VoiceHelpModal isOpen={showVoiceHelp} onClose={() => setShowVoiceHelp(false)} />

        {/* Voice Assistant Controls */}
        <div className="fixed bottom-8 right-8 flex items-center gap-3 z-50">
          <button
            onClick={() => setShowVoiceHelp(true)}
            className="p-3 bg-white text-gray-600 rounded-full shadow-lg hover:bg-gray-50 border border-gray-200 transition-all transform hover:scale-105"
            title="Aide commandes vocales"
          >
            <HelpCircle className="w-6 h-6" />
          </button>

          <button
            onClick={isListening ? stopListening : startListening}
            className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-600'
              } text-white`}
            title="Assistant Vocal"
          >
            <Mic className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Layout;
