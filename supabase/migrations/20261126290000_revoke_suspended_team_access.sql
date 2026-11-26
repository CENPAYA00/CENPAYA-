-- Close every team-data path when an appointment is suspended or removed.

create or replace function public.is_active_team_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp
as $function$
 select exists(
  select 1 from public.users u
  where u.id=p_user_id and u.banned=false and (
   u.role in ('owner','super_admin') or
   (u.role in ('vice_admin','support_agent','staff_member') and exists(
     select 1 from public.staff_invitations i
     where i.accepted_by=u.id and i.role=u.role and i.appointment_status='active'
   ))
  )
 );
$function$;

create or replace function public.team_list_conversations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'type',c.conversation_type,'title',c.title,'created_at',c.created_at,
  'last_message',(select body from public.team_messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc limit 1),
  'last_message_at',(select max(created_at) from public.team_messages m where m.conversation_id=c.id)
 ) order by (select max(created_at) from public.team_messages m where m.conversation_id=c.id) desc nulls last),'[]'::jsonb)
 into v_rows from public.team_conversations c join public.team_conversation_members cm on cm.conversation_id=c.id
 where cm.user_id=v_uid and c.is_archived=false;
 return jsonb_build_object('ok',true,'conversations',v_rows);
end;$function$;

create or replace function public.team_get_messages(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'attachment_url',m.attachment_url,'created_at',m.created_at) order by m.created_at),'[]'::jsonb)
 into v_rows from public.team_messages m join public.users u on u.id=m.sender_id
 where m.conversation_id=p_conversation_id and m.deleted_at is null;
 update public.team_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_uid;
 return jsonb_build_object('ok',true,'messages',v_rows);
end;$function$;

create or replace function public.team_send_message(p_conversation_id uuid,p_body text,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if p_body is null or char_length(trim(p_body))=0 or char_length(p_body)>10000 then return jsonb_build_object('ok',false,'error','invalid message'); end if;
 if p_attachment_url is not null and (char_length(p_attachment_url)>2048 or p_attachment_url !~ '^https://') then return jsonb_build_object('ok',false,'error','attachment must be a secure HTTPS link'); end if;
 if not exists(select 1 from public.team_conversation_members where conversation_id=p_conversation_id and user_id=v_uid) then return jsonb_build_object('ok',false,'error','not a conversation member'); end if;
 insert into public.team_messages(conversation_id,sender_id,body,attachment_url)
 values(p_conversation_id,v_uid,trim(p_body),p_attachment_url) returning id into v_id;
 return jsonb_build_object('ok',true,'message_id',v_id);
end;$function$;

create or replace function public.team_search_messages(p_query text,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 if p_query is null or char_length(trim(p_query))<2 then return jsonb_build_object('ok',false,'error','enter at least two search characters'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'conversation_id',m.conversation_id,'conversation_title',c.title,
  'sender_id',m.sender_id,'sender_name',u.username,'body',m.body,'created_at',m.created_at
 ) order by m.created_at desc),'[]'::jsonb)
 into v_rows
 from (
  select * from public.team_messages
  where deleted_at is null and body ilike '%'||left(trim(p_query),100)||'%'
  order by created_at desc limit greatest(1,least(p_limit,100))
 ) m
 join public.team_conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=v_uid
 join public.team_conversations c on c.id=m.conversation_id
 join public.users u on u.id=m.sender_id;
 return jsonb_build_object('ok',true,'results',v_rows);
end;$function$;

create or replace function public.team_my_notifications(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'title',title,'body',body,'entity_type',entity_type,'entity_id',entity_id,'read_at',read_at,'created_at',created_at) order by created_at desc),'[]'::jsonb)
 into v_rows from (select * from public.team_notifications where recipient_id=v_uid order by created_at desc limit greatest(1,least(p_limit,100))) n;
 return jsonb_build_object('ok',true,'notifications',v_rows);
end;$function$;

create or replace function public.team_mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not public.is_active_team_member(v_uid) then return jsonb_build_object('ok',false,'error','active team appointment required'); end if;
 update public.team_notifications set read_at=now() where id=p_id and recipient_id=v_uid;
 if not found then return jsonb_build_object('ok',false,'error','notification not found'); end if;
 return jsonb_build_object('ok',true);
end;$function$;

grant execute on function public.is_active_team_member(uuid) to authenticated;
grant execute on function public.team_list_conversations() to authenticated;
grant execute on function public.team_get_messages(uuid) to authenticated;
grant execute on function public.team_send_message(uuid,text,text) to authenticated;
grant execute on function public.team_search_messages(text,integer) to authenticated;
grant execute on function public.team_my_notifications(integer) to authenticated;
grant execute on function public.team_mark_notification_read(uuid) to authenticated;
