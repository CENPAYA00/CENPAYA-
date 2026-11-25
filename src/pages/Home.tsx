/* src/pages/Home.tsx */
import { useEffect, useState, useCallback } from 'react';
import { d1Request } from '../lib/d1Api';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Search, Film } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'posts' | 'videos'>('posts');
  const [videos, setVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosLoaded, setVideosLoaded] = useState(false);
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
      await fetchPosts();
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

  const handleRefresh = async () => {
    if (activeTab === 'videos') {
      setVideosLoading(true);
      try { const result = await d1Request<{data:any[]}>('/api/reels?limit=12'); setVideos(result.data || []); setVideosLoaded(true); }
      catch (error) { console.error('Could not refresh videos:', error); }
      finally { setVideosLoading(false); }
      return;
    }
    await fetchPosts();
  };

  useEffect(() => {
    if (activeTab !== 'videos' || videosLoaded) return;
    let cancelled = false;
    setVideosLoading(true);
    d1Request<{data:any[]}>('/api/reels?limit=12')
      .then(result => { if (!cancelled) { setVideos(result.data || []); setVideosLoaded(true); } })
      .catch(error => { if (!cancelled) { console.error('Could not load videos:', error); setVideosLoaded(true); } })
      .finally(() => { if (!cancelled) setVideosLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, videosLoaded]);

  const handleLike = async (postId: string) => {
    if (!userId) return;
    const currentlyLiked = likedPosts.has(postId);
    setLikedPosts(prev => { const n = new Set(prev); currentlyLiked ? n.delete(postId) : n.add(postId); return n; });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) } : p));
    try { await d1Request(`/api/posts/${encodeURIComponent(postId)}/like`, { method: currentlyLiked ? 'DELETE' : 'POST' }); }
    catch (error: any) { alert(error.message || 'Could not update like'); }
  };

  const handleSave = async (postId: string) => {
    if (!userId) return alert('Please log in to save posts.');
    const isSaved = savedPosts.has(postId);
    setSavedPosts(prev => { const n = new Set(prev); isSaved ? n.delete(postId) : n.add(postId); return n; });
    try { await d1Request(`/api/posts/${encodeURIComponent(postId)}/save`, { method: isSaved ? 'DELETE' : 'POST' }); }
    catch (error: any) { alert(error.message || 'Could not update saved post'); }
  };

  const handleShare = async (postId: string) => {
    const url = `https://cenpaya.pages.dev/post/${postId}`;
    if (navigator.share) { try { await navigator.share({ url, title: 'CenPaya post' }); } catch {} }
    else { await navigator.clipboard.writeText(url); alert('Link copied'); }
    try { await d1Request(`/api/posts/${encodeURIComponent(postId)}/share`, { method: 'POST', body: JSON.stringify({ channel: 'external' }) }); } catch {}
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
          <h1 className="text-[16px] font-bold text-navy dark:text-white">Home</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/search?context=home')} aria-label="Search CenPaya" className="w-9 h-9 rounded-full bg-white dark:bg-darkcard text-navy dark:text-white flex items-center justify-center shadow-sm"><Search size={17}/></button>
            <button
            onClick={() => setShowDemo(v => !v)}
            className="text-[11px] font-semibold text-mute flex items-center gap-1 cursor-pointer"
          >
            {showDemo ? <><Eye size={13} /> Hide demo</> : <><EyeOff size={13} /> Show demo</>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 px-1">
          <button onClick={() => setActiveTab('posts')} className={`rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'posts' ? 'bg-accent text-white' : 'bg-white dark:bg-darkcard text-gray-500'}`}><Eye size={14}/> Posts</button>
          <button onClick={() => setActiveTab('videos')} className={`rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'videos' ? 'bg-accent text-white' : 'bg-white dark:bg-darkcard text-gray-500'}`}><Film size={14}/> Videos</button>
        </div>

        {activeTab === 'posts' && visible.length === 0 && (
          <div className="bg-white dark:bg-darkcard p-6 rounded-card shadow-soft text-center">
            <p className="text-[13px] font-bold text-navy dark:text-white">No posts yet</p>
            <p className="text-[11px] text-mute mt-1">Be the first to share something.</p>
          </div>
        )}

        {activeTab === 'posts' && visible.map(post => (
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

        {activeTab === 'videos' && (videosLoading ? (
          <div className="py-10 text-center text-xs text-gray-500">Loading videos…</div>
        ) : videos.length === 0 ? (
          <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center"><Film size={28} className="mx-auto text-gray-400 mb-2"/><p className="text-xs font-bold text-navy dark:text-white">No videos yet</p><p className="text-[10px] text-gray-500 mt-1">Published videos will appear here.</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {videos.map(video => <button key={video.video_id} onClick={() => navigate('/reels')} className="relative text-left overflow-hidden rounded-2xl bg-gradient-to-br from-[#092f21] via-[#17613f] to-[#07150f] min-h-48 p-3 flex flex-col justify-between text-white">
              <span className="self-center my-7 w-12 h-12 rounded-full bg-white/20 flex items-center justify-center"><Play size={22} fill="currentColor"/></span>
              <span className="text-[11px] font-bold line-clamp-2">{video.content || 'Watch video'}</span>
              <span className="text-[9px] opacity-80">@{video.username || video.display_name || 'CenPaya user'}</span>
            </button>)}
          </div>
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
