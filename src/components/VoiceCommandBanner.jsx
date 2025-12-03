import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Mic } from 'lucide-react';

const VoiceCommandBanner = ({ isSidebarCollapsed }) => {
    const [isMinimized, setIsMinimized] = useState(false);

    const commands = [
        "Nouveau client",
        "Rendez-vous demain à 14h",
        "Créer un devis pour Martin",
        "Aller à l'agenda",
        "Nouveau prospect",
        "Rendez-vous lundi prochain",
        "Modifier le client",
        "Envoyer le devis"
    ];

    return (
        <div className={`fixed bottom-0 right-0 z-40 transition-all duration-300 ${isSidebarCollapsed ? 'left-20' : 'left-64'} ${isMinimized ? 'h-10' : 'h-12'} bg-gray-900 text-white shadow-lg border-t border-gray-800`}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="absolute -top-6 right-4 bg-gray-900 text-white p-1 rounded-t-lg border-t border-x border-gray-800 hover:bg-gray-800 transition-colors"
                title={isMinimized ? "Afficher les commandes" : "Réduire"}
            >
                {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {/* Content */}
            <div className="flex items-center h-full px-4 overflow-hidden relative">
                <div className="flex items-center gap-2 shrink-0 bg-gray-900 z-10 pr-4 border-r border-gray-700">
                    <Mic size={16} className="text-blue-400 animate-pulse" />
                    <span className="text-sm font-medium hidden sm:inline">Commandes :</span>
                </div>

                {!isMinimized && (
                    <div className="flex-1 overflow-hidden relative ml-4">
                        <div className="animate-scroll whitespace-nowrap flex gap-8 items-center">
                            {/* Duplicate list for seamless loop */}
                            {[...commands, ...commands, ...commands].map((cmd, index) => (
                                <span key={index} className="text-sm text-gray-300 italic">
                                    "{cmd}"
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {isMinimized && (
                    <div className="ml-4 text-xs text-gray-400 italic">
                        Assistant vocal actif...
                    </div>
                )}
            </div>

            <style>{`
                @keyframes scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.33%); }
                }
                .animate-scroll {
                    animation: scroll 20s linear infinite;
                }
                .animate-scroll:hover {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
};

export default VoiceCommandBanner;
