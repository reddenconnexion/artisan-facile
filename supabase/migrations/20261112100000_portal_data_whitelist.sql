-- ──────────────────────────────────────────────────────────────────────────────
-- get_portal_data : listes blanches pour l'artisan, le client et les devis
--
-- RÉGRESSION CORRIGÉE. 20260310090000 avait remplacé `row_to_json(p)` par une
-- liste blanche ; 20260507100000 (expiration du jeton) a réintroduit
-- `row_to_json(p)`, repris tel quel par 20260704120000 puis 20260705120000.
-- Résultat : toute la ligne `profiles` de l'artisan (email de connexion,
-- identifiants Stripe, plan, smtp_config, pdp_config, ai_preferences,
-- follow_up_settings, autopilot_settings, marketing_data…) partait vers le
-- navigateur de n'importe quel détenteur d'un lien /p/:token, sans session.
--
-- Même défaut, corrigé ici aussi :
--   • `client`  était un row_to_json(c) (notes internes, contacts, portal_token,
--     autopilot_paused…) ;
--   • chaque devis partait en to_jsonb(q) complet (public_token, compteurs de
--     relance, suivi de transmission, temps de création, urgence…).
--
-- Tout le reste est repris À L'IDENTIQUE de 20260705120000 : contrôle du jeton,
-- repli par devis + audit_logs, photos, rapports d'intervention.
--
-- NE PLUS JAMAIS remettre row_to_json / to_jsonb d'une ligne entière dans cette
-- fonction : src/utils/posteGlobalPortal.sql.test.js échoue si une clé sensible
-- réapparaît.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_portal_data(token_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_client_id  bigint;
    target_user_id    uuid;
    v_revoked         boolean;
    v_expires_at      timestamptz;
    client_data       json;
    artisan_profile   json;
    client_quotes     json;
    client_photos     json;
    client_reports    json;
    v_quotes          jsonb := '[]'::jsonb;
    v_items           jsonb;
    q                 record;
    -- Colonnes de `quotes` visibles côté client (items est traité à part).
    v_quote_keys      constant text[] := ARRAY[
        'id', 'client_id', 'parent_id', 'parent_quote_id',
        'type', 'status', 'title', 'work_object',
        'quote_number', 'invoice_number',
        'date', 'valid_until', 'created_at', 'updated_at',
        'total_ht', 'total_tva', 'total_ttc', 'include_tva',
        'operation_category', 'vat_on_debits',
        'notes', 'content_en', 'client_display_mode', 'amendment_details',
        'has_material_deposit', 'deposit_percentage', 'paid_at',
        'signature', 'signed_at', 'bon_pour_accord',
        'signature_suspended_at', 'require_otp',
        'is_external', 'original_pdf_url', 'report_pdf_url',
        'intervention_address', 'intervention_postal_code', 'intervention_city'
    ];
BEGIN
    -- Identifier client + artisan + état du token
    SELECT id, user_id, portal_token_revoked, portal_token_expires_at
      INTO target_client_id, target_user_id, v_revoked, v_expires_at
      FROM clients
     WHERE portal_token = token_input;

    IF target_client_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_revoked THEN
        RETURN json_build_object('error', 'revoked');
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        RETURN json_build_object('error', 'expired', 'expired_at', v_expires_at);
    END IF;

    -- Données client — liste blanche : ce que le portail affiche (nom), ce dont
    -- la signature a besoin (présence d'un e-mail pour l'OTP) et ce que le PDF
    -- imprime dans le bloc destinataire. Ni notes internes, ni contacts, ni
    -- jeton, ni réglages de relance.
    SELECT json_build_object(
        'id',           c.id,
        'name',         c.name,
        'email',        c.email,
        'address',      c.address,
        'postal_code',  c.postal_code,
        'city',         c.city,
        'siren',        c.siren,
        'tva_intracom', c.tva_intracom
    ) INTO client_data
      FROM clients c
     WHERE id = target_client_id;

    -- Profil artisan — liste blanche. Chaque clé est lue soit par ClientPortal.jsx
    -- (en-tête, paiement, avis), soit par les générateurs PDF exécutés dans le
    -- navigateur du client (quotePdf.js, reportPdf.js, facturxGenerator.js).
    -- Jamais : email de connexion, identifiants Stripe, plan, smtp_config,
    -- pdp_config, ai_preferences, follow_up_settings, autopilot_settings,
    -- marketing_data, objectif de CA, signature e-mail, b2b_receiver_*.
    SELECT json_build_object(
        -- Identité et coordonnées (en-tête du portail et des PDF)
        'company_name',       p.company_name,
        'full_name',          p.full_name,
        'logo_url',           p.logo_url,
        'phone',              p.phone,
        'professional_email', p.professional_email,
        'website',            p.website,
        'address',            p.address,
        'postal_code',        p.postal_code,
        'city',               p.city,
        'siret',              p.siret,
        'trade',              p.trade,
        'brand_color',        p.brand_color,
        -- Paiement (bloc « Régler » du portail, pied de facture, QR de virement)
        'iban',               p.iban,
        'wero_phone',         p.wero_phone,
        -- Avis clients
        'google_review_url',       p.google_review_url,
        'facebook_review_url',     p.facebook_review_url,
        'pages_jaunes_review_url', p.pages_jaunes_review_url,
        -- Assurance (mention légale du PDF, attestation)
        'insurance_company',                 p.insurance_company,
        'insurance_contract_number',         p.insurance_contract_number,
        'insurance_company_address',         p.insurance_company_address,
        'insurance_coverage_area',           p.insurance_coverage_area,
        'insurance_attestation_url',         p.insurance_attestation_url,
        'insurance_attestation_valid_until', p.insurance_attestation_valid_until
    ) INTO artisan_profile
      FROM profiles p
     WHERE id = target_user_id;

    -- Devis (hors brouillons) — items rendus selon le mode d'affichage client.
    --
    -- Résilience « lecture de liste » : le portail affiche PLUSIEURS devis. Si la
    -- fusion « poste global » d'un devis échoue (contrôle d'égalité, données
    -- incohérentes…), on ISOLE ce devis — repli en présentation détaillée de
    -- secours (les champs internes restent expurgés) — sans interrompre
    -- l'affichage des autres, et on consigne le devis fautif dans audit_logs pour
    -- que l'artisan le corrige. Le RAISE reste bloquant ailleurs (get_public_quote
    -- sur un devis isolé, et get_client_facing_items à la génération/l'envoi).
    FOR q IN
        SELECT *
          FROM quotes
         WHERE client_id = target_client_id
           AND status != 'draft'
         ORDER BY date DESC
    LOOP
        BEGIN
            v_items := public.client_facing_items(q.items, q.client_display_mode);
        EXCEPTION WHEN OTHERS THEN
            v_items := public.strip_internal_item_fields(q.items);
            BEGIN
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_label, details)
                VALUES (
                    q.user_id,
                    'quote.display_fallback',
                    'quote',
                    q.id,
                    COALESCE(q.title, q.quote_number, 'Devis'),
                    jsonb_build_object(
                        'client_display_mode', q.client_display_mode,
                        'fallback', 'detailed',
                        'error', SQLERRM
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Ne jamais casser la lecture du portail pour un échec de log.
                NULL;
            END;
        END;

        -- Liste blanche des colonnes du devis : on ne garde de la ligne que les
        -- clés lues par le portail et le PDF. Filtrage par nom de clé plutôt que
        -- jsonb_build_object : une colonne ajoutée plus tard à `quotes` reste
        -- masquée tant qu'elle n'est pas inscrite ici.
        v_quotes := v_quotes || jsonb_build_array(
            jsonb_set(
                (SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
                   FROM jsonb_each(to_jsonb(q)) AS kv
                  WHERE kv.key = ANY (v_quote_keys)),
                '{items}', v_items
            )
        );
    END LOOP;

    client_quotes := v_quotes::json;

    -- Photos
    SELECT json_agg(pp ORDER BY created_at DESC) INTO client_photos
      FROM project_photos pp
     WHERE client_id = target_client_id;

    -- Rapports d'intervention
    SELECT json_agg(
        json_build_object(
            'id', ir.id,
            'title', ir.title,
            'date', ir.date,
            'status', ir.status,
            'report_number', ir.report_number,
            'report_pdf_url', ir.report_pdf_url,
            'signed_at', ir.signed_at,
            'signer_name', ir.signer_name,
            'description', ir.description,
            'work_done', ir.work_done,
            'materials_used', ir.materials_used,
            'photos', ir.photos,
            'client_signature', ir.client_signature,
            'client_name', ir.client_name,
            'intervention_address', ir.intervention_address,
            'intervention_postal_code', ir.intervention_postal_code,
            'intervention_city', ir.intervention_city,
            'start_time', ir.start_time,
            'end_time', ir.end_time,
            'duration_hours', ir.duration_hours,
            'notes', ir.notes
        )
        ORDER BY ir.date DESC
    ) INTO client_reports
      FROM intervention_reports ir
     WHERE ir.client_id = target_client_id
       AND ir.status IN ('completed', 'signed');

    RETURN json_build_object(
        'client',   client_data,
        'artisan',  artisan_profile,
        'quotes',   COALESCE(client_quotes,  '[]'::json),
        'photos',   COALESCE(client_photos,  '[]'::json),
        'reports',  COALESCE(client_reports, '[]'::json)
    );
END;
$$;
