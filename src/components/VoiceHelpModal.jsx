import React from 'react';
import { X, Mic, Calendar, Users, FileText } from 'lucide-react';

const VoiceHelpModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const commandCategories = [
        {
            title: "Navigation",
            icon: Mic,
            commands: [
                "Aller à l'agenda",
                "Aller aux clients",
                "Aller aux devis",
                "Tableau de bord"
            ]
        },
        {
            title: "Agenda",
            icon: Calendar,
            commands: [
                "Rendez-vous demain à 14h",
                "Rendez-vous avec Martin lundi",
                "Nouveau rendez-vous"
            ]
        },
        {
            title: "Clients",
            icon: Users,
            commands: [
                "Nouveau client",
                "Créer un client",
                "Ajouter un prospect"
            ]
        },
        {
            title: "Devis",
            icon: FileText,
            commands: [
                "Créer un devis",
                "Nouveau devis",
                "Faire un devis pour Dupont"
            ]
        }
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Mic className="w-5 h-5 text-blue-600" />
                        Commandes Vocales
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {commandCategories.map((category, idx) => (
                        <div key={idx}>
                            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <category.icon className="w-4 h-4" />
                                {category.title}
                            </h4>
                            <ul className="space-y-2">
                                {category.commands.map((cmd, i) => (
                                    <li key={i} className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                                        "{cmd}"
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t bg-gray-50 rounded-b-xl">
                    <p className="text-xs text-center text-gray-500">
                        Appuyez sur le micro et parlez naturellement.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default VoiceHelpModal;
