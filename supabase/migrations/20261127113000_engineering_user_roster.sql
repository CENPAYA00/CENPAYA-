-- Allow Owner and Super Admin to appoint any active CenPaya account to an engineering function.
create or replace function public.engineering_available_users()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb;
begin
  select role into v_role from public.users where id=v_uid and banned=false and coalesce(is_deactivated,false)=false;
  if v_uid is null or v_role not in ('owner','super_admin') then
    return jsonb_build_object('ok',false,'error','Owner or Super Admin authority required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'email',u.email,'role',u.role) order by u.username),'[]'::jsonb)
  into v_rows from public.users u
  where u.banned=false and coalesce(u.is_deactivated,false)=false;
  return jsonb_build_object('ok',true,'users',v_rows);
end;$function$;
revoke all on function public.engineering_available_users() from public,anon;
grant execute on function public.engineering_available_users() to authenticated;
