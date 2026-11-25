-- Owner-scoped payment destination preferences for the D1-authenticated Supabase Worker.
-- The function deliberately derives the user from auth.uid(); callers cannot choose another user.

CREATE OR REPLACE FUNCTION public.update_my_payment_preferences(
  p_country_iso text,
  p_momo_number text,
  p_momo_provider text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_country public.supported_countries%ROWTYPE;
  v_prefix text;
  v_digits text;
  v_provider text := lower(trim(coalesce(p_momo_provider, '')));
  v_changed integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_country
  FROM public.supported_countries
  WHERE country_iso = upper(trim(coalesce(p_country_iso, '')))
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'country_not_available');
  END IF;

  IF v_provider NOT IN ('mtn_momo', 'orange_money')
     OR NOT (v_provider = ANY(v_country.enabled_methods)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_method_not_available');
  END IF;

  v_prefix := regexp_replace(v_country.phone_prefix, '[^0-9]', '', 'g');
  v_digits := regexp_replace(coalesce(p_momo_number, ''), '[^0-9]', '', 'g');

  IF v_prefix = '237' AND length(v_digits) = 9 AND left(v_digits, 1) = '6' THEN
    v_digits := v_prefix || v_digits;
  END IF;

  IF length(v_digits) <> length(v_prefix) + 9
     OR left(v_digits, length(v_prefix)) <> v_prefix
     OR substring(v_digits, length(v_prefix) + 1, 1) <> '6' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mobile_money_number');
  END IF;

  UPDATE public.users
  SET country_iso = v_country.country_iso,
      momo_number = '+' || v_digits,
      momo_provider = v_provider
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'country_iso', v_country.country_iso,
    'momo_number', '+' || v_digits,
    'momo_provider', v_provider
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_payment_preferences(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_payment_preferences(text, text, text) TO authenticated;
