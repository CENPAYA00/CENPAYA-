import { d1Request } from './d1Api';

const LOGGABLE = ['view_post', 'search', 'view_listing', 'post_shared', 'logout'] as const;
export async function logActivity(action: (typeof LOGGABLE)[number], meta: { id?: string; query?: string; post_id?: string; to?: string } = {}) {
  let link = '/';
  if (action === 'view_post') link = `/post/${meta.id || meta.post_id || ''}`;
  else if (action === 'view_listing') link = `/listing/${meta.id || ''}`;
  else if (action === 'search') link = `/search?q=${encodeURIComponent(meta.query ?? '')}`;
  try { await d1Request('/api/activity', { method: 'POST', body: JSON.stringify({ action, meta, link }) }); }
  catch (error) { console.warn('Activity tracking failed', error); }
}
