-- ──────────────────────────────────────────────────────────────────────────────
-- Poste global : défaut « à l'unité » conditionné à la section (suivi de 20260705120000)
--
-- Le défaut « unité countable (u/pièce/point…) → affiché à l'unité » était trop
-- large : les composants d'un TABLEAU électrique (disjoncteurs, parafoudre,
-- contacteur), saisis en unité « u », restaient détaillés au lieu de fusionner
-- dans le poste de la section.
--
-- Nouveau défaut : une ligne matériel n'est pré-cochée « à l'unité » que si son
-- unité est countable ET qu'elle N'appartient PAS à une section technique
-- (tableau, coffret, armoire, GTL, distribution, modulaire, appareillage). Les
-- prises/spots d'une section de finition restent quantifiés ; les composants
-- d'un ensemble technique fusionnent. Le flag explicite display_per_unit de la
-- ligne reste prioritaire (surcharge artisan).
--
-- La liste de mots-clés DOIT rester synchronisée avec TECHNICAL_SECTION_RE côté
-- frontend (src/utils/clientView.js).
--
-- Seule la sous-requête `classified` change (ajout du titre de section et de la
-- condition) ; le reste de la fonction est identique à 20260705120000.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.build_poste_global_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_out       jsonb;
  v_sum_in    numeric;
  v_sum_out   numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN COALESCE(p_items, '[]'::jsonb);
  END IF;

  WITH raw AS (
    SELECT
      elem,
      ord,
      elem->>'type' AS jtype,
      SUM(CASE WHEN elem->>'type' = 'section' THEN 1 ELSE 0 END)
        OVER (ORDER BY ord ROWS UNBOUNDED PRECEDING) AS sect_idx
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
  ),
  titles AS (
    SELECT sect_idx, elem->>'description' AS title
    FROM raw
    WHERE jtype = 'section'
  ),
  classified AS (
    SELECT
      r.elem,
      r.ord,
      r.sect_idx,
      CASE WHEN COALESCE(r.jtype, 'service') = 'material' THEN 'material' ELSE 'service' END AS grp,
      COALESCE(NULLIF(r.elem->>'quantity', '')::numeric, 0)
        * COALESCE(NULLIF(r.elem->>'price', '')::numeric, 0) AS amount,
      COALESCE((r.elem->>'is_optional')::boolean, false) AS is_opt,
      -- « À l'unité » : flag explicite s'il est présent (surcharge artisan) ;
      -- sinon défaut = unité countable ET section NON technique (les composants
      -- d'un tableau/coffret… fusionnent dans le poste).
      CASE
        WHEN r.elem ? 'display_per_unit'
          THEN COALESCE((r.elem->>'display_per_unit')::boolean, false)
        ELSE
          lower(trim(COALESCE(r.elem->>'unit', ''))) IN
            ('u', 'unité', 'unite', 'pièce', 'piece', 'pce', 'pc', 'point', 'pt', 'points')
          AND COALESCE(ti.title, '') !~*
            '(tableau|coffret|armoire|gtl|goulotte technique|distribution|modulaire|appareillage)'
      END AS per_unit_raw
    FROM raw r
    LEFT JOIN titles ti ON ti.sect_idx = r.sect_idx
    WHERE COALESCE(r.jtype, 'service') <> 'section'
  ),
  lines AS (
    SELECT
      c.*,
      (c.grp = 'material' AND c.per_unit_raw) AS per_unit,
      (NOT c.is_opt AND NOT (c.grp = 'material' AND c.per_unit_raw)) AS mergeable
    FROM classified c
  ),
  labor_postes AS (
    SELECT
      sect_idx, 0 AS slot, 0 AS ord2,
      jsonb_build_object(
        'type', 'service',
        'is_poste', true,
        'description', COALESCE(
          NULLIF(string_agg(NULLIF(trim(elem->>'description'), ''), ' ; ' ORDER BY ord), ''),
          (SELECT title FROM titles t WHERE t.sect_idx = l.sect_idx),
          'Main d''œuvre'
        ),
        'line_total', round(sum(amount), 2)
      ) AS obj,
      sum(amount) AS amt_exact
    FROM lines l
    WHERE grp = 'service' AND mergeable
    GROUP BY sect_idx
  ),
  material_postes AS (
    SELECT
      sect_idx, 1 AS slot, 0 AS ord2,
      jsonb_build_object(
        'type', 'material',
        'is_poste', true,
        'description', COALESCE(
          (SELECT title FROM titles t WHERE t.sect_idx = l.sect_idx),
          CASE WHEN count(*) = 1 THEN NULLIF(trim(min(elem->>'description')), '') END,
          'Fournitures et matériel'
        ),
        'line_total', round(sum(amount), 2)
      ) AS obj,
      sum(amount) AS amt_exact
    FROM lines l
    WHERE grp = 'material' AND mergeable
    GROUP BY sect_idx
  ),
  per_unit_lines AS (
    SELECT
      sect_idx, 2 AS slot, ord AS ord2,
      jsonb_build_object(
        'type', 'material',
        'per_unit', true,
        'description', trim(elem->>'description'),
        'quantity', COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0),
        'unit', COALESCE(NULLIF(elem->>'unit', ''), 'u'),
        'line_total', round(amount, 2)
      ) AS obj,
      amount AS amt_exact
    FROM lines
    WHERE grp = 'material' AND per_unit AND NOT is_opt
  ),
  option_lines AS (
    SELECT
      sect_idx, 3 AS slot, ord AS ord2,
      jsonb_strip_nulls(jsonb_build_object(
        'type', grp,
        'is_optional', true,
        'id', elem->'id',
        'option_group', NULLIF(elem->>'option_group', ''),
        'option_group_required', (elem->>'option_group_required')::boolean,
        'description', trim(elem->>'description'),
        'per_unit', CASE WHEN grp = 'material' AND per_unit THEN true ELSE NULL END,
        'quantity', CASE WHEN grp = 'material' AND per_unit
                         THEN COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0) ELSE NULL END,
        'unit', CASE WHEN grp = 'material' AND per_unit
                     THEN COALESCE(NULLIF(elem->>'unit', ''), 'u') ELSE NULL END,
        'line_total', round(amount, 2)
      )) AS obj,
      amount AS amt_exact
    FROM lines
    WHERE is_opt
  ),
  emitted AS (
    SELECT * FROM labor_postes
    UNION ALL SELECT * FROM material_postes
    UNION ALL SELECT * FROM per_unit_lines
    UNION ALL SELECT * FROM option_lines
  )
  SELECT
    COALESCE(jsonb_agg(obj ORDER BY sect_idx, slot, ord2), '[]'::jsonb),
    COALESCE(sum(amt_exact), 0)
  INTO v_out, v_sum_out
  FROM emitted;

  SELECT COALESCE(sum(
           COALESCE(NULLIF(elem->>'quantity', '')::numeric, 0)
             * COALESCE(NULLIF(elem->>'price', '')::numeric, 0)
         ), 0)
  INTO v_sum_in
  FROM jsonb_array_elements(p_items) AS e(elem)
  WHERE COALESCE(elem->>'type', 'service') <> 'section';

  IF abs(COALESCE(v_sum_in, 0) - COALESCE(v_sum_out, 0)) > 0.0001 THEN
    RAISE EXCEPTION
      'Poste global incohérent : somme des postes (%) ≠ somme du détail (%). Devis non produit.',
      round(COALESCE(v_sum_out, 0), 2), round(COALESCE(v_sum_in, 0), 2);
  END IF;

  RETURN v_out;
END;
$function$;
