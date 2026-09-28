-- Make realtime UPDATE payloads include the full previous row so client-side
-- transition detection (e.g. "signed_at went from null to non-null") works.
-- Without this the `old` record only contains the primary key, so the
-- useSignatureNotifications hook fires on every quote update — including
-- unrelated work_stage changes from the Pilotage Chantiers board.
ALTER TABLE public.quotes REPLICA IDENTITY FULL;
