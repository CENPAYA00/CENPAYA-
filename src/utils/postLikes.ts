import { supabase } from '../lib/supabase';

export async function hasLikedPost(
  postId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!data;
}

export async function togglePostLike(
  postId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<boolean> {
  if (currentlyLiked) {
    // Unlike
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    return !error;
  } else {
    // Like
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });
    return !error;
  }
}

export async function getLikesForPosts(
  postIds: string[],
  userId: string
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  return new Set((data || []).map((l: any) => l.post_id));
    }
