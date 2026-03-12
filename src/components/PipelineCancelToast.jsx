import React, { useState, useEffect } from 'react';
import { CheckCircle, X, ExternalLink, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const CANCEL_WINDOW_SECONDS = 30;

/**
 * Custom Sonner toast for pipeline completion.
 * Shows what was auto-created and a countdown cancel button.
 */
const PipelineCancelToast = ({ toastId, actions = [], onCancel }) => {
    const [secondsLeft, setSecondsLeft] = useState(CANCEL_WINDOW_SECONDS);
    const [cancelled, setCancelled] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const interval = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleCancel = async () => {
        setCancelled(true);
        toast.dismiss(toastId);
        if (onCancel) await onCancel();
    };

    const handleDismiss = () => {
        toast.dismiss(toastId);
    };

    const handleActionClick = (link) => {
        if (link) navigate(link);
        toast.dismiss(toastId);
    };

    if (cancelled) return null;

    return (
        <div className="bg-white border border-green-100 rounded-xl shadow-lg p-4 max-w-xs w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                    <CheckCircle size={16} className="text-green-500" />
                    Actions effectuées
                </div>
                <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                </button>
            </div>

            {/* Actions list */}
            <ul className="space-y-1.5 mb-3">
                {actions.map((action, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-700 flex-1">{action.label}</span>
                        {action.link && (
                            <button
                                onClick={() => handleActionClick(action.link)}
                                className="text-blue-500 hover:text-blue-700 flex-shrink-0"
                            >
                                <ExternalLink size={12} />
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {/* Cancel button with countdown */}
            {secondsLeft > 0 ? (
                <button
                    onClick={handleCancel}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium border border-red-200 transition-colors"
                >
                    <Undo2 size={12} />
                    Annuler ({secondsLeft}s)
                </button>
            ) : (
                <p className="text-center text-xs text-gray-400">Fenêtre d'annulation expirée</p>
            )}
        </div>
    );
};

export default PipelineCancelToast;
