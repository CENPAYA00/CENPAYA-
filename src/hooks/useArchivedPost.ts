import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

export function useArchivedPosts() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return; }

    // 1. Fetch archived posts
    const { data: archived } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', me.id)
      .not('archived_at', 'is', null)
      .order('created_at', { ascending: false });

    if (!archived || archived.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    // 2. Fetch author profiles (needed for the FeedPostCard header)
    const sellerIds = [...new Set(archived.map((p: any) => p.user_id))];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url')
      .in('id', sellerIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    // 3. Enrich posts with author data so FeedPostCard renders fully
    const enriched = archived.map((p: any) => ({
      ...p,
      username: profileMap[p.user_id]?.username || 'User',
      avatar_url: profileMap[p.user_id]?.avatar_url || null,
    }));

    setPosts(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (id: string) => {
    const { error } = await supabase.from('posts').update({ archived_at: null }).eq('id', id);
    if (!error) setPosts(prev => prev.filter(p => p.id !== id));
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (!error) setPosts(prev => prev.filter(p => p.id !== id));
  };

  return { posts, loading, restore, remove };
        }
