-- Keep the shared General Team Room in sync as app-team members are appointed.
-- Engineering appointments remain separate from users.role.

create or replace function public.team_sync_general_room_membership()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_user_id uuid;
  v_actor uuid;
  v_role text;
begin
  if tg_table_name='staff_invitations' then
    v_user_id:=new.accepted_by;
    v_actor:=new.accepted_by;
    v_role:=new.role;
    if new.appointment_status<>'active'
       or v_user_id is null
       or v_role not in ('vice_admin','support_agent','staff_member') then
      return new;
    end if;
  else
    v_user_id:=new.id;
    v_actor:=new.id;
    v_role:=new.role;
    if new.banned or coalesce(new.is_deactivated,false)
       or v_role not in ('owner','super_admin') then
      return new;
    end if;
  end if;

  if not exists (
    select 1 from public.team_conversations
    where conversation_type='announcement'
      and title='General Team Room'
      and is_archived=false
  ) then
    insert into public.team_conversations(conversation_type,title,created_by)
    values('announcement','General Team Room',v_actor);
  end if;

  insert into public.team_conversation_members(conversation_id,user_id,added_by)
  select c.id,v_user_id,v_actor
  from public.team_conversations c
  where c.conversation_type='announcement'
    and c.title='General Team Room'
    and c.is_archived=false
  on conflict do nothing;

  return new;
end;
$function$;

drop trigger if exists team_room_staff_invitation_sync on public.staff_invitations;
create trigger team_room_staff_invitation_sync
after insert or update of accepted_by,appointment_status,role
on public.staff_invitations
for each row execute function public.team_sync_general_room_membership();

drop trigger if exists team_room_admin_user_sync on public.users;
create trigger team_room_admin_user_sync
after insert or update of role,banned,is_deactivated
on public.users
for each row execute function public.team_sync_general_room_membership();

revoke all on function public.team_sync_general_room_membership() from public,anon,authenticated;
