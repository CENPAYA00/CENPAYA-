-- Internal helpers and trigger functions must never be callable through the public Data API.
revoke all on function public.is_active_team_member(uuid) from public, anon, authenticated;
revoke all on function public.engineering_sync_general_room_member() from public, anon, authenticated;
