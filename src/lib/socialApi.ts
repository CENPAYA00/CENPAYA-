import { d1Request } from './d1Api';

export const api = {
  getFeed: async (limit = 20, offset = 0) => {
    const result = await d1Request<{ data: any[] }>(`/api/feed?limit=${limit}&offset=${offset}`);
    return result.data ?? [];
  },
  toggleSave: async (postId: string) => {
    const state = await d1Request<{ saved: boolean }>(`/api/posts/${encodeURIComponent(postId)}/my-state`);
    return d1Request(`/api/posts/${encodeURIComponent(postId)}/save`, { method: state.saved ? 'DELETE' : 'POST' });
  },
  trackShare: async (postId: string, channel = 'external') => {
    try { await d1Request(`/api/posts/${encodeURIComponent(postId)}/share`, { method: 'POST', body: JSON.stringify({ channel }) }); }
    catch (error) { console.warn('share tracking failed', error); }
  },
};
