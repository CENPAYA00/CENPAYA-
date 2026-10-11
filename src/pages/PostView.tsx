import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Heart, MessageCircle, Share2 } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function PostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      const { data } = await supabase
        .from('posts')
        .select('*, profiles(username, avatar_url)')
        .eq('id', id)
        .single();
      setPost(data);

      if (u && data) {
        const { data: like } = await supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', id)
          .eq('user_id', u.id)
          .maybeSingle();
        setLiked(!!like);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const toggleLike = async () => {
    const u = await getCachedUser();
    if (!u || !post) return;

    if (liked) {
      await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', u.id);
      setPost({ ...post, likes_count: (post.likes_count || 1) - 1 });
    } else {
      await supabase
        .from('post_likes')
        .insert({ post_id: post.id, user_id: u.id });
      setPost({ ...post, likes_count: (post.likes_count || 0) + 1 });
    }
    setLiked(!liked);
  };

  if (loading)
    return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!post)
    return <div className="p-4 text-center text-xs">Post not found.</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand p-1">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-semibold flex-1">Post</h1>
      </div>

      <div className="flex items-center gap-2 mb-2">
        {post.profiles?.avatar_url && (
          <img
            src={post.profiles.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        )}
        <span className="text-xs font-medium">
          {post.profiles?.username || 'Unknown'}
        </span>
      </div>

      {post.image_url && (
        <img
          src={post.image_url}
          alt=""
          className="w-full rounded-lg mb-2 object-cover"
        />
      )}

      {post.caption && (
        <p className="text-xs text-gray-800 mb-3">{post.caption}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-600">
        <button
          onClick={toggleLike}
          className={`flex items-center gap-1 ${liked ? 'text-red-500' : ''}`}
        >
          <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
          {post.likes_count || 0}
        </button>
        <span className="flex items-center gap-1">
          <MessageCircle size={14} />
          {post.comments_count || 0}
        </span>
        <button className="flex items-center gap-1">
          <Share2 size={14} />
          Share
        </button>
      </div>
    </div>
  );
        }
