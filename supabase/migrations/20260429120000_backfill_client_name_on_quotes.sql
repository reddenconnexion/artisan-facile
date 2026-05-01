-- Rattrapage : resynchronise client_name sur tous les devis et factures existants
-- depuis le nom réel du client dans la table clients.
-- Couvre les cas où le nom avait été modifié avant la mise en place du trigger.

UPDATE public.quotes q
SET client_name = c.name
FROM public.clients c
WHERE q.client_id = c.id
  AND q.client_name IS DISTINCT FROM c.name;
