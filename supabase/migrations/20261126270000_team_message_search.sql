-- Searchable, membership-scoped internal communication history.

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
grant execute on function public.team_search_messages(text,integer) to authenticated;
