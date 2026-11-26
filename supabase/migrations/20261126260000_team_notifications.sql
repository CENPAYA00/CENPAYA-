-- Private team notifications for internal messages, task updates and escalations.

create table if not exists public.team_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.users(id) on delete cascade,
 event_type text not null check (event_type in ('team_message','task_update','escalation')),
 title text not null,
 body text,
 entity_type text,
 entity_id uuid,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists team_notifications_inbox_idx on public.team_notifications(recipient_id,read_at,created_at desc);
alter table public.team_notifications enable row level security;
revoke all on public.team_notifications from anon,authenticated;

create or replace function public.notify_team_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_name text;
begin
 select username into v_name from public.users where id=new.sender_id;
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select cm.user_id,'team_message','New team message',left(new.body,240),'team_conversation',new.conversation_id
 from public.team_conversation_members cm
 where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id
   and public.is_active_team_member(cm.user_id);
 return new;
end;$function$;
drop trigger if exists team_message_notification_trigger on public.team_messages;
create trigger team_message_notification_trigger after insert on public.team_messages
for each row execute function public.notify_team_message();

create or replace function public.notify_team_task_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_assigned uuid; v_supervisor uuid; v_title text;
begin
 select assigned_to,supervisor_id,title into v_assigned,v_supervisor,v_title from public.team_tasks where id=new.task_id;
 insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
 select distinct target.user_id,'task_update','Task update: '||coalesce(v_title,'Team task'),coalesce(new.body,new.update_type),'team_task',new.task_id
 from (values(v_assigned),(v_supervisor)) as target(user_id)
 where target.user_id is not null and target.user_id<>new.author_id
   and public.is_active_team_member(target.user_id);
 return new;
end;$function$;
drop trigger if exists team_task_update_notification_trigger on public.team_task_updates;
create trigger team_task_update_notification_trigger after insert on public.team_task_updates
for each row execute function public.notify_team_task_update();

create or replace function public.notify_team_escalation()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $function$
begin
 if new.assigned_to is not null and public.is_active_team_member(new.assigned_to) then
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  values(new.assigned_to,'escalation','New escalation',left(new.reason,240),'team_escalation',new.id);
 else
  insert into public.team_notifications(recipient_id,event_type,title,body,entity_type,entity_id)
  select u.id,'escalation','New '||replace(new.escalation_level,'_',' ')||' escalation',left(new.reason,240),'team_escalation',new.id
  from public.users u
  where ((new.escalation_level='vice_admin' and u.role='vice_admin')
     or (new.escalation_level='super_admin' and u.role='super_admin')
     or (new.escalation_level='owner' and u.role='owner'))
     and public.is_active_team_member(u.id);
 end if;
 return new;
end;$function$;
drop trigger if exists team_escalation_notification_trigger on public.team_escalations;
create trigger team_escalation_notification_trigger after insert on public.team_escalations
for each row execute function public.notify_team_escalation();

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

grant execute on function public.team_my_notifications(integer) to authenticated;
grant execute on function public.team_mark_notification_read(uuid) to authenticated;
