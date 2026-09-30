import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase';
import { parseReportDate, planReportPhotoLink } from '../../utils/reportPhotoLink';

// ── Photos de visite et fiche client ───────────────────────────────────
// Une visite prédevis démarre souvent sans client en fiche : on passe
// voir, on photographie, et le client n'est créé qu'au retour. Ses photos
// restaient alors dans le seul rapport de visite. Rattacher le client au
// rapport les verse donc maintenant dans son dossier photo, en « avant
// travaux » — le même fichier, une entrée de plus, sans second
// téléversement ni quota supplémentaire.
export const useVisitPhotoSync = ({ existingReport, isSiteVisit, user, formData }) => {
    const linkedClientRef = useRef(null); // client déjà servi par ce rapport
    useEffect(() => {
        if (existingReport) linkedClientRef.current = existingReport.client_id ?? null;
    }, [existingReport]);

    const syncVisitPhotosToClient = async () => {
        if (!isSiteVisit || !user) return;
        const photos = (formData.photos || []).filter(p => p?.url);
        const clientId = formData.client_id ? Number(formData.client_id) : null;
        const previousClientId = linkedClientRef.current;
        if (!clientId && !previousClientId) return;
        try {
            // Ce qui est déjà dans le dossier du client n'y entre pas deux
            // fois : la visite lancée depuis une fiche y a déjà versé ses
            // photos, et un simple réenregistrement ne doit rien dupliquer.
            let linkedUrls = [];
            if (clientId && photos.length) {
                const { data, error } = await supabase
                    .from('project_photos')
                    .select('photo_url')
                    .eq('user_id', user.id)
                    .eq('client_id', clientId)
                    .in('photo_url', photos.map(p => p.url));
                if (error) throw error;
                linkedUrls = (data || []).map(r => r.photo_url);
            }
            const { rows, unlinkClientId, unlinkUrls } = planReportPhotoLink({
                userId: user.id,
                clientId,
                previousClientId,
                photos,
                linkedUrls,
                date: parseReportDate(formData.date, new Date()),
            });
            if (unlinkClientId && unlinkUrls.length) {
                const { error } = await supabase
                    .from('project_photos')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('client_id', unlinkClientId)
                    .in('photo_url', unlinkUrls);
                if (error) throw error;
            }
            if (rows.length) {
                const { error } = await supabase.from('project_photos').insert(rows);
                if (error) throw error;
                toast.success(`${rows.length} photo(s) ajoutée(s) au dossier du client`);
            }
            linkedClientRef.current = clientId;
        } catch (err) {
            // Le rapport, lui, est bien enregistré : on le dit sans faire
            // croire à une perte, et un nouvel enregistrement réessaiera.
            console.error('Rattachement des photos à la fiche client impossible :', err);
            toast.error("Photos non ajoutées au dossier du client — réenregistrez pour réessayer.");
        }
    };

    return syncVisitPhotosToClient;
};
