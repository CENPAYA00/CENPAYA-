import { d1Request } from '../lib/d1Api';

export async function hasLikedPost(postId: string, _userId: string): Promise<boolean> {
  const result = await d1Request<{ liked: boolean }>(`/api/posts/${encodeURIComponent(postId)}/my-state`);
  return !!result.liked;
}
export async function togglePostLike(postId: string, _userId: string, currentlyLiked: boolean): Promise<boolean> {
  try { await d1Request(`/api/posts/${encodeURIComponent(postId)}/like`, { method: currentlyLiked ? 'DELETE' : 'POST' }); return true; }
  catch { return false; }
}
export async function getLikesForPosts(postIds: string[], _userId: string): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const result = await d1Request<{ data: string[] }>('/api/posts/my-likes?ids=' + encodeURIComponent(postIds.join(',')));
  return new Set(result.data || []);
}
