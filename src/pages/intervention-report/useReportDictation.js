import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { generateInterventionSummary } from '../../utils/aiService';

/**
 * Dictée vocale du rapport : enregistrement, transcription (Whisper) puis
 * résumé structuré par l'IA, versé dans le formulaire.
 */
export const useReportDictation = ({ setFormData }) => {
    const [processingAudio, setProcessingAudio] = useState(false);

    const { isRecording, audioBlob, duration: recordingDuration, startRecording, stopRecording, isSupported: micSupported } = useAudioRecorder();

    const handleDictate = async () => {
        if (isRecording) {
            stopRecording();
        } else {
            await startRecording();
        }
    };

    // When recording stops and we have a blob, transcribe + generate summary
    useEffect(() => {
        if (!audioBlob || isRecording) return;
        const processAudio = async () => {
            setProcessingAudio(true);
            try {
                // Convert blob to base64 using FileReader (reliable for large files)
                const mimeType = audioBlob.type || 'audio/webm';
                const audioBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(audioBlob);
                });

                // Transcribe with Whisper via edge function
                const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('voice-transcribe', {
                    body: { audioBase64, mimeType }
                });
                if (transcribeError) throw new Error(transcribeError.message || 'Erreur de transcription');
                if (transcribeData?.error) throw new Error(transcribeData.error);
                const transcript = transcribeData?.transcript;
                if (!transcript) throw new Error('Transcription vide — parlez plus fort ou réessayez');

                // Generate structured summary with AI
                const summary = await generateInterventionSummary(transcript);
                setFormData(prev => ({
                    ...prev,
                    title: summary.title || prev.title,
                    description: summary.description || prev.description,
                    work_done: summary.work_done || prev.work_done,
                    notes: summary.notes || prev.notes,
                }));
                toast.success('Rapport rempli depuis votre dictée');
            } catch (err) {
                console.error(err);
                toast.error('Erreur lors de l\'analyse vocale : ' + (err.message || 'Réessayez'));
            } finally {
                setProcessingAudio(false);
            }
        };
        processAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioBlob]);

    return { isRecording, recordingDuration, micSupported, processingAudio, handleDictate };
};
