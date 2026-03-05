import React, { useState } from 'react';
import { X, Inbox, ExternalLink, Trash2, User, Clock, Mail, FlaskConical, ChevronRight, Globe } from 'lucide-react';
import { useTestMode } from '../context/TestModeContext';

// Extrait tous les liens http(s) d'un corps d'email
function extractLinks(body) {
    const urlRegex = /https?:\/\/[^\s\n]+/g;
    return [...new Set(body.match(urlRegex) || [])];
}

// Détermine le label d'un lien
function linkLabel(url) {
    if (url.includes('/q/')) return '📄 Ouvrir la facture / le devis';
    if (url.includes('/p/')) return '🏠 Ouvrir l\'espace client';
    return '🔗 Ouvrir le lien';
}

// Rendu de l'email : corps avec liens cliquables mis en évidence
function EmailBody({ body }) {
    const lines = body.split('\n');
    return (
        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {lines.map((line, i) => {
                const urlMatch = line.match(/^(https?:\/\/[^\s]+)$/);
                if (urlMatch) {
                    return (
                        <a
                            key={i}
                            href={urlMatch[1]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block my-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-xs font-medium no-underline"
                        >
                            <ExternalLink className="inline w-3.5 h-3.5 mr-1.5 mb-0.5" />
                            {linkLabel(urlMatch[1])}
                            <span className="block mt-0.5 text-blue-400 dark:text-blue-500 font-normal truncate">{urlMatch[1]}</span>
                        </a>
                    );
                }
                return <span key={i}>{line}{i < lines.length - 1 ? '\n' : ''}</span>;
            })}
        </div>
    );
}

export default function TestModePanel({ onClose }) {
    const { testClient, capturedEmails, clearEmails, disableTestMode } = useTestMode();
    const [selectedEmailId, setSelectedEmailId] = useState(null);
    const [tab, setTab] = useState('inbox'); // 'inbox' | 'client'

    const selectedEmail = capturedEmails.find(e => e.id === selectedEmailId)
        || (capturedEmails.length > 0 ? capturedEmails[0] : null);

    const portalUrl = testClient?.portal_token
        ? `${window.location.origin}/p/${testClient.portal_token}`
        : null;

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const handleDisable = () => {
        disableTestMode();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 shrink-0">
                    <div className="flex items-center gap-2 flex-1">
                        <FlaskConical className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">MODE TEST</span>
                        {testClient && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                                {testClient.name} · {testClient.email}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleDisable}
                        className="text-xs text-amber-700 dark:text-amber-400 hover:text-red-600 dark:hover:text-red-400 transition-colors px-2 py-1 rounded"
                    >
                        Désactiver
                    </button>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <button
                        onClick={() => setTab('inbox')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                            ${tab === 'inbox'
                                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <Inbox className="w-4 h-4" />
                        Boîte de réception
                        {capturedEmails.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                                {capturedEmails.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setTab('client')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                            ${tab === 'client'
                                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <User className="w-4 h-4" />
                        Vue client
                    </button>
                </div>

                {/* ── INBOX TAB ── */}
                {tab === 'inbox' && (
                    <div className="flex flex-1 overflow-hidden">

                        {/* Email list */}
                        <div className="w-52 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto shrink-0">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                    {capturedEmails.length} message{capturedEmails.length !== 1 ? 's' : ''}
                                </span>
                                {capturedEmails.length > 0 && (
                                    <button onClick={clearEmails} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Vider">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {capturedEmails.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                                    <Inbox className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        Aucun email.<br />Envoyez un devis ou une facture au client test.
                                    </p>
                                </div>
                            ) : (
                                capturedEmails.map(email => (
                                    <button
                                        key={email.id}
                                        onClick={() => setSelectedEmailId(email.id)}
                                        className={`w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-800 transition-colors
                                            ${(selectedEmail?.id === email.id)
                                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                    >
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{email.subject}</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(email.timestamp)}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Email viewer */}
                        <div className="flex-1 overflow-y-auto flex flex-col">
                            {selectedEmail ? (
                                <>
                                    {/* Email header */}
                                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 space-y-1 shrink-0">
                                        <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug">
                                            {selectedEmail.subject}
                                        </h3>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <Mail className="w-3.5 h-3.5" />
                                            <span>À : {selectedEmail.email}</span>
                                            <span>·</span>
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>{formatDate(selectedEmail.timestamp)}</span>
                                        </div>
                                    </div>

                                    {/* Email body */}
                                    <div className="flex-1 p-5 bg-gray-50 dark:bg-gray-800/50">
                                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                                            <EmailBody body={selectedEmail.body} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
                                    <span className="text-sm">Sélectionnez un email</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── CLIENT TAB ── */}
                {tab === 'client' && (
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
                            Vous pouvez naviguer comme si vous étiez ce client. Les liens s'ouvrent dans un nouvel onglet pour simuler l'expérience client.
                        </div>

                        {testClient && (
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-500" />
                                    Fiche client test
                                </h3>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Nom</p>
                                        <p className="font-medium text-gray-700 dark:text-gray-200">{testClient.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
                                        <p className="font-medium text-gray-700 dark:text-gray-200 truncate">{testClient.email}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {portalUrl && (
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-blue-500" />
                                    Espace client
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Portail où le client voit tous ses documents, photos de chantier et peut télécharger ses pièces.
                                </p>
                                <a
                                    href={portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between w-full px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <span>Ouvrir l'espace client</span>
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                                <p className="text-xs text-gray-400 dark:text-gray-500 break-all">{portalUrl}</p>
                            </div>
                        )}

                        {/* Liens depuis les emails capturés */}
                        {capturedEmails.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-blue-500" />
                                    Documents reçus par email
                                </h3>
                                <div className="space-y-2">
                                    {capturedEmails.flatMap(email =>
                                        extractLinks(email.body)
                                            .filter(url => url.includes('/q/') || url.includes('/p/'))
                                            .map(url => ({ url, subject: email.subject, timestamp: email.timestamp }))
                                    ).filter((item, idx, arr) => arr.findIndex(i => i.url === item.url) === idx)
                                     .map((item, idx) => (
                                        <a
                                            key={idx}
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                                        >
                                            <span className="text-xl">{item.url.includes('/q/') ? '📄' : '🏠'}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{item.subject}</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(item.timestamp)}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
