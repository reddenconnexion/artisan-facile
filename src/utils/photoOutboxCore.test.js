import { describe, expect, it, vi } from 'vitest';
import { createPhotoOutbox } from './photoOutboxCore';

const memoryStore = () => {
    const items = new Map();
    return {
        items,
        put: async (item) => { items.set(item.id, item); },
        all: async () => [...items.values()],
        remove: async (id) => { items.delete(id); },
    };
};

const networkError = () => new TypeError('Failed to fetch');

const photo = (n) => ({ path: `u/c/${n}.jpg`, blob: { size: 10 }, row: { client_id: 7, category: 'during' } });

describe('createPhotoOutbox', () => {
    it('met une photo en file et la garde jusqu’à l’envoi', async () => {
        const store = memoryStore();
        const onChange = vi.fn();
        const outbox = createPhotoOutbox({ store, send: vi.fn(), onChange });
        await outbox.enqueue(photo(1));
        expect((await outbox.pending()).map(p => p.path)).toEqual(['u/c/1.jpg']);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('envoie les photos dans l’ordre et vide la file', async () => {
        const store = memoryStore();
        const sent = [];
        const outbox = createPhotoOutbox({ store, send: async (item) => { sent.push(item.path); } });
        await outbox.enqueue(photo(1));
        await new Promise(r => setTimeout(r, 2));
        await outbox.enqueue(photo(2));
        expect(await outbox.flush()).toEqual({ sent: 2, remaining: 0, error: null });
        expect(sent).toEqual(['u/c/1.jpg', 'u/c/2.jpg']);
        expect(store.items.size).toBe(0);
    });

    it('s’arrête à la première coupure réseau sans rien perdre', async () => {
        const store = memoryStore();
        const send = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(networkError());
        const outbox = createPhotoOutbox({ store, send });
        for (const n of [1, 2, 3]) {
            await outbox.enqueue(photo(n));
            await new Promise(r => setTimeout(r, 2));
        }
        const result = await outbox.flush();
        expect(result.sent).toBe(1);
        expect(result.remaining).toBe(2);
        expect(send).toHaveBeenCalledTimes(2); // la 3e n'est pas tentée
        expect([...store.items.keys()]).toEqual(['u/c/2.jpg', 'u/c/3.jpg']);
    });

    it('une erreur serveur garde la photo en file et passe à la suivante', async () => {
        const store = memoryStore();
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('new row violates row-level security'))
            .mockResolvedValueOnce(undefined);
        const outbox = createPhotoOutbox({ store, send });
        await outbox.enqueue(photo(1));
        await new Promise(r => setTimeout(r, 2));
        await outbox.enqueue(photo(2));
        const result = await outbox.flush();
        expect(result).toMatchObject({ sent: 1, remaining: 1 });
        expect([...store.items.keys()]).toEqual(['u/c/1.jpg']);
    });

    it('deux envois simultanés n’envoient pas deux fois la même photo', async () => {
        const store = memoryStore();
        const send = vi.fn(async () => { await new Promise(r => setTimeout(r, 5)); });
        const outbox = createPhotoOutbox({ store, send });
        await outbox.enqueue(photo(1));
        const [a, b] = await Promise.all([outbox.flush(), outbox.flush()]);
        expect(send).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
    });
});
