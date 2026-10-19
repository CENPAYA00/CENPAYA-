import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { notify } from '../lib/notify'; // CHANGED TO NOTIFY

export function useArchivedPosts() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return; }

    const { data: archived, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', me.id)
      .not('archived_at', 'is', null)
      .order('created_at', { ascending: false });

    // EXACT CLAUDE ERROR HANDLING
    if (error) { 
      notify.fromError(error); 
      setLoading(false); 
      return; 
    }

    if (!archived || archived.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const sellerIds = [...new Set(archived.map((p: any) => p.user_id))];
    const { data: profiles, error: profError } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url')
      .in('id', sellerIds);

    if (profError) notify.fromError(profError);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

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
    if (error) {
      notify.fromError(error);
    } else {
      setPosts(prev => prev.filter(p => p.id !== id));
      notify.success('Post restored successfully');
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
      notify.fromError(error);
    } else {
      setPosts(prev => prev.filter(p => p.id !== id));
      notify.success('Post deleted permanently');
    }
  };

  return { posts, loading, restore, remove };
      }
