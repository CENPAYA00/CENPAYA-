import { supabase } from '../lib/supabase';

export async function followUser(targetId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('user_follows').insert({ follower_id: user.id, following_id: targetId });
  if (error) throw error;
}

export async function unfollowUser(targetId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
}

export async function isFollowing(targetId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('user_follows').select('id').eq('follower_id', user.id).eq('following_id', targetId).maybeSingle();
  return !!data;
}

export async function getFollowerCount(userId: string): Promise<number> {
  const { count } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
  return count || 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { count } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
  return count || 0;
}
