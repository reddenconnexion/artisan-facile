import React, { useState } from 'react';
import { Plus, Trash2, Mail, Phone, User } from 'lucide-react';

const ClientContacts = ({ contacts = [], onChange }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newContact, setNewContact] = useState({
        name: '',
        role: '',
        email: '',
        phone: ''
    });

    const handleAdd = () => {
        if (!newContact.name) return;
        const updatedContacts = [...contacts, { ...newContact, id: Date.now() }];
        onChange(updatedContacts);
        setNewContact({ name: '', role: '', email: '', phone: '' });
        setIsAdding(false);
    };

    const handleRemove = (id) => {
        const updatedContacts = contacts.filter(c => c.id !== id);
        onChange(updatedContacts);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Contacts</h3>
                <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter un contact
                </button>
            </div>

            {isAdding && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Nom complet"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newContact.name}
                            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                        />
                        <input
                            type="text"
                            placeholder="Rôle (ex: Comptable)"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newContact.role}
                            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                        />
                        <input
                            type="email"
                            placeholder="Email"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newContact.email}
                            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                        />
                        <input
                            type="tel"
                            placeholder="Téléphone"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={newContact.phone}
                            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Ajouter
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contacts.map((contact) => (
                    <div key={contact.id} className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-gray-900">{contact.name}</span>
                                {contact.role && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                        {contact.role}
                                    </span>
                                )}
                            </div>
                            {contact.email && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Mail className="w-3 h-3" />
                                    <a href={`mailto:${contact.email}`} className="hover:text-blue-600">
                                        {contact.email}
                                    </a>
                                </div>
                            )}
                            {contact.phone && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Phone className="w-3 h-3" />
                                    <a href={`tel:${contact.phone}`} className="hover:text-blue-600">
                                        {contact.phone}
                                    </a>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handleRemove(contact.id)}
                            className="text-gray-400 hover:text-red-600"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {contacts.length === 0 && !isAdding && (
                    <div className="col-span-full text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        Aucun contact additionnel.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClientContacts;
