import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { getCachedUser, getCached, setCached } from '../lib/cache';
import FeedPostCard from '../components/FeedPostCard';

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const user = await getCachedUser();
      if (user) setUserId(user.id);

      const cached = getCached<any[]>('home_posts');
      if (cached) {
        setPosts(cached);
        setLoading(false);
      }
      await fetchPosts(user?.id);
    };
    init();
  }, []);

  const fetchPosts = async (currentUserId?: string) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((p: any) => p.user_id))];
      const { data: users } = await supabase
        .from('public_profiles')
        .select('id, username')
        .in('id', userIds);

      const usernameMap: Record<string, string> = {};
      (users || []).forEach((u: any) => { usernameMap[u.id] = u.username; });

      const enriched = data.map((p: any) => ({
        ...p,
        username: usernameMap[p.user_id] || 'User',
      }));

      setPosts(enriched);
      setCached('home_posts', enriched);

      if (currentUserId) {
        const postIds = data.map((p: any) => p.id);

        const [likesRes, savedRes] = await Promise.all([
          supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', postIds),
          supabase
            .from('saved_posts')
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', postIds),
        ]);

        setLikedPosts(new Set((likesRes.data || []).map((l: any) => l.post_id)));
        setSavedPosts(new Set((savedRes.data || []).map((s: any) => s.post_id)));
      }
    } else {
      setPosts([]);
    }
    if (error) console.error(error);
    setLoading(false);
  };

  const handleGlobalSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('posts')
      .select('id, content, user_id, created_at')
      .ilike('content', `%${q.trim()}%`)
      .eq('moderation_status', 'approved')
      .limit(10);
    setSearchResults(data || []);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return alert('Please log in to like posts.');
    const currentlyLiked = likedPosts.has(postId);

    setLikedPosts(prev => {
      const next = new Set(prev);
      currentlyLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) }
          : p
      )
    );

    if (currentlyLiked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    }
  };

  const handleSave = async (postId: string) => {
    if (!userId) return alert('Please log in to save posts.');
    const isSaved = savedPosts.has(postId);

    setSavedPosts(prev => {
      const next = new Set(prev);
      isSaved ? next.delete(postId) : next.add(postId);
      return next;
    });

    if (isSaved) {
      await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId);
    } else {
      await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
    }
  };

  const handleShare = async (postId: string) => {
    const url = `https://cenpaya.pages.dev/post/${postId}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: 'CenPaya post' }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    }
    await supabase.rpc('track_post_share', { p_post_id: postId, p_channel: 'external' }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleGlobalSearch(e.target.value)}
          placeholder="Search posts..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {searchResults.length > 0 && searchQuery.length >= 2 && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-darkcard rounded-xl shadow-lg mt-1 z-20 max-h-60 overflow-y-auto">
            {searchResults.map(r => (
              <div
                key={r.id}
                onClick={() => navigate(`/post/${r.id}`)}
                className="p-2.5 border-b border-gray-100 dark:border-darkline last:border-b-0 text-[10px] text-gray-700 dark:text-gray-200 cursor-pointer"
              >
                {r.content?.slice(0, 80)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-3">
        <h1 className="text-base font-bold text-navy dark:text-white">Home Feed</h1>
        <button
          onClick={() => navigate('/create-post')}
          className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={12} /> Create
        </button>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-5 rounded-2xl shadow-sm text-center">
          <p className="text-[11px] font-bold text-navy dark:text-white">No posts yet</p>
          <p className="text-[9px] text-gray-500 mt-1">Be the first to share something.</p>
        </div>
      )}

      {posts.map(post => (
        <FeedPostCard
          key={post.id}
          post={post}
          currentUserId={userId}
          isLiked={likedPosts.has(post.id)}
          isSaved={savedPosts.has(post.id)}
          onLike={() => handleLike(post.id)}
          onComment={() => navigate(`/post/${post.id}`)}
          onShare={() => handleShare(post.id)}
          onSave={() => handleSave(post.id)}
        />
      ))}
    </div>
  );
          }
