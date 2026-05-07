import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Lightbulb, AlertCircle } from 'lucide-react';
import { chatWithCopilot } from '../utils/aiService';
import { toastError } from '../utils/supabaseErrorHandler';

const SYSTEM_PROMPT_BASE = `Tu es l'assistant intelligent d'Artisan Facile, une application de gestion pour artisans français du bâtiment (plomberie, électricité, peinture, maçonnerie...).

Ton rôle : aider l'artisan à mieux gérer son activité au quotidien — répondre aux questions sur ses chiffres, rédiger des emails de relance, expliquer une notion comptable, conseiller sur un devis, etc.

Règles strictes :
- Réponds toujours en français, ton professionnel mais accessible (tutoiement OK).
- Sois CONCIS : 3 à 5 phrases max, sauf si l'artisan demande explicitement un détail.
- Quand tu rédiges un email/SMS, retourne directement le texte sans intro ni signature inventée.
- N'INVENTE JAMAIS de chiffres, de noms ou de dates. Si une information manque dans le contexte, dis-le franchement.
- Utilise les chiffres exacts du contexte fourni quand ils sont disponibles.
- Pas de markdown lourd — texte simple, listes courtes si nécessaire.`;

/* ─── Construction du contexte système avec données de la page courante ─── */
function buildSystemPrompt(context) {
    if (!context || Object.keys(context).length === 0) {
        return SYSTEM_PROMPT_BASE;
    }

    const lines = [SYSTEM_PROMPT_BASE, '', '── CONTEXTE ACTUEL ──'];

    if (context.page) {
        lines.push(`Page consultée : ${context.page}`);
    }
    if (context.today) {
        lines.push(`Date du jour : ${context.today}`);
    }
    if (context.summary) {
        lines.push('');
        lines.push(context.summary);
    }
    if (context.facts && Array.isArray(context.facts)) {
        lines.push('');
        for (const fact of context.facts) {
            if (fact) lines.push(`• ${fact}`);
        }
    }

    return lines.join('\n');
}

/* ─── Bulle de message ─── */
const Bubble = ({ msg }) => {
    const isUser = msg.role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
            }`}>
                {msg.content}
            </div>
        </div>
    );
};

/* ─── Composant principal ─── */
const CopilotChat = ({ context, presets = [] }) => {
    const [open, setOpen]         = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput]       = useState('');
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);

    const listRef = useRef(null);
    const inputRef = useRef(null);

    /* Scroll automatique en bas à chaque nouveau message */
    useEffect(() => {
        if (open && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, open, loading]);

    /* Focus l'input à l'ouverture */
    useEffect(() => {
        if (open) {
            const t = setTimeout(() => inputRef.current?.focus(), 80);
            return () => clearTimeout(t);
        }
    }, [open]);

    const sendMessage = useCallback(async (textOverride) => {
        const text = (textOverride ?? input).trim();
        if (!text || loading) return;

        setError(null);
        const newMessages = [...messages, { role: 'user', content: text }];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            const systemPrompt = buildSystemPrompt(context);
            const response = await chatWithCopilot(systemPrompt, newMessages);
            setMessages([...newMessages, { role: 'assistant', content: response.trim() }]);
        } catch (err) {
            console.error('Copilot error:', err);
            const message = err?.message || 'Erreur de l\'assistant';
            // Si quota dépassé : message dédié, sinon erreur générique
            if (/limite|quota|free|monthly/i.test(message)) {
                setError('Vous avez atteint la limite mensuelle de l\'assistant IA. Passez au plan Pro pour continuer.');
            } else {
                setError(message);
            }
            // Retire le dernier message user (sinon l'historique est cassé pour le retry)
            setMessages(messages);
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, context]);

    const handleClear = () => {
        setMessages([]);
        setError(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Bouton flottant */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 group flex items-center gap-2 pl-3 pr-4 py-3 rounded-full shadow-lg transition-all hover:shadow-xl active:scale-95 ${
                    open
                        ? 'opacity-0 pointer-events-none translate-y-2'
                        : 'opacity-100'
                } bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white`}
                title="Ouvrir l'assistant Copilot"
                aria-label="Ouvrir l'assistant Copilot"
            >
                <Sparkles className="w-5 h-5 flex-shrink-0" />
                <span className="hidden sm:inline text-sm font-semibold">Copilot</span>
            </button>

            {/* Panneau (overlay sur mobile, drawer à droite sur desktop) */}
            {open && (
                <div
                    className="fixed inset-0 z-50 flex justify-end"
                    onClick={() => setOpen(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm md:bg-black/30" />

                    {/* Drawer */}
                    <div
                        onClick={e => e.stopPropagation()}
                        className="relative w-full md:max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">Copilot Artisan</h3>
                                    <p className="text-[10px] text-gray-400 leading-none mt-0.5">Assistant intelligent</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                        title="Effacer la conversation"
                                    >
                                        Effacer
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                            {messages.length === 0 && !error && (
                                <div className="text-center pt-4 pb-2">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 mb-3">
                                        <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Comment puis-je vous aider ?
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                                        Posez une question ou utilisez un raccourci ci-dessous.
                                    </p>
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <Bubble key={idx} msg={msg} />
                            ))}

                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3.5 py-2 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        L'assistant réfléchit…
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <p className="leading-relaxed">{error}</p>
                                </div>
                            )}
                        </div>

                        {/* Raccourcis (presets) — visibles tant qu'aucun message envoyé */}
                        {messages.length === 0 && presets.length > 0 && (
                            <div className="px-3 pb-2 flex-shrink-0">
                                <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider mb-1.5 flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3" />
                                    Raccourcis
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {presets.map((preset, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => sendMessage(preset.prompt)}
                                            className="text-xs px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Input */}
                        <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex-shrink-0 bg-gray-50/50 dark:bg-gray-800/30">
                            <div className="flex gap-2">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Écrivez votre message…"
                                    rows={2}
                                    maxLength={2000}
                                    className="flex-1 resize-none text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || loading}
                                    className="self-end p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                                    title="Envoyer (Entrée)"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">
                                Limites mensuelles selon votre plan · Entrée pour envoyer · Maj+Entrée saut de ligne
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CopilotChat;
