-- Helper and trigger functions are internal implementation details, not browser RPCs.
revoke all on function public.is_active_team_member(uuid) from public, anon, authenticated;
revoke all on function public.notify_team_message() from public, anon, authenticated;
revoke all on function public.notify_team_task_update() from public, anon, authenticated;
revoke all on function public.notify_team_escalation() from public, anon, authenticated;
