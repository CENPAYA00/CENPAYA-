import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Plus, Search } from 'lucide-react';
import { getCachedUser, getCached, setCached, clearCache } from '../lib/cache';

// ---------- Background registry (must match CreatePost + FeedPostCard) ----------
type Background = {
  id: string;
  label: string;
  bgClass: string;
  textClass: string;
  image?: string;
};

const BACKGROUNDS: Background[] = [
  { id: 'default',  label: 'White',        bgClass: 'bg-white',     textClass: 'text-gray-900' },
  { id: 'pink',     label: 'Vibrant Pink', bgClass: 'bg-[#E40046]', textClass: 'text-white'    },
  { id: 'charcoal', label: 'Deep Black',   bgClass: 'bg-[#1C1E21]', textClass: 'text-white'    },
  { id: 'blue',     label: 'Classic Blue', bgClass: 'bg-[#1877F2]', textClass: 'text-white'    },
  { id: 'maroon',   label: 'Maroon',       bgClass: 'bg-[#6B1426]', textClass: 'text-white'    },
  {
    id: 'purple-magenta',
    label: 'Purple to Magenta',
    bgClass: 'bg-gradient-to-br from-[#7F00FF] to-[#E100FF]',
    textClass: 'text-white',
  },
  {
    id: 'sunset',
    label: 'Sunset Pink to Yellow',
    bgClass: 'bg-gradient-to-tr from-[#FF416C] to-[#FF4B2B]',
    textClass: 'text-white',
  },
  {
    id: 'cyan-blue',
    label: 'Cyan to Blue',
    bgClass: 'bg-gradient-to-b from-[#00B4DB] to-[#0083B0]',
    textClass: 'text-white',
  },
  {
    id: 'space-nebula',
    label: 'Space Nebula',
    bgClass: 'bg-cover bg-center',
    textClass: 'text-white',
    image: '/themes/space-nebula.jpg',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    bgClass: 'bg-cover bg-center',
    textClass: 'text-white',
    image: '/themes/aurora.jpg',
  },
];

function getBackground(id: string | null | undefined): Background {
  if (!id) return BACKGROUNDS[0];
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

function backgroundStyle(bg: Background): React.CSSProperties {
  if (!bg.image) return {};
  return {
    backgroundImage: `url(${bg.image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
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
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', currentUserId)
          .in('post_id', data.map((p: any) => p.id));
        setLikedPosts(new Set((likes || []).map((l: any) => l.post_id)));
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

  const handleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!userId) return alert('Please log in to like posts.');
    const currentlyLiked = likedPosts.has(postId);

    setLikedPosts(prev => {
      const next = new Set(prev);
      currentlyLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts(prev =>
      prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) } : p)
    );

    if (currentlyLiked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const parseImages = (post: any): string[] => {
    if (!post.image_url) return [];
    if (Array.isArray(post.image_url)) return post.image_url;
    if (typeof post.image_url === 'string')
      return post.image_url.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [];
  };

  // NEW: is this post a colored / gradient / image-theme post?
  const isBackgroundPost = (post: any) =>
    post.post_type === 'colored' && !!post.bg_color && !post.image_url;

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-40 bg-gray-200 rounded-2xl animate-pulse"></div>
        <div className="h-40 bg-gray-200 rounded-2xl animate-pulse"></div>
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
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {searchResults.length > 0 && searchQuery.length >= 2 && (
          <div className="absolute top-full left-0 right-0 bg-white rounded-xl shadow-lg mt-1 z-20 max-h-60 overflow-y-auto">
            {searchResults.map(r => (
              <div
                key={r.id}
                onClick={() => navigate(`/post/${r.id}`)}
                className="p-2.5 border-b border-gray-100 last:border-b-0 text-[10px] text-gray-700 cursor-pointer"
              >
                {r.content?.slice(0, 80)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-3">
        <h1 className="text-base font-bold text-navy">Home Feed</h1>
        <button
          onClick={() => navigate('/create-post')}
          className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={12} /> Create
        </button>
      </div>

      {posts.length === 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm text-center">
          <p className="text-[11px] font-bold text-navy">No posts yet</p>
          <p className="text-[9px] text-gray-500 mt-1">Be the first to share something.</p>
        </div>
      )}

      {posts.map(post => {
        const isLiked = likedPosts.has(post.id);
        const images = parseImages(post);
        const isBg = isBackgroundPost(post);
        const bg = isBg ? getBackground(post.bg_color) : null;

        return (
          <div key={post.id} className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden animate-fade-in">
            <div className="p-3 flex items-center gap-2">
              <button onClick={() => navigate(`/seller/${post.user_id}`)} className="flex items-center gap-2">
                <div className="w-8 h-8 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-[11px]">
                  {post.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-navy">@{post.username}</p>
                  <p className="text-[9px] text-gray-400">{timeAgo(post.created_at)}</p>
                </div>
              </button>
            </div>

            <div onClick={() => navigate(`/post/${post.id}`)} className="cursor-pointer">
              {/* Colored / gradient / image-theme post */}
              {isBg && bg && (
                <div
                  style={backgroundStyle(bg)}
                  className={`${bg.bgClass} py-12 px-6 flex items-center justify-center min-h-[200px]`}
                >
                  <p
                    className={`text-lg font-bold ${bg.textClass} text-center whitespace-pre-wrap leading-relaxed max-w-md`}
                  >
                    {post.content}
                  </p>
                </div>
              )}

              {/* Regular text + image post */}
              {!isBg && post.content && (
                <p className="px-3 pb-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{post.content}</p>
              )}

              {!isBg && images.length === 1 && (
                <img src={images[0]} alt="" className="w-full h-auto bg-gray-100" loading="lazy" />
              )}
              {!isBg && images.length === 2 && (
                <div className="grid grid-cols-2 gap-0.5">
                  {images.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-40 object-cover bg-gray-100" loading="lazy" />
                  ))}
                </div>
              )}
              {!isBg && images.length === 3 && (
                <div className="grid grid-cols-3 gap-0.5">
                  {images.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-32 object-cover bg-gray-100" loading="lazy" />
                  ))}
                </div>
              )}
              {!isBg && images.length >= 4 && (
                <div className="grid grid-cols-2 gap-0.5">
                  <img src={images[0]} alt="" className="w-full h-40 object-cover bg-gray-100" loading="lazy" />
                  <div className="relative">
                    <img src={images[1]} alt="" className="w-full h-40 object-cover bg-gray-100" loading="lazy" />
                    {images.length > 2 && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-bold">
                        +{images.length - 1}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
              <button onClick={(e) => handleLike(e, post.id)} className={`flex items-center gap-1 text-[10px] ${isLiked ? 'text-red-500' : 'text-gray-500'}`}>
                <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                <span>{post.likes_count || 0}</span>
              </button>
              <button onClick={() => navigate(`/post/${post.id}`)} className="flex items-center gap-1 text-[10px] text-gray-500">
                <MessageCircle size={14} /><span>{post.comments_count || 0}</span>
              </button>
              <button className="flex items-center gap-1 text-[10px] text-gray-500"><Share2 size={14} /></button>
              <button className="flex items-center gap-1 text-[10px] text-gray-500"><Bookmark size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
