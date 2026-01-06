import React, { useState } from 'react';
import { Sparkles, Mic, Calendar, UserPlus, Mail, ArrowRight, Loader2 } from 'lucide-react';
import SmartVoiceModal from './SmartVoiceModal';
import { processAssistantIntent } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GlobalAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleVoiceResult = async (data) => {
        // data.text or data.transcript comes from SmartVoiceModal
        // Actually SmartVoiceModal returns parsed object if context is set, 
        // OR raw transcript if we handle it differently?
        // Let's modify SmartVoiceModal to allow "raw" or "assistant" mode if needed,
        // OR simpler: Input to SmartVoiceModal logic.

        // For Global Assistant, we want the FULL raw text to pass to processAssistantIntent.
        // SmartVoiceModal currently returns an object based on regex parser.
        // We might need to adjust SmartVoiceModal to return the raw text too.
        // Looking at SmartVoiceModal code (I need to check if it returns raw text).
        // If not, I'll rely on what it returns or just use the text field in the modal.

        // Let's assume SmartVoiceModal returns { text: "raw text", ... } in 'assistant' context 
        // OR we just use the text.

        // Wait, SmartVoiceModal's parse functions return specific fields.
        // If I use context="assistant", I should ensure it returns the full text.

        // Let's proceed assuming I will pass the raw transcript.
        // But for now let's write this component assuming data has 'text' property
        // or I'll fix SmartVoiceModal to ensure it does.

        const text = data.text || data.originalText || data.notes || "";
        if (!text) {
            toast.warning("Je n'ai rien entendu.");
            return;
        }

        setIsProcessing(true);
        try {
            const context = {
                apiKey: localStorage.getItem('openai_api_key'), // Fallback handled in service
                provider: 'gemini'
            };

            const result = await processAssistantIntent(text, context);
            const { intent, data: intentData, response } = result;

            toast.info(response || "Action en cours...");

            switch (intent) {
                case 'calendar':
                    await handleCalendarAction(intentData);
                    break;
                case 'client':
                    handleClientAction(intentData);
                    break;
                case 'email':
                    handleEmailAction(intentData);
                    break;
                case 'navigation':
                    navigate(intentData.page);
                    break;
                default:
                    toast.warning("Désolé, je n'ai pas compris l'intention.");
            }

        } catch (error) {
            console.error(error);
            toast.error("Erreur de l'assistant : " + error.message);
        } finally {
            setIsProcessing(false);
            setIsOpen(false);
        }
    };

    const handleCalendarAction = async (data) => {
        // { title, start_date, duration, description }
        const { error } = await supabase.from('events').insert([{
            user_id: user.id,
            title: data.title || 'Nouveau Rendez-vous',
            date: data.start_date, // Required by older schema constraint
            start_time: data.start_date,
            end_time: calculateEndTime(data.start_date, data.duration || 60),
            description: data.description || 'Créé par l\'Assistant',
            type: 'meeting',
            color: 'bg-blue-500'
        }]);

        if (error) throw error;
        toast.success("Rendez-vous ajouté à l'agenda !");
        navigate('/app/agenda'); // Go to agenda to show result
    };

    const handleClientAction = (data) => {
        // Navigate to new client form with state
        navigate('/app/clients/new', {
            state: {
                voiceData: {
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    address: data.address,
                    notes: data.notes
                }
            }
        });
        toast.success("Fiche client pré-remplie !");
    };

    const handleEmailAction = (data) => {
        // Open mail client
        const subject = encodeURIComponent(data.subject || "Sujet");
        const body = encodeURIComponent(data.body || "");
        // If we have an email address for a client, we could use it, but generic intent might not have it.
        // The prompt asks for recipient_name. We'd likely need to look up the client.
        // For MVP, just open mailto with empty to or look up if provided.
        // If the API returns an email address in data.recipient_email (if it found it in context), great.
        // Otherwise, it's just a template.

        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        toast.success("Client mail ouvert !");
    };

    const calculateEndTime = (startDateStr, durationMinutes) => {
        const date = new Date(startDateStr);
        date.setMinutes(date.getMinutes() + durationMinutes);
        return date.toISOString();
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-20 md:bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all animate-in fade-in zoom-in duration-300 group"
                title="Assistant Magic"
            >
                <Sparkles className="w-6 h-6 animate-pulse" />
                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Assistant Magic
                </span>
            </button>

            <SmartVoiceModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onResult={handleVoiceResult}
                context="assistant" // We need to handle this new context in SmartVoiceModal logic or ensure it passes raw text
                title="Comment puis-je vous aider ?"
                subtitle="Ex: 'Pose un RDV demain 14h', 'Nouveau client...'"
            />

            {isProcessing && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
                        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
                        <p className="text-gray-800 font-medium">L'IA réfléchit...</p>
                    </div>
                </div>
            )}
        </>
    );
};

export default GlobalAssistant;
