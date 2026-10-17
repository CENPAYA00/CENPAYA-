import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, EyeOff } from 'lucide-react';
import { getCachedUser, getCached, setCached } from '../lib/cache';
import FeedPostCard from '../components/FeedPostCard';
import PullToRefresh from '../components/PullToRefresh';

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
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

  const fetchPosts = useCallback(async (currentUserId?: string) => {
    const { data } = await supabase.rpc('get_home_feed', { p_limit: 40, p_offset: 0 });

    let feed: any[] = [];
    if (data?.ok && Array.isArray(data.feed)) feed = data.feed;
    else {
      const { data: raw } = await supabase
        .from('posts')
        .select('*')
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(40);
      feed = raw || [];
    }

    if (feed.length > 0) {
      const userIds = [...new Set(feed.map((p: any) => p.user_id))];
      
      const [usersRes, followsRes, likesRes, savedRes] = await Promise.all([
        supabase.from('public_profiles').select('id, username').in('id', userIds),
        currentUserId ? supabase.from('user_follows').select('followed_id').eq('follower_id', currentUserId) : Promise.resolve({ data: [] }),
        currentUserId ? supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', feed.map(p => p.id)) : Promise.resolve({ data: [] }),
        currentUserId ? supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', feed.map(p => p.id)) : Promise.resolve({ data: [] }),
      ]);

      // Map usernames
      const usernameMap: Record<string, string> = {};
      (usersRes.data || []).forEach((u: any) => { usernameMap[u.id] = u.username; });

      // Map followed IDs
      const followedSet = new Set((followsRes.data || []).map((f: any) => f.followed_id));
      setFollowingIds(followedSet);

      const enriched = feed.map((p: any) => ({ 
        ...p, 
        username: usernameMap[p.user_id] || 'User',
        is_following_author: followedSet.has(p.user_id)
      }));
      
      setPosts(enriched);
      setCached('home_posts', enriched);

      if (currentUserId) {
        setLikedPosts(new Set((likesRes.data || []).map((l: any) => l.post_id)));
        setSavedPosts(new Set((savedRes.data || []).map((s: any) => s.post_id)));
      }
    } else setPosts([]);
    setLoading(false);
  }, []);

  // ... (keep your demo toast useEffect and handleRefresh, handleLike, handleSave, handleShare as they are) ...

  const handleRefresh = async () => {
    await fetchPosts(userId || undefined);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return alert('Please log in to like posts.');
    const currentlyLiked = likedPosts.has(postId);
    setLikedPosts(prev => { const n = new Set(prev); currentlyLiked ? n.delete(postId) : n.add(postId); return n; });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) } : p));
    if (currentlyLiked) await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    else await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  };

  const handleSave = async (postId: string) => {
    if (!userId) return alert('Please log in to save posts.');
    const isSaved = savedPosts.has(postId);
    setSavedPosts(prev => { const n = new Set(prev); isSaved ? n.delete(postId) : n.add(postId); return n; });
    if (isSaved) await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId);
    else await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
  };

  const handleShare = async (postId: string) => {
    const url = `https://cenpaya.pages.dev/post/${postId}`;
    if (navigator.share) { try { await navigator.share({ url, title: 'CenPaya post' }); } catch {} }
    else { await navigator.clipboard.writeText(url); alert('Link copied'); }
    try { await supabase.rpc('track_post_share', { p_post_id: postId, p_channel: 'external' }); } catch {}
  };

  // Handle follow/unfollow directly from the home feed
  const handleFollowToggle = async (authorId: string, isNowFollowing: boolean) => {
    if (!userId) return;
    if (isNowFollowing) {
      setFollowingIds(prev => new Set(prev).add(authorId));
    } else {
      setFollowingIds(prev => { const n = new Set(prev); n.delete(authorId); return n; });
    }
    // Update the posts array so the UI reflects the change immediately
    setPosts(prev => prev.map(p => p.user_id === authorId ? { ...p, is_following_author: isNowFollowing } : p));
  };

  const visible = posts.filter(p => showDemo || !p.is_demo);

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
        <div className="h-40 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-3 py-3 pb-24">
        <button
          onClick={() => navigate('/search?context=home')}
          className="w-full flex items-center gap-2 pl-3 pr-3 py-2.5 mb-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-xs text-gray-400 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-darkbg"
        >
          <Search size={14} className="text-gray-400 shrink-0" />
          <span className="flex-1">Search posts, people...</span>
        </button>

        <div className="flex justify-between items-center mb-3">
          <h1 className="text-base font-bold text-navy dark:text-white">Home Feed</h1>
          <button
            onClick={() => setShowDemo(v => !v)}
            className="text-[10px] font-bold text-gray-500 flex items-center gap-1 cursor-pointer"
          >
            {showDemo ? <><Eye size={12} /> Hide demo</> : <><EyeOff size={12} /> Show demo</>}
          </button>
        </div>

        {visible.length === 0 && (
          <div className="bg-white dark:bg-darkcard p-5 rounded-2xl shadow-sm text-center">
            <p className="text-[11px] font-bold text-navy dark:text-white">No posts yet</p>
            <p className="text-[9px] text-gray-500 mt-1">Be the first to share something.</p>
          </div>
        )}

        {visible.map(post => (
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
            onFollowToggle={(nowFollowing) => handleFollowToggle(post.user_id, nowFollowing)}
          />
        ))}
      </div>
    </PullToRefresh>
  );
}
