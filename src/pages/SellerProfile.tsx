import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, UserPlus, MessageCircle, Star } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import FeedPostCard from '../components/FeedPostCard';

export default function SellerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Fetch from public_profiles
      const { data } = await supabase
        .from('public_profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      setProfile(data);

      if (data) {
        const { data: userPosts } = await supabase
          .from('posts')
          .select('*')
          .eq('user_id', id)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(20);
        
        // Attach username to posts
        const enriched = (userPosts || []).map(p => ({ ...p, username: data.username }));
        setPosts(enriched);
      }

      if (user?.id) {
        const { data: follow } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('followed_id', id)
          .maybeSingle();
        setIsFollowing(!!follow);
      }

      setLoading(false);
    };
    load();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUserId || !id) return;
    if (currentUserId === id) return alert("You can't follow yourself.");

    if (isFollowing) {
      await supabase.from('user_follows').delete().eq('follower_id', currentUserId).eq('followed_id', id);
      setIsFollowing(false);
      setProfile((p: any) => p ? { ...p, followers_count: Math.max(0, (p.followers_count || 1) - 1) } : p);
    } else {
      await supabase.from('user_follows').insert({ follower_id: currentUserId, followed_id: id });
      setIsFollowing(true);
      setProfile((p: any) => p ? { ...p, followers_count: (p.followers_count || 0) + 1 } : p);
    }
  };

  const handleChat = async () => {
    if (!currentUserId || !id) return;
    if (currentUserId === id) return alert("You can't chat with yourself.");

    setStartingChat(true);
    try {
      // Check if channel exists
      const { data: existing } = await supabase
        .from('chat_participants')
        .select('channel_id')
        .eq('user_id', currentUserId);

      if (existing && existing.length > 0) {
        const ids = existing.map((e: any) => e.channel_id);
        const { data: match } = await supabase
          .from('chat_participants')
          .select('channel_id')
          .in('channel_id', ids)
          .eq('user_id', id)
          .maybeSingle();
        if (match?.channel_id) return navigate(`/chat/${match.channel_id}`);
      }

      // Create new
      const { data: channel, error: chErr } = await supabase
        .from('chat_channels')
        .insert({ channel_type: 'P2P_MARKETPLACE' })
        .select()
        .single();
      
      if (chErr || !channel) throw new Error('Could not create channel');

      await supabase.from('chat_participants').insert([
        { channel_id: channel.id, user_id: currentUserId },
        { channel_id: channel.id, user_id: id },
      ]);
      navigate(`/chat/${channel.id}`);
    } catch (e: any) {
      alert(e.message || 'Could not start chat');
    } finally {
      setStartingChat(false);
    }
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;
  if (!profile) return <div className="p-4 text-center text-xs">{t('no_results')}</div>;

  return (
    <div className="pb-24">
      <div className="h-28 bg-gradient-to-r from-brand to-brand-dark" />

      <div className="px-4 -mt-10">
        <div className="flex items-end gap-3">
          <div className="w-20 h-20 rounded-full border-4 border-white dark:border-darkcard bg-accent flex items-center justify-center text-white font-black text-2xl">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-20 h-20 rounded-full object-cover" /> : profile.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 pb-2">
            <button onClick={() => navigate(-1)} className="text-navy dark:text-white text-[10px] font-bold">
              <ArrowLeft size={14} />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-base font-bold text-navy dark:text-white">@{profile.username}</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {t('member_since')} {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex gap-4 mt-3 text-[11px]">
          <div>
            <strong className="text-navy dark:text-white">{profile.followers_count || 0}</strong>{' '}
            <span className="text-gray-500">{t('followers')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Star size={11} className="text-gold" fill="currentColor" />
            <strong className="text-navy dark:text-white">{profile.reputation_score || 0}</strong>
          </div>
        </div>
      </div>

      {currentUserId !== profile.id && (
        <div className="flex gap-2 px-3 mt-4">
          <button
            onClick={handleFollow}
            className={`flex-1 py-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
              isFollowing ? 'bg-gray-200 dark:bg-darkline text-navy dark:text-white' : 'bg-navy text-white'
            }`}
          >
            <UserPlus size={14} />
            {isFollowing ? t('unfollow') : t('follow')}
          </button>
          <button
            onClick={handleChat}
            disabled={startingChat}
            className="flex-1 bg-accent text-white py-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <MessageCircle size={14} /> {startingChat ? '...' : t('chat')}
          </button>
        </div>
      )}

      <div className="px-3 mt-5">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">{t('posts')}</p>
        {posts.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">{t('no_results')}</p>
        )}
        {posts.map(post => (
          <FeedPostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            isLiked={false}
            onLike={() => {}}
            onComment={() => navigate(`/post/${post.id}`)}
            onShare={() => {}}
          />
        ))}
      </div>
    </div>
  );
      }
