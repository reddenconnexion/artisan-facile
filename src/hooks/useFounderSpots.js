import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

/**
 * Places restantes de l'offre « Membre fondateur » (RPC founder_spots_left).
 * null tant que le chiffre n'est pas connu (chargement ou erreur) : l'appli
 * n'affiche alors aucune promesse de place.
 */
export const useFounderSpots = () => {
    const [spotsLeft, setSpotsLeft] = useState(null);

    useEffect(() => {
        let alive = true;
        supabase.rpc('founder_spots_left').then(({ data, error }) => {
            if (!alive) return;
            setSpotsLeft(error || typeof data !== 'number' ? null : data);
        }, () => alive && setSpotsLeft(null));
        return () => { alive = false; };
    }, []);

    return spotsLeft;
};
