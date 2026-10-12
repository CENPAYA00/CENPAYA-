import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

export default function Saved() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_id, saved_at')
        .eq('user_id', me.id)
        .order('saved_at', { ascending: false });

      if (!saved || saved.length === 0) { setLoading(false); return; }

      const ids = saved.map((s: any) => s.post_id);
      const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .in('id', ids);

      if (!posts) { setLoading(false); return; }

      const order = new Map(ids.map((id: string, i: number) => [id, i]));
      posts.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

      setPosts(posts);

      const sellerIds = [...new Set(posts.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username')
        .in('id', sellerIds);

      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.username; });
      setAuthors(map);
      setLoading(false);
    };
    load();
  }, []);

  const unsave = async (postId: string) => {
    const me = await getCachedUser();
    if (!me) return;
    await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me.id);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('saved')}</h1>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Bookmark size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No saved posts</p>
          <p className="text-[9px] text-gray-500 mt-1">Tap Save on any post to keep it here.</p>
        </div>
      )}

      {posts.map(p => (
        <div key={p.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
          <button onClick={() => navigate(`/post/${p.id}`)} className="w-full text-left">
            <p className="p-3 text-[10px] font-bold text-accent">@{authors[p.user_id] || 'User'}</p>
            {p.content && (
              <p className="px-3 pb-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{p.content}</p>
            )}
            {p.image_url && (
              <img src={p.image_url.split(',')[0]} alt="" className="w-full h-auto bg-gray-100" />
            )}
          </button>
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-darkline">
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <Heart size={11} /> {p.likes_count || 0}
            </span>
            <button
              onClick={() => unsave(p.id)}
              className="text-[10px] font-bold text-red-500 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20"
            >
              {t('unsave_post')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
                            }
