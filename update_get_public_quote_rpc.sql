-- Met à jour la fonction get_public_quote pour inclure l'ID de l'artisan
-- Cela permet au frontend d'envoyer une notification sur le bon topic ntfy

CREATE OR REPLACE FUNCTION get_public_quote(lookup_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', q.id,
    'date', q.date,
    'valid_until', q.valid_until,
    'items', q.items,
    'total_ht', q.total_ht,
    'total_tva', q.total_tva,
    'total_ttc', q.total_ttc,
    'notes', q.notes,
    'status', q.status,
    'title', q.title,
    'signature', q.signature,
    'signed_at', q.signed_at,
    'original_pdf_url', q.original_pdf_url,
    'client', jsonb_build_object(
      'name', c.name,
      'address', c.address,
      'email', c.email
    ),
    'artisan', jsonb_build_object(
      'id', p.id, -- Ajout de l'ID ici
      'company_name', p.company_name,
      'full_name', p.full_name,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'phone', p.phone,
      'email', p.professional_email,
      'siret', p.siret,
      'logo_url', p.logo_url,
      'website', p.website
    )
  ) INTO result
  FROM quotes q
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN profiles p ON q.user_id = p.id
  WHERE q.public_token = lookup_token;

  RETURN result;
END;
$$;
