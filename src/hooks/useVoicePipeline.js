import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAudioRecorder } from './useAudioRecorder';
import { processAssistantIntent } from '../utils/aiService';
import { executePipelineActions, cancelPipelineActions } from '../utils/voicePipelineExecutor';
import { sendPipelineNotification } from '../utils/notifications';
import { canUseAutoPipeline } from '../utils/planLimits';

// Pipeline status values
// 'idle' | 'recording' | 'uploading' | 'transcribing' | 'analyzing' | 'executing' | 'done' | 'error'

/**
 * Main hook orchestrating the voice pipeline.
 * Handles recording → upload → transcription → AI intent → execute/prefill.
 *
 * @param {object} options
 * @param {string} options.userId - Current user ID
 * @param {'free'|'pro'} options.plan - User plan
 * @param {function} [options.onMemoCreated] - Callback when memo is created in DB
 * @param {function} [options.onActionsExecuted] - Callback when pipeline executes actions
 */
export const useVoicePipeline = ({ userId, plan = 'free', onMemoCreated, onActionsExecuted } = {}) => {
    const [status, setStatus] = useState('idle');
    const [transcript, setTranscript] = useState('');
    const [intentResult, setIntentResult] = useState(null);
    const [actionsTaken, setActionsTaken] = useState([]);
    const [currentMemoId, setCurrentMemoId] = useState(null);
    const [cancelToken, setCancelToken] = useState(null);

    const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
    const navigate = useNavigate();
    const cancelTimerRef = useRef(null);

    // Convert blob to base64
    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const startVoicePipeline = useCallback(async () => {
        if (status !== 'idle') return;
        setTranscript('');
        setIntentResult(null);
        setActionsTaken([]);
        await startRecording();
        setStatus('recording');
    }, [status, startRecording]);

    const finishVoicePipeline = useCallback(async () => {
        if (status !== 'recording') return;

        setStatus('uploading');

        try {
            const result = await stopRecording();
            if (!result || !result.blob || result.blob.size < 1000) {
                toast.error('Enregistrement trop court. Réessayez.');
                setStatus('idle');
                return;
            }

            const { blob, mimeType } = result;

            // Create voice memo record in DB
            const { data: memo, error: memoError } = await supabase
                .from('voice_memos')
                .insert({
                    user_id: userId,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (memoError) throw new Error('Impossible de créer le mémo');
            const memoId = memo.id;
            setCurrentMemoId(memoId);
            if (onMemoCreated) onMemoCreated(memoId);

            // Convert to base64 for edge function
            setStatus('transcribing');
            const audioBase64 = await blobToBase64(blob);

            const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('voice-transcribe', {
                body: { audioBase64, mimeType, memoId },
            });

            if (transcribeError || !transcribeData?.transcript) {
                const errMsg = transcribeData?.error || transcribeError?.message || 'Erreur de transcription';
                await supabase.from('voice_memos').update({ status: 'error' }).eq('id', memoId);
                throw new Error(errMsg);
            }

            const transcribedText = transcribeData.transcript;
            setTranscript(transcribedText);

            // AI intent analysis
            setStatus('analyzing');
            const isPro = canUseAutoPipeline(plan);
            const intent = await processAssistantIntent(transcribedText, true);
            setIntentResult(intent);

            // Update memo with intent result
            await supabase.from('voice_memos').update({
                transcript: transcribedText,
                intent_result: intent,
                status: 'processing',
            }).eq('id', memoId);

            // Branch: Pro = auto-execute | Free = prefill forms
            if (isPro && intent.intent !== 'unknown' && intent.intent !== 'navigation') {
                setStatus('executing');

                const { actionsTaken: actions, recordIds } = await executePipelineActions(intent, userId);
                setActionsTaken(actions);

                // Save actions to memo
                await supabase.from('voice_memos').update({
                    actions_taken: actions,
                    status: 'done',
                }).eq('id', memoId);

                // Send push notification
                await sendPipelineNotification(userId, actions);

                if (onActionsExecuted) onActionsExecuted(actions, recordIds);

                // Store cancel context
                const token = { recordIds, userId, memoId };
                setCancelToken(token);

                setStatus('done');

                // Auto-clear cancel window after 30s
                cancelTimerRef.current = setTimeout(() => {
                    setCancelToken(null);
                }, 30000);

            } else {
                // Free plan: navigate to appropriate page with pre-filled data
                await supabase.from('voice_memos').update({ status: 'done' }).eq('id', memoId);

                setStatus('done');
                navigateToIntent(intent, navigate);
            }

        } catch (err) {
            console.error('Voice pipeline error:', err);
            toast.error(err.message || 'Erreur lors du traitement vocal');
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    }, [status, stopRecording, userId, plan, onMemoCreated, onActionsExecuted, navigate]);

    const cancelVoiceRecording = useCallback(() => {
        if (status === 'recording') {
            cancelRecording();
            setStatus('idle');
        }
    }, [status, cancelRecording]);

    /**
     * Cancel auto-executed pipeline actions (30s window).
     */
    const cancelLastPipeline = useCallback(async () => {
        if (!cancelToken) return;

        if (cancelTimerRef.current) {
            clearTimeout(cancelTimerRef.current);
            cancelTimerRef.current = null;
        }

        try {
            await cancelPipelineActions(cancelToken.recordIds, cancelToken.userId);
            await supabase.from('voice_memos').update({ status: 'cancelled' }).eq('id', cancelToken.memoId);
            setCancelToken(null);
            setActionsTaken([]);
            toast.success('Actions annulées avec succès');
        } catch (err) {
            toast.error("Erreur lors de l'annulation");
        }
    }, [cancelToken]);

    const resetPipeline = useCallback(() => {
        setStatus('idle');
        setTranscript('');
        setIntentResult(null);
        setActionsTaken([]);
        setCurrentMemoId(null);
    }, []);

    return {
        // State
        status,
        isRecording,
        duration,
        transcript,
        intentResult,
        actionsTaken,
        currentMemoId,
        canCancel: !!cancelToken,

        // Actions
        startVoicePipeline,
        finishVoicePipeline,
        cancelVoiceRecording,
        cancelLastPipeline,
        resetPipeline,
    };
};

// --- Private helpers ---

function navigateToIntent(intent, navigate) {
    const { data } = intent;

    // Map intent to route with pre-filled state
    const intentRoutes = {
        create_client: { path: '/app/clients/new', state: { prefill: data } },
        create_quote: { path: '/app/devis/new', state: { prefill: data } },
        create_invoice: { path: '/app/devis/new', state: { prefill: { ...data, type: 'invoice' } } },
        create_intervention_report: { path: '/app/interventions/new', state: { prefill: data } },
        schedule_appointment: { path: '/app/agenda', state: { prefill: data } },
        calendar: { path: '/app/agenda', state: { prefill: data } },
        navigation: { path: data?.page || '/app', state: {} },
    };

    const route = intentRoutes[intent.intent];
    if (route) {
        navigate(route.path, { state: route.state });
    }
}
