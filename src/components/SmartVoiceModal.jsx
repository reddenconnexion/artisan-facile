import React, { useEffect, useState } from 'react';
import { X, Mic, Check, Sparkles, Wand2 } from 'lucide-react';
import { useVoice } from '../hooks/useVoice';
import { parseClientVoice, parseQuoteItemVoice } from '../utils/voiceParser';
import { toast } from 'sonner';

/**
 * Smart Voice Interface ("Free AI")
 * Replaces simple mic buttons with a contextual modal that guides the user.
 */
const SmartVoiceModal = ({ isOpen, onClose, onResult, context }) => {
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useVoice();
    const [localTranscript, setLocalTranscript] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLocalTranscript('');
            resetTranscript();
            setTimeout(() => startListening(), 300); // Small delay to ensuring modal ready
        } else {
            stopListening();
        }
    }, [isOpen]);

    useEffect(() => {
        if (transcript) {
            setLocalTranscript(transcript);
        }
    }, [transcript]);

    const handleValidate = () => {
        if (!localTranscript.trim()) {
            onClose();
            return;
        }

        let parsedData = {};
        let successMessage = "Données traitées";

        // Logic routing based on Context
        if (context === 'client') {
            parsedData = parseClientVoice(localTranscript);
            successMessage = "Fiche client pré-remplie !";
        } else if (context === 'quote_item') {
            parsedData = parseQuoteItemVoice(localTranscript);
            successMessage = "Ligne ajoutée !";
        } else if (context === 'note') {
            parsedData = { text: localTranscript };
            successMessage = "Note ajoutée !";
        } else if (context === 'assistant') {
            // For Global Assistant, pass raw text
            parsedData = { text: localTranscript };
            successMessage = "Recherche d'intention...";
        } else {
            // Generic fallback
            parsedData = { text: localTranscript };
        }

        onResult(parsedData);
        toast.success(successMessage);
        onClose();
    };

    if (!isOpen) return null;

    // Helper text based on context
    const getHelperText = () => {
        switch (context) {
            case 'client':
                return "Dites par exemple : \"Nouveau client Jean Dupont, 06 12 34 56 78, habite à Lyon\"";
            case 'quote_item':
                return "Dites par exemple : \"Pose de carrelage 40m2 à 50 euros\"";
            case 'note':
                return "Dictez votre note simplement...";
            case 'assistant':
                return "Dites 'RDV demain 14h', 'Nouveau client...', 'Ecrire un mail...'";
            default:
                return "Dictez votre texte...";
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col relative">

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="relative z-10 flex flex-col items-center">
                        <div className={`p-4 rounded-full mb-4 ${isListening ? 'bg-white/20 animate-pulse' : 'bg-white/10'}`}>
                            {isListening ? <Mic className="w-10 h-10" /> : <Sparkles className="w-10 h-10" />}
                        </div>
                        <h3 className="text-xl font-bold mb-1">
                            {isListening ? "Je vous écoute..." : "Analyse terminée"}
                        </h3>
                        <p className="text-blue-100 text-sm max-w-xs mx-auto">
                            {getHelperText()}
                        </p>
                    </div>
                </div>

                {/* Body / Transcript */}
                <div className="p-6 min-h-[160px] flex flex-col justify-center items-center text-center">
                    {localTranscript ? (
                        <p className="text-lg text-gray-800 dark:text-gray-100 font-medium leading-relaxed">
                            "{localTranscript}"
                        </p>
                    ) : (
                        <p className="text-gray-400 dark:text-gray-500 italic">
                            En attente de parole...
                        </p>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 flex gap-3 justify-center border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={startListening}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        Répéter
                    </button>
                    <button
                        onClick={handleValidate}
                        disabled={!localTranscript}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center font-semibold disabled:opacity-50 disabled:shadow-none transition-all"
                    >
                        <Wand2 className="w-4 h-4 mr-2" />
                        Utiliser l'IA
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SmartVoiceModal;
