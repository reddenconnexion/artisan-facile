import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { toast } from 'sonner';

// Changement de l'email de connexion (Supabase Auth)
export const useLoginEmailChange = (user) => {
    const [newEmail, setNewEmail] = useState('');
    const [emailChanging, setEmailChanging] = useState(false);
    const [emailChangeSent, setEmailChangeSent] = useState(false);

    const handleEmailChange = async (e) => {
        e.preventDefault();
        if (!newEmail.trim()) return;
        if (newEmail === user.email) {
            toast.error('Cette adresse est déjà votre email de connexion.');
            return;
        }
        setEmailChanging(true);
        try {
            const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
            if (error) throw error;
            setEmailChangeSent(true);
            toast.success('Email de confirmation envoyé ! Vérifiez votre boîte mail.');
        } catch (err) {
            toast.error('Erreur : ' + err.message);
        } finally {
            setEmailChanging(false);
        }
    };

    return { newEmail, setNewEmail, emailChanging, emailChangeSent, handleEmailChange };
};
