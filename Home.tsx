import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle } from 'lucide-react';
import { FeedPost } from '../types/FeedPost';
import { togglePostLike, getLikesForPosts } from '../utils/postLikes';

export default function Home() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      await fetchPosts(user?.id);
    };
    init();
  }, []);

  const fetchPosts = async (currentUserId?: string) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('moderation_status', 'approved')
      .order('boosted_until', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setPosts(data as FeedPost[]);
      if (currentUserId) {
        const liked = await getLikesForPosts(data.map((p: any) => p.id), currentUserId);
        setLikedPosts(liked);
      }
    }
    if (error) console.error('Error:', error);
    setLoading(false);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return alert('Please log in to like posts.');

    const currentlyLiked = likedPosts.has(postId);

    // Optimistic update
    setLikedPosts(prev => {
      const next = new Set(prev);
      currentlyLiked ? next.delete(postId) : next.add(postId);
      return next;
    });

    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? { ...p, likes_count: p.likes_count + (currentlyLiked ? -1 : 1) }
          : p
      )
    );

    // Update database
    const success = await togglePostLike(postId, userId, currentlyLiked);
    if (!success) {
      // Revert on error
      setLikedPosts(prev => {
        const next = new Set(prev);
        currentlyLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
    }
  };

  if (loading) return <div className="p-4 text-center">Loading feed...</div>;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-navy">Home Feed</h1>
        <button
          onClick={() => navigate('/create-post')}
          className="bg-navy text-white text-sm font-bold px-3 py-2 rounded-xl"
        >
          + Create
        </button>
      </div>

      {posts.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center text-gray-500">
          No posts yet. Be the first to share something!
        </div>
      )}

      {posts.map(post => {
        const isLiked = likedPosts.has(post.id);

        return (
          <div key={post.id} className="bg-white p-4 rounded-2xl shadow-sm mb-4">
            <p className="font-bold text-navy mb-2">
              @{post.user_id?.slice(0, 6) || 'User'}
            </p>
            <p className="text-gray-800 mb-3">{post.content}</p>

            {post.image_url && (
              <img
                src={post.image_url}
                alt=""
                className="w-full rounded-xl mb-3 max-h-64 object-cover"
              />
            )}

            <div className="flex gap-4 text-gray-500 text-sm">
              <button
                onClick={() => handleLike(post.id)}
                className={`flex items-center gap-1 ${isLiked ? 'text-red-500' : ''}`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                {post.likes_count || 0}
              </button>
              <button
                onClick={() => navigate('/chat')}
                className="flex items-center gap-1"
              >
                <MessageCircle size={18} />
                {post.comments_count || 0}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}