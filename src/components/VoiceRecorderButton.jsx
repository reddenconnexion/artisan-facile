import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Crown, X } from 'lucide-react';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useAuth } from '../context/AuthContext';
import { useVoicePipeline } from '../hooks/useVoicePipeline';
import { toast } from 'sonner';
import PipelineCancelToast from './PipelineCancelToast';

/**
 * Floating voice recorder button — the central UI for the voice-first experience.
 * - Hold to record (mobile-friendly)
 * - Shows timer while recording
 * - Dispatches to the voice pipeline on release
 * - Displays plan limit warning when applicable
 */
const VoiceRecorderButton = () => {
    const { user } = useAuth();
    const { plan, canUseVoice, remainingVoice, voiceLimit, loading: planLoading } = usePlanLimits();

    const {
        status,
        isRecording,
        duration,
        transcript,
        actionsTaken,
        canCancel,
        startVoicePipeline,
        finishVoicePipeline,
        cancelVoiceRecording,
        cancelLastPipeline,
        resetPipeline,
    } = useVoicePipeline({
        userId: user?.id,
        plan,
        onActionsExecuted: (actions) => {
            toast.custom((toastId) => (
                <PipelineCancelToast
                    toastId={toastId}
                    actions={actions}
                    onCancel={cancelLastPipeline}
                />
            ), { duration: 30000, id: 'pipeline-cancel' });
        },
    });

    const holdTimerRef = useRef(null);
    const isProcessing = ['uploading', 'transcribing', 'analyzing', 'executing'].includes(status);
    const isDone = status === 'done';
    const isError = status === 'error';

    // Reset to idle after done
    useEffect(() => {
        if (isDone) {
            const t = setTimeout(() => resetPipeline(), 3000);
            return () => clearTimeout(t);
        }
    }, [isDone, resetPipeline]);

    const handleStart = async (e) => {
        e.preventDefault();
        if (!canUseVoice && plan === 'free') {
            toast.error(`Limite atteinte : ${voiceLimit} mémos vocaux/mois sur le plan gratuit. Passez au plan Pro pour continuer.`);
            return;
        }
        if (isProcessing) return;
        await startVoicePipeline();
    };

    const handleStop = async (e) => {
        e.preventDefault();
        if (isRecording) {
            await finishVoicePipeline();
        }
    };

    const handleCancel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRecording) {
            cancelVoiceRecording();
        }
    };

    const formatDuration = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const getButtonColor = () => {
        if (isRecording) return 'bg-red-500 hover:bg-red-600 shadow-red-300';
        if (isProcessing) return 'bg-orange-500 shadow-orange-300';
        if (isDone) return 'bg-green-500 shadow-green-300';
        if (isError) return 'bg-gray-500 shadow-gray-300';
        return 'bg-blue-600 hover:bg-blue-700 shadow-blue-300';
    };

    const getIcon = () => {
        if (isProcessing) return <Loader2 size={26} className="animate-spin" />;
        if (isRecording) return <MicOff size={26} />;
        return <Mic size={26} />;
    };

    const getStatusLabel = () => {
        switch (status) {
            case 'recording': return `Enregistrement... ${formatDuration(duration)}`;
            case 'uploading': return 'Envoi...';
            case 'transcribing': return 'Transcription...';
            case 'analyzing': return 'Analyse...';
            case 'executing': return 'Exécution...';
            case 'done': return 'Terminé !';
            case 'error': return 'Erreur';
            default: return plan === 'pro' ? 'Mémo vocal' : `Mémo vocal (${remainingVoice}/${voiceLimit})`;
        }
    };

    if (planLoading) return null;

    return (
        <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2 select-none">
            {/* Cancel button during recording */}
            {isRecording && (
                <button
                    onMouseDown={handleCancel}
                    onTouchStart={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-red-200 text-red-500 text-xs font-medium shadow-md"
                >
                    <X size={12} />
                    Annuler
                </button>
            )}

            {/* Status label */}
            {status !== 'idle' && (
                <div className="bg-white px-3 py-1.5 rounded-full shadow-md border border-gray-100 text-xs font-medium text-gray-700 whitespace-nowrap">
                    {getStatusLabel()}
                </div>
            )}

            {/* Main button */}
            <div className="relative">
                {/* Pulsing ring while recording */}
                {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
                )}

                <button
                    onMouseDown={handleStart}
                    onMouseUp={handleStop}
                    onTouchStart={handleStart}
                    onTouchEnd={handleStop}
                    disabled={isProcessing}
                    title={getStatusLabel()}
                    className={`
                        relative w-16 h-16 rounded-full text-white flex items-center justify-center
                        shadow-lg transition-all duration-200 active:scale-95
                        ${getButtonColor()}
                        ${isProcessing ? 'cursor-wait opacity-80' : 'cursor-pointer'}
                    `}
                >
                    {getIcon()}

                    {/* Pro badge */}
                    {plan === 'pro' && status === 'idle' && (
                        <span className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5">
                            <Crown size={10} className="text-white" />
                        </span>
                    )}

                    {/* Limit warning badge */}
                    {plan === 'free' && remainingVoice <= 3 && remainingVoice > 0 && status === 'idle' && (
                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            {remainingVoice}
                        </span>
                    )}

                    {/* Blocked badge */}
                    {plan === 'free' && remainingVoice === 0 && status === 'idle' && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            !
                        </span>
                    )}
                </button>
            </div>

            {/* Idle hint */}
            {status === 'idle' && (
                <div className="text-xs text-gray-400 text-right">
                    {plan === 'free'
                        ? `${remainingVoice}/${voiceLimit} ce mois`
                        : 'Pro — illimité'
                    }
                </div>
            )}
        </div>
    );
};

export default VoiceRecorderButton;
