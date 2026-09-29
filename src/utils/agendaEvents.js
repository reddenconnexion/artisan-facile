// Rendez-vous de l'agenda, consultables en zone blanche : chaque chargement en
// ligne garde une copie sur le téléphone (Agenda, mode terrain, et OfflineSync
// à l'ouverture de l'app), relue quand le réseau manque.

import { supabase } from './supabase';
import { fetchWithOfflineFallback } from './offlineCache';

export const loadAgendaEvents = (userId) =>
    fetchWithOfflineFallback(`agenda_${userId}`, async () => {
        const { data, error } = await supabase.from('events').select('*');
        if (error) throw error;
        return data || [];
    });
