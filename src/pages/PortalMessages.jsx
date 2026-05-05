import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import {
    MessageSquare, Send, User, ArrowLeft, Loader2,
    Phone, Mail, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Bulle de message ─── */
const MessageBubble = ({ msg }) => {
    const isArtisan = msg.sender_type === 'artisan';
    return (
        <div className={`flex ${isArtisan ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-4 py-2.5 ${
                isArtisan
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
            }`}>
                {msg.sender_name && (
                    <p className={`text-[10px] font-semibold mb-1 ${isArtisan ? 'text-blue-200' : 'text-gray-400'}`}>
                        {msg.sender_name}
                    </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${isArtisan ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                    {new Date(msg.created_at).toLocaleString('fr-FR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                </p>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════════════════════════
   Page principale
══════════════════════════════════════════════════════════════════════════════ */
const PortalMessages = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [conversations, setConversations] = useState([]);
    const [loading, setLoading]             = useState(true);
    const [selectedId, setSelectedId]       = useState(null);
    const [reply, setReply]                 = useState('');
    const [sending, setSending]             = useState(false);
    const [refreshing, setRefreshing]       = useState(false);

    const messagesEndRef = useRef(null);
    const replyRef       = useRef(null);

    /* ── Chargement des conversations ── */
    const fetchConversations = useCallback(async (showRefreshing = false) => {
        if (showRefreshing) setRefreshing(true);
        try {
            const { data: messages, error } = await supabase
                .from('portal_messages')
                .select('*, clients(id, name, email, phone)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Grouper par client
            const byClient = {};
            for (const msg of messages || []) {
                const cid = msg.client_id;
                if (!byClient[cid]) {
                    byClient[cid] = {
                        client:      msg.clients,
                        messages:    [],
                        unreadCount: 0,
                        lastMessage: null,
                    };
                }
                byClient[cid].messages.push(msg);
                byClient[cid].lastMessage = msg;
                if (msg.sender_type === 'client' && !msg.read_at) {
                    byClient[cid].unreadCount++;
                }
            }

            const sorted = Object.values(byClient).sort(
                (a, b) => new Date(b.lastMessage?.created_at) - new Date(a.lastMessage?.created_at),
            );
            setConversations(sorted);
        } catch {
            toast.error('Erreur lors du chargement des messages');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user.id]);

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    /* ── Realtime : nouvelles insertions ── */
    useEffect(() => {
        const channel = supabase
            .channel(`portal_messages_artisan_${user.id}`)
            .on('postgres_changes', {
                event:  'INSERT',
                schema: 'public',
                table:  'portal_messages',
                filter: `user_id=eq.${user.id}`,
            }, () => {
                fetchConversations();
                queryClient.invalidateQueries({ queryKey: ['portalMessagesCount', user.id] });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user.id, fetchConversations, queryClient]);

    /* ── Scroll bas à l'ouverture d'une conversation ── */
    useEffect(() => {
        if (selectedId) {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
            markAsRead(selectedId);
            replyRef.current?.focus();
        }
    }, [selectedId]);

    /* ── Scroll bas quand de nouveaux messages arrivent ── */
    const selectedConv = conversations.find(c => c.client?.id === selectedId);
    useEffect(() => {
        if (selectedId) {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        }
    }, [selectedConv?.messages?.length]);

    /* ── Marquer comme lus ── */
    const markAsRead = useCallback(async (clientId) => {
        const { error } = await supabase
            .from('portal_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('client_id', clientId)
            .eq('user_id', user.id)
            .eq('sender_type', 'client')
            .is('read_at', null);

        if (!error) {
            setConversations(prev => prev.map(conv => {
                if (conv.client?.id !== clientId) return conv;
                return {
                    ...conv,
                    unreadCount: 0,
                    messages: conv.messages.map(m =>
                        m.sender_type === 'client' && !m.read_at
                            ? { ...m, read_at: new Date().toISOString() }
                            : m,
                    ),
                };
            }));
            queryClient.invalidateQueries({ queryKey: ['portalMessagesCount', user.id] });
        }
    }, [user.id, queryClient]);

    /* ── Envoyer une réponse ── */
    const handleSendReply = async () => {
        if (!reply.trim() || !selectedId || sending) return;
        setSending(true);
        const content = reply.trim();
        setReply('');

        try {
            const artisanName = user.user_metadata?.company_name
                || user.user_metadata?.full_name
                || 'Votre artisan';

            const { error } = await supabase
                .from('portal_messages')
                .insert({
                    client_id:   selectedId,
                    user_id:     user.id,
                    sender_type: 'artisan',
                    content,
                    sender_name: artisanName,
                });

            if (error) throw error;

            // Mise à jour optimiste
            setConversations(prev => prev.map(conv => {
                if (conv.client?.id !== selectedId) return conv;
                const newMsg = {
                    id:          Date.now(),
                    sender_type: 'artisan',
                    content,
                    sender_name: artisanName,
                    created_at:  new Date().toISOString(),
                    read_at:     null,
                };
                return { ...conv, messages: [...conv.messages, newMsg], lastMessage: newMsg };
            }));
        } catch {
            toast.error('Erreur lors de l\'envoi');
            setReply(content);
        } finally {
            setSending(false);
            replyRef.current?.focus();
        }
    };

    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    /* ── States ── */
    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto">

            {/* En-tête page */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                        Messages portail client
                        {totalUnread > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {totalUnread}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Messages envoyés depuis les espaces clients partagés
                    </p>
                </div>
                <button
                    onClick={() => fetchConversations(true)}
                    disabled={refreshing}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                    title="Actualiser"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* État vide */}
            {conversations.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <MessageSquare className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Aucun message pour le moment</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Vos clients peuvent vous contacter directement depuis leur espace client partagé.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 13rem)' }}>

                    {/* ── Liste des conversations ── */}
                    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                            {conversations.map(conv => (
                                <button
                                    key={conv.client?.id}
                                    onClick={() => setSelectedId(conv.client?.id)}
                                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${
                                        selectedId === conv.client?.id
                                            ? 'bg-blue-50 dark:bg-blue-900/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                                                {conv.client?.name}
                                            </p>
                                            {conv.unreadCount > 0 && (
                                                <span className="ml-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                                                    {conv.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                            {conv.lastMessage?.sender_type === 'artisan' && '→ '}
                                            {conv.lastMessage?.content}
                                        </p>
                                        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">
                                            {conv.lastMessage && new Date(conv.lastMessage.created_at).toLocaleString('fr-FR', {
                                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Vue conversation ── */}
                    {selectedConv ? (
                        <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden">

                            {/* Header conversation */}
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
                                <button
                                    onClick={() => setSelectedId(null)}
                                    className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                                    <User className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white">{selectedConv.client?.name}</p>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        {selectedConv.client?.phone && (
                                            <a href={`tel:${selectedConv.client.phone}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                                <Phone className="w-3 h-3" />{selectedConv.client.phone}
                                            </a>
                                        )}
                                        {selectedConv.client?.email && (
                                            <a href={`mailto:${selectedConv.client.email}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors truncate">
                                                <Mail className="w-3 h-3" />{selectedConv.client.email}
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                    {selectedConv.messages.length} message{selectedConv.messages.length > 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Fil de messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {selectedConv.messages.map(msg => (
                                    <MessageBubble key={msg.id} msg={msg} />
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Zone de réponse */}
                            <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex gap-2 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
                                <textarea
                                    ref={replyRef}
                                    value={reply}
                                    onChange={e => setReply(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendReply();
                                        }
                                    }}
                                    placeholder={`Répondre à ${selectedConv.client?.name}… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)`}
                                    rows={2}
                                    maxLength={2000}
                                    className="flex-1 resize-none text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                                />
                                <button
                                    onClick={handleSendReply}
                                    disabled={!reply.trim() || sending}
                                    className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 self-end"
                                    title="Envoyer"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="hidden md:flex md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 items-center justify-center">
                            <div className="text-center">
                                <MessageSquare className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                                <p className="text-sm text-gray-400 dark:text-gray-500">Sélectionnez une conversation</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PortalMessages;
