import { supabase } from './supabase';

const LOGGABLE = ['view_post', 'search', 'view_listing'] as const;

export async function logActivity(
  action: (typeof LOGGABLE)[number],
  meta: { id?: string; query?: string }
) {
  const link =
    action === 'view_post' ? `/post/${meta.id}` :
    action === 'view_listing' ? `/listing/${meta.id}` :
    `/search?q=${encodeURIComponent(meta.query ?? '')}`;
    
  await supabase.from('activity_log').insert({ action, meta, link });
}
