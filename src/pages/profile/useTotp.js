import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { toastError } from '../../utils/supabaseErrorHandler';
import { isValidTotpCode, pickVerifiedTotpFactor, unverifiedTotpFactors } from '../../utils/mfa';

// Activation / désactivation de la double authentification (TOTP).
// Étapes d'activation : enroll() → l'utilisateur scanne le QR code → verify(code).
export const useTotp = () => {
    const [factor, setFactor] = useState(null); // facteur vérifié, ou null
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [enrollment, setEnrollment] = useState(null); // { factorId, qrCode, secret }

    const load = useCallback(async () => {
        try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;
            setFactor(pickVerifiedTotpFactor(data));
        } catch {
            setFactor(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const startEnroll = async () => {
        setBusy(true);
        try {
            // Un QR code scanné puis abandonné bloque une nouvelle activation.
            const { data: existing } = await supabase.auth.mfa.listFactors();
            for (const old of unverifiedTotpFactors(existing)) {
                await supabase.auth.mfa.unenroll({ factorId: old.id });
            }
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: `Artisan Facile ${new Date().toISOString().slice(0, 10)}`,
            });
            if (error) throw error;
            setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
        } catch (error) {
            toastError(error, "Impossible de démarrer l'activation.");
        } finally {
            setBusy(false);
        }
    };

    const cancelEnroll = async () => {
        const pending = enrollment;
        setEnrollment(null);
        if (pending) {
            await supabase.auth.mfa.unenroll({ factorId: pending.factorId }).catch(() => {});
        }
    };

    const confirmEnroll = async (code) => {
        if (!enrollment || !isValidTotpCode(code)) return false;
        setBusy(true);
        try {
            const { error } = await supabase.auth.mfa.challengeAndVerify({
                factorId: enrollment.factorId,
                code,
            });
            if (error) throw error;
            setEnrollment(null);
            await load();
            toast.success('Double authentification activée.');
            return true;
        } catch {
            toast.error('Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.');
            return false;
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        if (!factor) return;
        setBusy(true);
        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (error) throw error;
            await load();
            toast.success('Double authentification désactivée.');
        } catch (error) {
            toastError(error, 'Impossible de désactiver la double authentification.');
        } finally {
            setBusy(false);
        }
    };

    return { enabled: !!factor, loading, busy, enrollment, startEnroll, cancelEnroll, confirmEnroll, disable };
};
