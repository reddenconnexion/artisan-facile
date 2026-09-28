-- `access_logs` (créée par le script `fix_security_vulnerabilities.sql`,
-- jamais versionné dans supabase/migrations/) autorisait n'importe qui,
-- authentifié ou non, à y écrire : `FOR INSERT WITH CHECK (true)`. Aucun
-- code de l'application n'insère dans cette table (elle n'est référencée
-- nulle part dans src/), donc l'exposition n'a jamais servi qu'à polluer la
-- table de logs — via la seule clé anon, déjà publique — sans qu'aucune
-- fonctionnalité n'en dépende. On restreint l'écriture aux utilisateurs
-- authentifiés.

DROP POLICY IF EXISTS "Allow log insertion" ON access_logs;

CREATE POLICY "Authenticated users can insert log entries"
  ON access_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
