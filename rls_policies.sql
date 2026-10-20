-- Row Level Security policies for Supabase tables

-- ============================================================
-- 1. users table
-- Only allow users to read their own row; admins can read all.
-- ============================================================
create policy "users_read_own" on public.users
    for select using (auth.uid() = id);

create policy "users_update_own" on public.users
    for update using (auth.uid() = id);

-- Admins/owners can read all users (optional, if needed)
-- create policy "users_read_all" on public.users
--     for select using (has_role('super_admin') or has_role('owner') or has_role('support_agent'));

-- ============================================================
-- 2. chat_messages_stream table
-- Users can only read messages from channels they participate in.
-- A user is a participant if they have a row in public.chat_participants for that channel.
-- ============================================================
create policy "chat_messages_stream_read_own_participation" on public.chat_messages_stream
    for select using (
        exists (
            select 1 from public.chat_participants
            where channel_id = chat_messages_stream.channel_id
            and user_id = auth.uid()
        )
    );

-- ============================================================
-- 3. notifications table
-- Users can only read their own notifications.
-- ============================================================
create policy "notifications_read_own" on public.notifications
    for select using (auth.uid() = user_id);

create policy "notifications_insert_own" on public.notifications
    for insert with check (auth.uid() = user_id);

-- ============================================================
-- 4. Additional: chat_participants (ensure users can only manage their own participation)
-- ============================================================
create policy "chat_participants_read_own" on public.chat_participants
    for select using (user_id = auth.uid());

create policy "chat_participants_insert_own" on public.chat_participants
    for insert with check (user_id = auth.uid());

create policy "chat_participants_delete_own" on public.chat_participants
    for delete using (user_id = auth.uid());