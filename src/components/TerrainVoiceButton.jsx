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
                className={`w-full h-full min-h-[9.5rem] flex flex-col items-center justify-center gap-2 rounded-3xl text-white shadow-lg transition-all active:scale-[0.97] disabled:opacity-90 ${color}`}
            >
                <span className="relative flex items-center justify-center">
                    {isRecording && <span className="absolute w-16 h-16 rounded-full bg-white/30 animate-ping" />}
                    <Icon className={`w-12 h-12 ${isProcessing ? 'animate-spin' : ''}`} />
                </span>
                <span className="text-xl font-extrabold leading-none">{label}</span>
                {sub && <span className="text-xs font-medium text-white/85 px-2 text-center truncate max-w-full">{sub}</span>}
            </button>
            {isRecording && (
                <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    aria-label="Annuler la dictée"
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/25 text-white active:bg-black/40"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};

export default TerrainVoiceButton;
