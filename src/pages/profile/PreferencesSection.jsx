import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Sun, Moon, Keyboard, HelpCircle, ChevronRight, Shield, Wrench } from 'lucide-react';
import { isTerrainHomeEnabled, setTerrainHomeEnabled } from '../../utils/terrainHome';

const PreferencesSection = () => {
    const [isDarkMode, setIsDarkMode] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );

    useEffect(() => {
        const sync = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Préférence propre à l'appareil (stockée localement) : utile sur le téléphone.
    const [terrainHome, setTerrainHome] = useState(isTerrainHomeEnabled);
    const handleToggleTerrainHome = () => {
        const next = !terrainHome;
        setTerrainHome(next);
        setTerrainHomeEnabled(next);
    };

    const handleToggleTheme = () => window.dispatchEvent(new Event('artisan:toggle-theme'));
    const handleOpenShortcuts = () => window.dispatchEvent(new Event('artisan:open-shortcuts'));

    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Settings className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                    Préférences de l'application
                </h3>
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={handleToggleTheme}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            {isDarkMode
                                ? <Sun className="w-5 h-5 text-yellow-500" />
                                : <Moon className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">
                                    {isDarkMode ? 'Mode clair' : 'Mode sombre'}
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Basculer entre l'apparence claire et sombre
                                </span>
                            </span>
                        </span>
                        <span className="text-xs font-medium text-blue-600">Basculer</span>
                    </button>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={terrainHome}
                        onClick={handleToggleTerrainHome}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <Wrench className="w-5 h-5 text-orange-500" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Accueil sur le mode terrain</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Sur téléphone, ouvrir l'appli directement sur le mode terrain (réglage de cet appareil)
                                </span>
                            </span>
                        </span>
                        <span className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${terrainHome ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${terrainHome ? 'translate-x-5' : ''}`} />
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenShortcuts}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <Keyboard className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Raccourcis clavier</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Voir la liste des raccourcis disponibles
                                </span>
                            </span>
                        </span>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">?</span>
                    </button>

                    <Link
                        to="/app/audit-log"
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Journal d'audit</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Historique des signatures, paiements et suppressions
                                </span>
                            </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </Link>

                    <Link
                        to="/app/guide"
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                        <span className="flex items-center gap-3">
                            <HelpCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>
                                <span className="block text-sm font-medium text-gray-900 dark:text-white">Guide d'utilisation</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                    Tutoriels, astuces et raccourcis du quotidien
                                </span>
                            </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PreferencesSection;
