-- Scope membership payment RPCs to the authenticated user.
-- The original implementations are retained as service-role-only internals so
-- their existing pricing, provider selection, idempotency and payment rules do
-- not change. Public RPC wrappers enforce auth.uid() before delegating.

alter function public.cenpaya_momo_membership_options(uuid, text, text[])
  rename to _cenpaya_momo_membership_options_internal;
revoke all on function public._cenpaya_momo_membership_options_internal(uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public._cenpaya_momo_membership_options_internal(uuid, text, text[])
  to service_role;

create function public.cenpaya_momo_membership_options(
  p_user_id uuid, p_environment text, p_supported text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;
  return public._cenpaya_momo_membership_options_internal(
    p_user_id, p_environment, p_supported
  );
end;
$$;
revoke all on function public.cenpaya_momo_membership_options(uuid, text, text[])
  from public, anon;
grant execute on function public.cenpaya_momo_membership_options(uuid, text, text[])
  to authenticated;

alter function public.cenpaya_momo_membership_start(uuid, text, text, text, text)
  rename to _cenpaya_momo_membership_start_internal;
revoke all on function public._cenpaya_momo_membership_start_internal(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public._cenpaya_momo_membership_start_internal(uuid, text, text, text, text)
  to service_role;

create function public.cenpaya_momo_membership_start(
  p_user_id uuid, p_idempotency_key text, p_provider text,
  p_payment_method text, p_phone text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;
  return public._cenpaya_momo_membership_start_internal(
    p_user_id, p_idempotency_key, p_provider, p_payment_method, p_phone
  );
end;
$$;
revoke all on function public.cenpaya_momo_membership_start(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.cenpaya_momo_membership_start(uuid, text, text, text, text)
  to authenticated;

alter function public.cenpaya_momo_membership_get(uuid)
  rename to _cenpaya_momo_membership_get_internal;
revoke all on function public._cenpaya_momo_membership_get_internal(uuid)
  from public, anon, authenticated;
grant execute on function public._cenpaya_momo_membership_get_internal(uuid)
  to service_role;

create function public.cenpaya_momo_membership_get(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.membership_momo_payments
    where id = p_payment_id and user_id = auth.uid()
  ) then
    return null;
  end if;
  return public._cenpaya_momo_membership_get_internal(p_payment_id);
end;
$$;
revoke all on function public.cenpaya_momo_membership_get(uuid)
  from public, anon;
grant execute on function public.cenpaya_momo_membership_get(uuid)
  to authenticated;
