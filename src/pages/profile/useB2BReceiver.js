import { useState } from 'react';
import { supabase } from '../../utils/supabase';

// Statut enregistrement annuaire DGFIP via B2BRouter
export const useB2BReceiver = () => {
    const [b2bReceiverStatus, setB2bReceiverStatus] = useState(null); // null | 'registered' | 'error' | 'loading'
    const [b2bReceiverError, setB2bReceiverError] = useState(null);

    // Initialisation depuis la RPC `get_my_profile_safe`
    const loadFromProfile = (data) => {
        setB2bReceiverStatus(data.b2b_receiver_status ?? null);
        setB2bReceiverError(data.b2b_receiver_error ?? null);
    };

    const registerB2BReceiver = async () => {
        setB2bReceiverStatus('loading');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/register-b2brouter-receiver`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });
            const result = await res.json();
            if (result.success) {
                setB2bReceiverStatus('registered');
                setB2bReceiverError(null);
            } else if (!result.skipped) {
                setB2bReceiverStatus('error');
                setB2bReceiverError(result.error || 'Erreur inconnue');
            } else {
                // B2BRouter non configuré côté serveur — pas bloquant
                setB2bReceiverStatus(null);
            }
        } catch (err) {
            setB2bReceiverStatus('error');
            setB2bReceiverError(String(err));
        }
    };

    return { b2bReceiverStatus, b2bReceiverError, registerB2BReceiver, loadFromProfile };
};
