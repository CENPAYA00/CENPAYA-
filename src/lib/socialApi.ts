import { supabase } from './supabase';

export const api = {
  getFeed: async (limit = 20, offset = 0) => {
    const { data, error } = await supabase.rpc('get_feed', { p_limit: limit, p_offset: offset });
    if (error) throw error;
    return data?.feed ?? [];
  },
  toggleSave: async (postId: string) => {
    const { data, error } = await supabase.rpc('toggle_save_post', { p_post_id: postId });
    if (error) throw error;
    return data;
  },
  trackShare: async (postId: string, channel = 'external') => {
    const { error } = await supabase.rpc('track_post_share', {
      p_post_id: postId,
      p_channel: channel,
    });
    if (error) console.warn('share track failed', error);
  },
};
