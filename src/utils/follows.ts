import { d1Request } from '../lib/d1Api';

export async function followUser(targetId: string) {
  if (!targetId) throw new Error('A target user is required');
  await d1Request('/api/profiles/' + encodeURIComponent(targetId) + '/follow', { method: 'POST' });
}
export async function unfollowUser(targetId: string) {
  await d1Request('/api/profiles/' + encodeURIComponent(targetId) + '/follow', { method: 'DELETE' });
}
export async function isFollowing(targetId: string): Promise<boolean> {
  const result = await d1Request<{ following: boolean }>('/api/profiles/' + encodeURIComponent(targetId) + '/follow-status');
  return !!result.following;
}
export async function getFollowerCount(userId: string): Promise<number> {
  const result = await d1Request<{ count: number }>('/api/profiles/' + encodeURIComponent(userId) + '/followers/count');
  return result.count || 0;
}
export async function getFollowingCount(userId: string): Promise<number> {
  const result = await d1Request<{ count: number }>('/api/profiles/' + encodeURIComponent(userId) + '/following/count');
  return result.count || 0;
}
