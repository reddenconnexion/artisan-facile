import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check, ChevronsUpDown, User, MapPin, Phone, Mail } from 'lucide-react';

const ClientSelector = ({ clients, selectedClientId, onChange, onCreateNew, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    const selectedClient = clients.find(c => c.id === selectedClientId);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredClients = clients.filter(client => {
        const term = searchTerm.toLowerCase();
        return (
            client.name.toLowerCase().includes(term) ||
            (client.email && client.email.toLowerCase().includes(term)) ||
            (client.phone && client.phone.includes(term)) ||
            (client.address && client.address.toLowerCase().includes(term))
        );
    });

    return (
        <div className={`relative ${disabled ? 'opacity-60 pointer-events-none' : ''}`} ref={dropdownRef}>
            <div
                className="w-full relative"
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(!isOpen);
                    if (!isOpen) {
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }
                }}
            >
                <div className={`w-full px-3 py-2 border rounded-lg bg-white flex items-center justify-between cursor-pointer ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300 hover:border-gray-400'}`}>
                    {selectedClient ? (
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                                {selectedClient.name.charAt(0)}
                            </div>
                            <span className="truncate text-gray-900 font-medium">{selectedClient.name}</span>
                        </div>
                    ) : (
                        <span className="text-gray-500">Sélectionner un client...</span>
                    )}
                    <ChevronsUpDown className="w-4 h-4 text-gray-400 shrink-0" />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Rechercher (nom, email, ville...)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-1">
                        {filteredClients.length > 0 ? (
                            filteredClients.map((client) => (
                                <button
                                    key={client.id}
                                    onClick={() => {
                                        onChange(client.id);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-md flex items-start gap-3 transition-colors ${selectedClientId === client.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-900'}`}
                                >
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${selectedClientId === client.id ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {client.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-0.5">
                                            <span className="font-medium truncate">{client.name}</span>
                                            {selectedClientId === client.id && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                                        </div>
                                        <div className="text-xs text-gray-500 flex flex-col gap-0.5">
                                            {client.phone && (
                                                <div className="flex items-center gap-1.5">
                                                    <Phone className="w-3 h-3" />
                                                    {client.phone}
                                                </div>
                                            )}
                                            {client.address && (
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <MapPin className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{client.address}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <p className="text-sm">Aucun client trouvé</p>
                            </div>
                        )}
                    </div>

                    {onCreateNew && (
                        <div className="p-2 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
                            <button
                                onClick={() => {
                                    onCreateNew();
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Créer un nouveau client
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClientSelector;
