import { supabase } from './supabase';

const LOGGABLE = ['view_post', 'search', 'view_listing', 'post_shared', 'logout'] as const;

export async function logActivity(
  action: (typeof LOGGABLE)[number],
  meta: { id?: string; query?: string; post_id?: string; to?: string } = {}
) {
  let link = '/';
  if (action === 'view_post') link = `/post/${meta.id || meta.post_id || ''}`;
  else if (action === 'view_listing') link = `/listing/${meta.id || ''}`;
  else if (action === 'search') link = `/search?q=${encodeURIComponent(meta.query ?? '')}`;
  
  await supabase.from('activity_log').insert({ action, meta, link });
}
