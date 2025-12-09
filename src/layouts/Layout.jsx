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

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Toaster position="top-right" richColors />

      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-40 flex items-center justify-between px-4 md:hidden">
        <h1 className="text-xl font-bold text-blue-600">Artisan Facile</h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 -mr-2 text-gray-600 hover:text-gray-900"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

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
          } md:translate-x-0 transition-all duration-300 ease-in-out bg-white border-r border-gray-200 flex flex-col ${isCollapsed ? 'md:w-20' : 'md:w-64'
          } w-64`}
      >
        {/* Desktop Header / Logo */}
        <div className={`p-6 md:flex items-center hidden ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <div className="flex items-center">
            <div className="bg-blue-600 p-2 rounded-lg">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            {!isCollapsed && <h1 className="ml-3 text-xl font-bold text-gray-900 whitespace-nowrap">Artisan Facile</h1>}
          </div>
        </div>

        {/* Mobile Sidebar Header */}
        <div className="md:hidden p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-bold text-lg">Menu</span>
          <button onClick={() => setIsMobileMenuOpen(false)}>
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
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  } ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-400'} ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
                {(!isCollapsed || isMobileMenuOpen) && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => navigate('/app/settings')}
            className={`flex items-center w-full px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
          >
            <Settings className={`w-5 h-5 flex-shrink-0 text-gray-400 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
            {(!isCollapsed || isMobileMenuOpen) && 'Paramètres'}
          </button>
          <button
            onClick={handleLogout}
            className={`flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 whitespace-nowrap ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : ''}`}
          >
            <LogOut className={`w-5 h-5 flex-shrink-0 text-red-400 ${isCollapsed && !isMobileMenuOpen ? '' : 'mr-3'}`} />
            {(!isCollapsed || isMobileMenuOpen) && 'Déconnexion'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-16 md:pt-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <Outlet />
        </main>

        <VoiceHelpModal isOpen={showVoiceHelp} onClose={() => setShowVoiceHelp(false)} />

        {/* Voice Assistant Controls */}
        <div className="fixed bottom-6 right-6 flex items-center gap-3 z-30">
          <button
            onClick={() => setShowVoiceHelp(true)}
            className="p-3 bg-white text-gray-600 rounded-full shadow-lg hover:bg-gray-50 border border-gray-200 transition-all transform hover:scale-105 active:scale-95"
            title="Aide commandes vocales"
          >
            <HelpCircle className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <button
            onClick={isListening ? stopListening : startListening}
            className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-600'
              } text-white`}
            title="Assistant Vocal"
          >
            <Mic className="w-6 h-6 md:w-6 md:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Layout;
