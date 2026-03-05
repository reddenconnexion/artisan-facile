import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const TestModeContext = createContext(null);

const LS_MODE   = 'af_test_mode';
const LS_CLIENT = 'af_test_client';
const LS_EMAILS = 'af_test_emails';

export function TestModeProvider({ children }) {
    const { user } = useAuth();

    const [isTestMode, setIsTestMode] = useState(() => localStorage.getItem(LS_MODE) === 'true');
    const [testClient, setTestClient] = useState(() => {
        try { return JSON.parse(localStorage.getItem(LS_CLIENT)); } catch { return null; }
    });
    const [capturedEmails, setCapturedEmails] = useState(() => {
        try { return JSON.parse(localStorage.getItem(LS_EMAILS)) || []; } catch { return []; }
    });

    const ensureTestClient = useCallback(async () => {
        if (!user) return null;

        // Vérifier si le client test existe toujours en DB
        if (testClient?.id) {
            const { data } = await supabase
                .from('clients')
                .select('id, name, email, portal_token')
                .eq('id', testClient.id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (data) {
                setTestClient(data);
                localStorage.setItem(LS_CLIENT, JSON.stringify(data));
                return data;
            }
        }

        // Créer le client test
        const portalToken = crypto.randomUUID();
        const { data, error } = await supabase
            .from('clients')
            .insert([{
                user_id: user.id,
                name: '⚗️ Client Test',
                email: user.email,
                phone: '06 00 00 00 00',
                address: '1 Rue du Test',
                postal_code: '75001',
                city: 'Paris',
                status: 'signed',
                portal_token: portalToken,
                notes: 'Client créé automatiquement pour le mode test. Vous recevrez les emails à votre propre adresse.',
            }])
            .select()
            .single();

        if (error) { console.error(error); return null; }
        setTestClient(data);
        localStorage.setItem(LS_CLIENT, JSON.stringify(data));
        return data;
    }, [user, testClient]);

    const enableTestMode = useCallback(async () => {
        const client = await ensureTestClient();
        if (!client) { toast.error('Impossible de créer le client test'); return; }
        setIsTestMode(true);
        localStorage.setItem(LS_MODE, 'true');
        toast.success('Mode test activé — client "⚗️ Client Test" disponible', { duration: 4000 });
    }, [ensureTestClient]);

    const disableTestMode = useCallback(() => {
        setIsTestMode(false);
        localStorage.setItem(LS_MODE, 'false');
    }, []);

    const captureEmail = useCallback(({ email, subject, body }) => {
        const entry = { id: Date.now(), email, subject, body, timestamp: new Date().toISOString() };
        setCapturedEmails(prev => {
            const updated = [entry, ...prev].slice(0, 50);
            localStorage.setItem(LS_EMAILS, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const clearEmails = useCallback(() => {
        setCapturedEmails([]);
        localStorage.removeItem(LS_EMAILS);
    }, []);

    return (
        <TestModeContext.Provider value={{
            isTestMode,
            testClient,
            capturedEmails,
            enableTestMode,
            disableTestMode,
            captureEmail,
            clearEmails,
        }}>
            {children}
        </TestModeContext.Provider>
    );
}

export const useTestMode = () => useContext(TestModeContext);
