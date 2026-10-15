import { useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toastError } from '../utils/supabaseErrorHandler';
import { parseClientBlock } from '../utils/addressParser';
import { useModalA11y } from '../hooks/useModalA11y';
import { Input, Field } from './ui';

/**
 * Création rapide d'un client sans quitter la page (devis en cours) :
 * nom, téléphone, email et adresse suffisent pour chiffrer. Le reste
 * (SIREN, contacts, notes…) se complète plus tard depuis la fiche client.
 *
 * Un bloc collé depuis un SMS dans « Nom » ou « Adresse » est réparti
 * automatiquement entre les champs (même logique que la fiche client).
 *
 * onCreated(client) reçoit la ligne insérée.
 */
const QuickClientModal = ({ initialName = '', onClose, onCreated }) => {
    const { user } = useAuth();
    const containerRef = useModalA11y(true, onClose);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: initialName,
        phone: '',
        email: '',
        address: '',
        postal_code: '',
        city: '',
        type: 'individual',
    });

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handlePaste = (e) => {
        const parsed = parseClientBlock(e.clipboardData?.getData('text'));
        if (!parsed) return;
        e.preventDefault();
        setForm(prev => ({
            ...prev,
            name: prev.name || parsed.name || '',
            address: parsed.address || prev.address,
            postal_code: parsed.postal_code || prev.postal_code,
            city: parsed.city || prev.city,
            phone: prev.phone || parsed.phone || '',
            email: prev.email || parsed.email || '',
        }));
        toast.success('Coordonnées du client réparties automatiquement');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            toast.error('Le nom du client est obligatoire');
            return;
        }
        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('clients')
                .insert([{ ...form, name: form.name.trim(), status: 'lead', user_id: user.id }])
                .select()
                .single();
            if (error) throw error;
            toast.success('Client créé');
            onCreated(data);
        } catch (error) {
            toastError(error, 'Erreur lors de la création du client');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <form
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Nouveau client"
                onSubmit={handleSubmit}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5 safe-area-bottom"
            >
                <div className="flex items-start justify-between gap-3 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nouveau client</h2>
                    <button type="button" onClick={onClose} className="p-1 -mr-1 text-gray-400" aria-label="Fermer">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    L'essentiel pour le devis. Collez le SMS du client dans « Nom » ou « Adresse » pour tout remplir d'un coup.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                    {[['individual', 'Particulier'], ['professional', 'Professionnel']].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, type: value }))}
                            aria-pressed={form.type === value}
                            className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                                form.type === value
                                    ? 'border-ios bg-ios/10 text-ios'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    <Field label="Nom" required htmlFor="quick-client-name">
                        <Input id="quick-client-name" value={form.name} onChange={set('name')} onPaste={handlePaste} autoComplete="name" required />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Téléphone" htmlFor="quick-client-phone">
                            <Input id="quick-client-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                        </Field>
                        <Field label="Email" htmlFor="quick-client-email">
                            <Input id="quick-client-email" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="email" />
                        </Field>
                    </div>
                    <Field label="Adresse" htmlFor="quick-client-address">
                        <Input id="quick-client-address" value={form.address} onChange={set('address')} onPaste={handlePaste} autoComplete="street-address" />
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Code postal" htmlFor="quick-client-cp">
                            <Input id="quick-client-cp" inputMode="numeric" maxLength={5} value={form.postal_code} onChange={set('postal_code')} autoComplete="postal-code" />
                        </Field>
                        <Field label="Ville" htmlFor="quick-client-city" className="col-span-2">
                            <Input id="quick-client-city" value={form.city} onChange={set('city')} autoComplete="address-level2" />
                        </Field>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                    <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-ios hover:opacity-90 rounded-xl disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                        Créer et utiliser
                    </button>
                </div>
            </form>
        </div>
    );
};

export default QuickClientModal;
