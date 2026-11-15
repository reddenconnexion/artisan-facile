-- Fonction de statistiques plateforme (réservée à l'administrateur).
--
-- Pourquoi SECURITY DEFINER ?
--   Le RLS empêche un utilisateur de lire les données des autres artisans
--   (clients/quotes filtrés par user_id, auth.users inaccessible côté client).
--   Cette fonction s'exécute avec les droits de son propriétaire pour ne
--   renvoyer que des AGRÉGATS (compteurs), jamais les données métier des
--   autres comptes. L'accès est verrouillé par une allowlist d'emails.
--
-- Pour ajouter/retirer un administrateur : modifier la liste ci-dessous,
-- puis réexécuter ce fichier (CREATE OR REPLACE).

create or replace function public.get_admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_emails text[] := array['rotvener97@gmail.com', 'reddenconnexion@gmail.com'];
  caller_email text;
  result jsonb;
begin
  -- Identité de l'appelant (depuis sa session authentifiée)
  select email into caller_email from auth.users where id = auth.uid();

  if caller_email is null or not (caller_email = any (admin_emails)) then
    raise exception 'Accès refusé : réservé à l''administrateur.'
      using errcode = '42501';
  end if;

  with u as (
    select
      usr.id,
      usr.email,
      usr.created_at,
      usr.last_sign_in_at,
      -- Dernière activité réelle : la session est rafraîchie automatiquement
      -- (~1 fois/heure) tant que l'appli est utilisée, sans reconnexion.
      -- On prend aussi la dernière modification de devis/clients.
      greatest(
        usr.last_sign_in_at,
        (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = usr.id),
        (select max(rt.updated_at) from auth.refresh_tokens rt where rt.user_id = usr.id::text),
        (select max(coalesce(q.updated_at, q.created_at)) from public.quotes q where q.user_id = usr.id),
        (select max(coalesce(c.updated_at, c.created_at)) from public.clients c where c.user_id = usr.id)
      ) as last_activity_at,
      -- Comptes de test/démo/anonymes à exclure des « vrais » artisans
      (usr.email is null
        or usr.email ilike '%@artisan-facile.local'
        or usr.email ilike '%+test%'
        or coalesce(usr.is_anonymous, false)) as is_demo,
      (usr.email = any (admin_emails)) as is_owner,
      (select count(*) from public.clients c where c.user_id = usr.id) as nb_clients,
      (select count(*) from public.quotes  q where q.user_id = usr.id) as nb_quotes
    from auth.users usr
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'all_accounts',   (select count(*) from u),
      'real_artisans',  (select count(*) from u where not is_demo),
      'other_artisans', (select count(*) from u where not is_demo and not is_owner),
      'active_7d',      (select count(*) from u where not is_demo and last_activity_at > now() - interval '7 days'),
      'active_30d',     (select count(*) from u where not is_demo and last_activity_at > now() - interval '30 days'),
      'new_30d',        (select count(*) from u where not is_demo and created_at > now() - interval '30 days'),
      'with_activity',  (select count(*) from u where not is_demo and (nb_clients > 0 or nb_quotes > 0)),
      'total_quotes',   (select coalesce(sum(nb_quotes), 0)  from u where not is_demo),
      'total_clients',  (select coalesce(sum(nb_clients), 0) from u where not is_demo)
    ),
    'artisans', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select email, created_at, last_sign_in_at, last_activity_at, nb_clients, nb_quotes, is_owner
        from u
        where not is_demo
      ) r
    )
  ) into result;

  return result;
end;
$$;

-- Verrouillage des droits d'exécution : aucun accès anonyme.
revoke all on function public.get_admin_stats() from public;
revoke all on function public.get_admin_stats() from anon;
grant execute on function public.get_admin_stats() to authenticated;
