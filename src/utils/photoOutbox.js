// Photos prises sans réseau (zone blanche) : elles sont gardées sur le
// téléphone, dans IndexedDB, qui conserve les fichiers même si l'app est
// fermée, puis envoyées dans la galerie du client au retour du réseau
// (cf. OfflineSync).

import { supabase } from './supabase';
import { assertWithinQuota } from './storageQuota';
import { createPhotoOutbox } from './photoOutboxCore';

export const OUTBOX_EVENT = 'photo-outbox-change';
// Émis quand des photos en attente viennent d'arriver dans la galerie.
export const PHOTOS_SYNCED_EVENT = 'photo-outbox-synced';

const DB_NAME = 'artisan-facile-outbox';
const STORE = 'photos';
const BUCKET = 'project-photos';

const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

const withStore = async (mode, fn) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(req?.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
};

const indexedDbStore = {
    put: (item) => withStore('readwrite', s => s.put(item)),
    all: () => withStore('readonly', s => s.getAll()),
    remove: (id) => withStore('readwrite', s => s.delete(id)),
};

// Envoi d'une photo : upload puis ligne `project_photos`, comme un ajout en
// ligne. Rejouable sans doublon : une coupure après l'upload (fichier déjà
// présent) ou après l'insertion (ligne déjà là) ne crée rien en double.
const sendToSupabase = async (item) => {
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(item.path, item.blob, { contentType: item.blob.type || 'image/jpeg' });
    const alreadyUploaded = uploadError && (
        String(uploadError.statusCode) === '409' || /exists|duplicate/i.test(uploadError.message || '')
    );
    if (uploadError && !alreadyUploaded) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(item.path);

    const { data: existing, error: lookupError } = await supabase
        .from('project_photos')
        .select('id')
        .eq('photo_url', publicUrl)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return;

    const { error: insertError } = await supabase
        .from('project_photos')
        .insert([{ ...item.row, photo_url: publicUrl }]);
    if (insertError) throw insertError;
};

const outbox = createPhotoOutbox({
    store: indexedDbStore,
    send: sendToSupabase,
    onChange: () => window.dispatchEvent(new Event(OUTBOX_EVENT)),
});

/** Garde une photo sur le téléphone en attendant le réseau. */
export const queuePhoto = ({ path, blob, row }) => outbox.enqueue({ path, blob, row });

export const pendingPhotos = () => outbox.pending();

/**
 * Envoie les photos en attente. Le quota de stockage, qu'on ne peut pas
 * vérifier hors-ligne, est contrôlé ici : s'il est dépassé, rien n'est
 * envoyé et les photos restent sur le téléphone.
 */
export const flushPhotoOutbox = async () => {
    const items = await outbox.pending();
    if (items.length === 0) return { sent: 0, remaining: 0, error: null };
    try {
        await assertWithinQuota(items.reduce((sum, i) => sum + (i.blob?.size || 0), 0));
    } catch (error) {
        return { sent: 0, remaining: items.length, error };
    }
    const result = await outbox.flush();
    if (result.sent > 0) window.dispatchEvent(new Event(PHOTOS_SYNCED_EVENT));
    return result;
};
