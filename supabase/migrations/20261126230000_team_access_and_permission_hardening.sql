-- Team communications read APIs and permission hardening.

create or replace function public.team_available_colleagues()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not exists(select 1 from public.users where id=v_uid and role in ('owner','super_admin','vice_admin','support_agent','staff_member') and banned=false) then return jsonb_build_object('ok',false,'error','team access required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'role',u.role,'title',i.official_title,'department',i.department) order by u.username),'[]'::jsonb)
 into v_rows
 from public.users u left join lateral (
   select official_title,department from public.staff_invitations si
   where si.accepted_by=u.id and si.appointment_status='active' order by accepted_at desc limit 1
 ) i on true
 where u.banned=false and (
   u.role in ('owner','super_admin') or exists(select 1 from public.staff_invitations si where si.accepted_by=u.id and si.appointment_status='active')
 );
 return jsonb_build_object('ok',true,'members',v_rows);
end;$function$;

create or replace function public.team_get_messages(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
 into v_rows from public.team_messages m join public.users u on u.id=m.sender_id
 where m.conversation_id=p_conversation_id and m.deleted_at is null;
 update public.team_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_uid;
 return jsonb_build_object('ok',true,'messages',v_rows);
end;$function$;

create or replace function public.team_list_escalations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_rows jsonb; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role in ('super_admin','owner') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_rows
 from public.team_escalations e
 where (v_role in ('super_admin','owner') or e.escalation_level in ('vice_admin','super_admin') or e.assigned_to=v_uid);
 return jsonb_build_object('ok',true,'escalations',v_rows);
end;$function$;

create or replace function public.team_update_escalation(p_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_role text; v_allowed boolean:=false;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
 select role into v_role from public.users where id=v_uid and banned=false;
 if v_role in ('super_admin','owner') then v_allowed:=true;
 elsif v_role='vice_admin' then
  select exists(select 1 from public.staff_invitations where accepted_by=v_uid and appointment_status='active' and permissions ? 'can_manage_escalations') into v_allowed;
 end if;
 if not v_allowed then return jsonb_build_object('ok',false,'error','escalation permission required'); end if;
 if p_status not in ('open','in_progress','resolved','dismissed') then return jsonb_build_object('ok',false,'error','invalid status'); end if;
 update public.team_escalations set status=p_status,resolution_note=nullif(trim(p_note),''),updated_at=now(),resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
 where id=p_id and (v_role in ('super_admin','owner') or assigned_to=v_uid or escalation_level='vice_admin');
 if not found then return jsonb_build_object('ok',false,'error','escalation not found or not authorized'); end if;
 insert into public.admin_audit_log(actor_id,action,target_table,target_id,new_value)
 values(v_uid,'team_escalation_'||p_status,'team_escalations',p_id,jsonb_build_object('note',p_note));
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.team_available_colleagues() to authenticated;
grant execute on function public.team_get_messages(uuid) to authenticated;
grant execute on function public.team_list_escalations() to authenticated;
grant execute on function public.team_update_escalation(uuid,text,text) to authenticated;
