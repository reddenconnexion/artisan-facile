-- Active le Realtime Supabase sur la table quotes
-- Requis pour que les subscriptions postgres_changes fonctionnent entre appareils

ALTER PUBLICATION supabase_realtime ADD TABLE quotes;
