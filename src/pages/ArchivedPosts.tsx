import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import FeedPostCard from '../components/FeedPostCard';
import { notify } from '../lib/notify';

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      // 1. Fetch archived posts
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', me.id)
        .not('archived_at', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        notify.fromError(error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // 2. Fetch author details for the FeedPostCard
      const sellerIds = [...new Set(data.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url')
        .in('id', sellerIds);

      const map: Record<string, any> = {};
      (profiles || []).forEach(p => { map[p.id] = p; });

      // 3. Attach the author data to the posts
      const enriched = data.map((p: any) => ({
        ...p,
        username: map[p.user_id]?.username || 'User',
        avatar_url: map[p.user_id]?.avatar_url || null,
      }));

      setPosts(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const restore = async (id: string) => {
    const { error } = await supabase.from('posts').update({ archived_at: null }).eq('id', id);
    if (error) notify.fromError(error);
    else {
      setPosts(prev => prev.filter(p => p.id !== id));
      notify.success('Post restored');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete permanently?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) notify.fromError(error);
    else {
      setPosts(prev => prev.filter(p => p.id !== id));
      notify.success('Post deleted permanently');
    }
  };

  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading archive...</div>;

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">Archived Posts</h1>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline">
          <Archive size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No archived posts</p>
        </div>
      )}

      {posts.map((post) => (
        <div key={post.id} className="mb-6">
          {/* This is Claude's exact readOnly extraction. It WILL render the image. */}
          <FeedPostCard post={post} readOnly={true} />
          
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => restore(post.id)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-[#12935a] bg-[#12935a]/10 px-3 py-1.5 rounded-lg active:scale-95 cursor-pointer"
            >
              <RotateCcw size={14} /> Restore
            </button>
            <button
              onClick={() => remove(post.id)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg active:scale-95 cursor-pointer"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
        }
