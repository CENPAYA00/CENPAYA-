import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

export function useArchivedPosts() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return; }
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', me.id)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (postId: string) => {
    await supabase.from('posts').update({ archived_at: null }).eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const remove = async (postId: string) => {
    await supabase.from('posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return { posts, loading, restore, remove, refresh: load };
      }
