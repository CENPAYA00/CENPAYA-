import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';
import FeedPostCard from '../components/FeedPostCard';

export default function Saved() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      setUserId(me.id);

      const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_id, saved_at')
        .eq('user_id', me.id)
        .order('saved_at', { ascending: false });

      if (!saved || saved.length === 0) { setLoading(false); return; }

      const ids = saved.map((s: any) => s.post_id);
      const { data: fetchedPosts } = await supabase
        .from('posts')
        .select('*')
        .in('id', ids);

      if (!fetchedPosts) { setLoading(false); return; }

      // Sort posts to match the saved_at order
      const order = new Map(ids.map((id: string, i: number) => [id, i]));
      fetchedPosts.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

      // Fetch authors
      const sellerIds = [...new Set(fetchedPosts.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url')
        .in('id', sellerIds);

      const authorMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { authorMap[p.id] = p; });

      // Enrich posts with author data so FeedPostCard renders correctly
      const enrichedPosts = fetchedPosts.map((p: any) => ({
        ...p,
        username: authorMap[p.user_id]?.username || 'User',
        avatar_url: authorMap[p.user_id]?.avatar_url || null,
      }));

      setPosts(enrichedPosts);
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

  if (loading) return <div className="p-4 text-center text-xs text-mute">{t('loading')}</div>;

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">{t('saved')}</h1>
        <span className="text-[12px] font-bold text-mute ml-auto bg-gray-100 dark:bg-darkline px-2.5 py-1 rounded-full">
          {posts.length}
        </span>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline">
          <Bookmark size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No saved posts</p>
          <p className="text-[13px] text-mute mt-1">Tap Save on any post to keep it here.</p>
        </div>
      )}

      {posts.map(p => (
        <FeedPostCard
          key={p.id}
          post={p}
          currentUserId={userId}
          isLiked={false} // Optional: fetch real like state if needed
          isSaved={true}
          onLike={() => {}} // You can add handleLike here if you want
          onComment={() => navigate(`/post/${p.id}`)}
          onShare={() => {}}
          onSave={() => unsave(p.id)} // Clicking Save again will unsave it
        />
      ))}
    </div>
  );
        }
