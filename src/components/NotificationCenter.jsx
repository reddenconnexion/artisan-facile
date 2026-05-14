import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, PenTool, CheckCircle2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications, markNotificationsRead } from '../hooks/useNotifications';

const TYPE_CONFIG = {
    message:   { Icon: MessageSquare, color: 'text-blue-500',   bg: 'bg-blue-50   dark:bg-blue-900/30'   },
    signature: { Icon: PenTool,       color: 'text-green-500',  bg: 'bg-green-50  dark:bg-green-900/30'  },
    payment:   { Icon: CheckCircle2,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/30' },
};

const NotificationCenter = () => {
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data = { items: [], unreadCount: 0 } } = useNotifications();
    const { items, unreadCount } = data;

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const handleMarkAllRead = async () => {
        markNotificationsRead();
        if (user) {
            await supabase
                .from('portal_messages')
                .update({ read_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('sender_type', 'client')
                .is('read_at', null);
            queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
            queryClient.invalidateQueries({ queryKey: ['portalMessagesCount', user.id] });
        }
    };

    const handleSelect = (item) => {
        setOpen(false);
        navigate(item.href);
    };

    return (
        <div ref={panelRef} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    open
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                title="Notifications"
                aria-label="Centre de notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute left-0 md:left-auto md:right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            Notifications
                            {unreadCount > 0 && (
                                <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {unreadCount}
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Tout marquer lu
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                        {items.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-200 dark:text-gray-700" />
                                <p className="text-sm text-gray-400 dark:text-gray-500">Aucune notification</p>
                            </div>
                        ) : (
                            items.map(item => {
                                const { Icon, color, bg } = TYPE_CONFIG[item.type] || TYPE_CONFIG.message;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleSelect(item)}
                                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                                            item.unread ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                                        }`}
                                    >
                                        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                                            <Icon className={`w-4 h-4 ${color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm truncate ${item.unread ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                                {item.title}
                                            </p>
                                            {item.description && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                    {item.description}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: fr })}
                                            </p>
                                        </div>
                                        {item.unread && (
                                            <div className="mt-2.5 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {items.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => { setOpen(false); navigate('/app/audit-log'); }}
                                className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                            >
                                Voir le journal complet →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
