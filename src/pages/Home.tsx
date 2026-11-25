/* src/pages/Home.tsx */
import { useEffect, useState, useCallback } from 'react';
import { d1Request } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Play, Video } from 'lucide-react';
import { getCachedUser, getCached, setCached } from '../lib/cache';
import FeedPostCard from '../components/FeedPostCard';
import PullToRefresh from '../components/PullToRefresh';
import CommentsSheet from '../components/CommentsSheet';

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [videoPosts, setVideoPosts] = useState<any[]>([]);
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
      await Promise.all([fetchPosts(), fetchVideos()]);
    };
    init();
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      const { data } = await d1Request<{ data: any[] }>('/api/feed?limit=40');
      const feed = (data || []).map((post: any) => ({
        ...post,
        user_id: post.author_id,
        username: post.username || post.display_name || 'User',
        is_demo: false,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
      }));
      setPosts(feed);
      setCached('home_posts', feed);
      setFollowingIds(new Set(feed.filter((post: any) => post.is_following_author).map((post: any) => post.author_id)));
      setLikedPosts(new Set(feed.filter((post: any) => post.is_liked).map((post: any) => post.id)));
      setSavedPosts(new Set(feed.filter((post: any) => post.is_saved).map((post: any) => post.id)));
    } catch (error) {
      console.error('Could not load D1 home feed:', error);
      setPosts([]);
    }
    setLoading(false);
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const { data } = await d1Request<{ data: any[] }>('/api/reels?limit=8');
      setVideoPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      // Video publishing is feature-flagged; keep the regular feed available when disabled.
      setVideoPosts([]);
    }
  }, []);

  const handleRefresh = async () => {
    await Promise.all([fetchPosts(), fetchVideos()]);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return;
    const currentlyLiked = likedPosts.has(postId);
    setLikedPosts(prev => { const n = new Set(prev); currentlyLiked ? n.delete(postId) : n.add(postId); return n; });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) } : p));
    try {
      await d1Request(`/api/posts/${encodeURIComponent(postId)}/like`, { method: currentlyLiked ? 'DELETE' : 'POST' });
      if (!currentlyLiked) void d1Request('/api/feed/events', { method: 'POST', body: JSON.stringify({ post_id: postId, event_type: 'like', source: 'feed' }) }).catch(() => undefined);
    } catch (error: any) {
      setLikedPosts(prev => { const n = new Set(prev); currentlyLiked ? n.add(postId) : n.delete(postId); return n; });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (currentlyLiked ? 1 : -1)) } : p));
      alert(error.message || 'Could not update like');
    }
  };

  const handleSave = async (postId: string) => {
    if (!userId) return alert('Please log in to save posts.');
    const isSaved = savedPosts.has(postId);
    setSavedPosts(prev => { const n = new Set(prev); isSaved ? n.delete(postId) : n.add(postId); return n; });
    try {
      await d1Request(`/api/posts/${encodeURIComponent(postId)}/save`, { method: isSaved ? 'DELETE' : 'POST' });
      if (!isSaved) void d1Request('/api/feed/events', { method: 'POST', body: JSON.stringify({ post_id: postId, event_type: 'save', source: 'feed' }) }).catch(() => undefined);
    } catch (error: any) {
      setSavedPosts(prev => { const n = new Set(prev); isSaved ? n.add(postId) : n.delete(postId); return n; });
      alert(error.message || 'Could not update saved post');
    }
  };

  const handleShare = async (postId: string) => {
    const url = `https://cenpaya.pages.dev/post/${postId}`;
    if (navigator.share) { try { await navigator.share({ url, title: 'CenPaya post' }); } catch {} }
    else { await navigator.clipboard.writeText(url); alert('Link copied'); }
    try {
      await d1Request(`/api/posts/${encodeURIComponent(postId)}/share`, { method: 'POST', body: JSON.stringify({ channel: 'external' }) });
      void d1Request('/api/feed/events', { method: 'POST', body: JSON.stringify({ post_id: postId, event_type: 'share', source: 'feed' }) }).catch(() => undefined);
    } catch {}
  };

  const handleFollowToggle = async (authorId: string, isNowFollowing: boolean) => {
    if (!userId) return;
    if (isNowFollowing) {
      setFollowingIds(prev => new Set(prev).add(authorId));
    } else {
      setFollowingIds(prev => { const n = new Set(prev); n.delete(authorId); return n; });
    }
    setPosts(prev => prev.map(p => p.user_id === authorId ? { ...p, is_following_author: isNowFollowing } : p));
    setCached('home_posts', null);
  };

  const handleCommentAdded = (postId: string) => {
    void d1Request('/api/feed/events', { method: 'POST', body: JSON.stringify({ post_id: postId, event_type: 'comment', source: 'feed' }) }).catch(() => undefined);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
    setCached('home_posts', null);
  };

  const visible = posts.filter(p => showDemo || !p.is_demo);

  if (loading) {
    return (
      <div className="px-2 py-3 space-y-4">
        <div className="h-64 bg-gray-200 dark:bg-darkcard rounded-card animate-pulse" />
        <div className="h-64 bg-gray-200 dark:bg-darkcard rounded-card animate-pulse" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-2 pb-6">
        
        {/* Header without search bar */}
        <div className="flex justify-between items-center mb-3 px-2 mt-1">
          <h1 className="text-[16px] font-bold text-navy dark:text-white">Home Feed</h1>
          <button
            onClick={() => setShowDemo(v => !v)}
            className="text-[11px] font-semibold text-mute flex items-center gap-1 cursor-pointer"
          >
            {showDemo ? <><Eye size={13} /> Hide demo</> : <><EyeOff size={13} /> Show demo</>}
          </button>
        </div>

        {videoPosts.length > 0 && (
          <section className="mb-5" aria-label="Videos">
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-black text-white grid place-items-center"><Play size={15} fill="currentColor" /></span>
                <div>
                  <h2 className="text-[14px] font-extrabold text-navy dark:text-white">Videos</h2>
                  <p className="text-[10px] text-mute">Discover clips from the community</p>
                </div>
              </div>
              <button onClick={() => navigate('/reels')} className="text-[11px] font-bold text-brand">See all</button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto px-1 pb-2 snap-x snap-mandatory scrollbar-hide">
              {videoPosts.map((video: any) => (
                <button key={video.video_id} onClick={() => navigate('/reels?video=' + encodeURIComponent(video.video_id))}
                  className="relative shrink-0 w-[138px] h-[190px] rounded-2xl overflow-hidden bg-gradient-to-br from-[#102b22] via-[#174c38] to-[#07150f] text-left snap-start">
                  {video.thumbnail_url && <img src={video.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" />
                  <span className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white"><Play size={14} fill="currentColor" /></span>
                  <span className="absolute bottom-3 left-3 right-3 text-white">
                    <span className="block text-[11px] font-bold line-clamp-2">{video.content || 'Community video'}</span>
                    <span className="block text-[9px] text-white/75 mt-1">@{video.username || video.display_name || 'Cenpaya creator'}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 && (
          <div className="bg-white dark:bg-darkcard p-6 rounded-card shadow-soft text-center">
            <p className="text-[13px] font-bold text-navy dark:text-white">No posts yet</p>
            <p className="text-[11px] text-mute mt-1">Be the first to share something.</p>
          </div>
        )}

        {visible.map(post => (
          <FeedPostCard
            key={post.id}
            post={post}
            readOnly={false}
            currentUserId={userId}
            isLiked={likedPosts.has(post.id)}
            isSaved={savedPosts.has(post.id)}
            onLike={() => handleLike(post.id)}
            onComment={() => setOpenPost(post.id)}
            onShare={() => handleShare(post.id)}
            onSave={() => handleSave(post.id)}
            onFollowToggle={(nowFollowing) => handleFollowToggle(post.user_id, nowFollowing)}
          />
        ))}
      </div>

      <CommentsSheet
        postId={openPost}
        me={userId}
        onClose={() => setOpenPost(null)}
        onCommentAdded={handleCommentAdded}
      />
    </PullToRefresh>
  );
  }
