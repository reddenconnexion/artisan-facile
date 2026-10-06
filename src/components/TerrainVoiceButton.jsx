import { useEffect } from 'react';
import { Mic, Square, Loader2, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useAuth } from '../context/AuthContext';
import { useVoicePipeline } from '../hooks/useVoicePipeline';
import PipelineCancelToast from './PipelineCancelToast';

/**
 * Gros bouton « Dicter » du mode terrain.
 *
 * Même pipeline que le bouton micro flottant de l'appli (mémo vocal →
 * transcription → actions), mais pensé pour les mains occupées ou gantées :
 * un appui pour parler, un appui pour envoyer — pas besoin de maintenir.
 */
const STATUS_LABELS = {
    uploading: 'Envoi…',
    transcribing: 'Transcription…',
    analyzing: 'Analyse…',
    executing: 'Enregistrement…',
    done: 'C’est noté !',
    error: 'Erreur, réessayez',
};

const fmt = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

const TerrainVoiceButton = () => {
    const { user } = useAuth();
    const { plan, canUseVoice, voiceLimit, loading: planLoading } = usePlanLimits();

    const {
        status, isRecording, duration, transcript,
        startVoicePipeline, finishVoicePipeline, cancelVoiceRecording,
        cancelLastPipeline, resetPipeline,
    } = useVoicePipeline({
        userId: user?.id,
        plan,
        onActionsExecuted: (actions) => {
            toast.custom((toastId) => (
                <PipelineCancelToast toastId={toastId} actions={actions} onCancel={cancelLastPipeline} />
            ), { duration: 30000, id: 'pipeline-cancel' });
        },
    });

    const isProcessing = ['uploading', 'transcribing', 'analyzing', 'executing'].includes(status);

    useEffect(() => {
        if (status !== 'done') return;
        const t = setTimeout(() => resetPipeline(), 3000);
        return () => clearTimeout(t);
    }, [status, resetPipeline]);

    const handleTap = async () => {
        if (isProcessing || planLoading) return;
        if (isRecording) {
            await finishVoicePipeline();
            return;
        }
        if (!canUseVoice && plan === 'free') {
            toast.error(`Limite atteinte : ${voiceLimit} mémos vocaux/mois sur le plan gratuit.`);
            return;
        }
        await startVoicePipeline();
    };

    const color = isRecording
        ? 'bg-red-500 active:bg-red-600'
        : isProcessing
            ? 'bg-orange-500'
            : status === 'done'
                ? 'bg-green-600'
                : 'bg-blue-600 active:bg-blue-700';

    const Icon = isProcessing ? Loader2 : isRecording ? Square : status === 'done' ? CheckCircle : Mic;
    const label = isRecording ? 'Envoyer' : STATUS_LABELS[status] || 'Dicter';
    const sub = isRecording
        ? fmt(duration)
        : status === 'done' && transcript
            ? `« ${transcript.slice(0, 40)}${transcript.length > 40 ? '…' : ''} »`
            : status === 'idle' ? 'Note, client, matériel…' : '';

    return (
        <div className="relative">
            <button
                type="button"
                onClick={handleTap}
                disabled={isProcessing}
                aria-label={isRecording ? 'Terminer la dictée et envoyer' : 'Dicter une note vocale'}
                className={`w-full h-full min-h-[9.5rem] md:min-h-0 md:h-16 flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 md:gap-3 md:px-5 md:pr-12 rounded-3xl md:rounded-2xl text-white shadow-lg md:shadow-sm transition-all active:scale-[0.97] disabled:opacity-90 ${color}`}
            >
                <span className="relative flex items-center justify-center shrink-0">
                    {isRecording && <span className="absolute w-16 h-16 md:w-9 md:h-9 rounded-full bg-white/30 animate-ping" />}
                    <Icon className={`w-12 h-12 md:w-6 md:h-6 ${isProcessing ? 'animate-spin' : ''}`} />
                </span>
                <span className="flex flex-col items-center md:items-start gap-2 md:gap-0.5 min-w-0 max-w-full">
                    <span className="text-xl md:text-base font-extrabold leading-none">{label}</span>
                    {sub && <span className="text-xs font-medium text-white/85 px-2 md:px-0 text-center md:text-left truncate max-w-full">{sub}</span>}
                </span>
            </button>
            {isRecording && (
                <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    aria-label="Annuler la dictée"
                    className="absolute top-2 right-2 md:top-1/2 md:-translate-y-1/2 md:right-3 p-2 md:p-1.5 rounded-full bg-black/25 text-white active:bg-black/40"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};

export default TerrainVoiceButton;
