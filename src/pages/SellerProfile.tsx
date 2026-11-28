import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { ArrowLeft, UserPlus, MessageCircle, Star, BadgeCheck, ShieldCheck } from 'lucide-react';
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
      try {
        const [meResult, profileResult, postsResult, followResult] = await Promise.all([
          d1Request<{ user: any }>('/api/me').catch(() => ({ user: null })),
          d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(id)}`),
          d1Request<{ data: any[] }>(`/api/profiles/${encodeURIComponent(id)}/posts`),
          d1Request<{ following: boolean }>(`/api/profiles/${encodeURIComponent(id)}/follow-status`).catch(() => ({ following: false })),
        ]);
        setCurrentUserId(meResult.user?.id || null);
        setProfile(profileResult.data);
        setPosts((postsResult.data || []).map((p: any) => ({ ...p, user_id: p.author_id || p.user_id, username: profileResult.data?.username })));
        setIsFollowing(!!followResult.following);
      } catch (error: any) { alert(error.message || 'Could not load profile'); }
      finally { setLoading(false); }
    };
    void load();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUserId || !id) return;
    if (currentUserId === id) return alert("You can't follow yourself.");
    const next = !isFollowing;
    try {
      await d1Request(`/api/profiles/${encodeURIComponent(id)}/follow`, { method: next ? 'POST' : 'DELETE' });
      setIsFollowing(next);
      setProfile((p: any) => p ? { ...p, followers_count: Math.max(0, (p.followers_count || 0) + (next ? 1 : -1)) } : p);
    } catch (error: any) { alert(error.message || 'Could not update follow'); }
  };

  const handleChat = async () => {
    if (!currentUserId || !id) return;
    if (currentUserId === id) return alert("You can't chat with yourself.");
    setStartingChat(true);
    try {
      const result = await d1Request<{ id: string }>('/api/chat/direct', { method: 'POST', body: JSON.stringify({ user_id: id }) });
      navigate(`/chat/${result.id}`);
    } catch (error: any) { alert(error.message || 'Could not start chat'); }
    finally { setStartingChat(false); }
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
            <button onClick={() => navigate(-1)} className="text-navy dark:text-white text-[10px] font-bold cursor-pointer">
              <ArrowLeft size={14} />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-base font-bold text-navy dark:text-white">@{profile.username}</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {t('member_since')} {new Date(profile.created_at).toLocaleDateString()}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {profile.is_subscribed && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 text-[9px] font-bold"><BadgeCheck size={11}/> Verified membership</span>}
            {profile.is_phone_verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-[9px] font-bold"><ShieldCheck size={11}/> Verified account</span>}
            {Number(profile.reviews_count || 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-1 text-[9px] font-bold"><Star size={11} fill="currentColor"/> Trust · {Number(profile.average_rating || 0).toFixed(1)} ({profile.reviews_count})</span>}
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-[11px]">
          <div>
            <strong className="text-navy dark:text-white">{profile.followers_count || 0}</strong>{' '}
            <span className="text-gray-500">{t('followers')}</span>
          </div>
          {Number(profile.reviews_count || 0) > 0 && <div className="flex items-center gap-1"><Star size={11} className="text-gold" fill="currentColor"/><strong className="text-navy dark:text-white">{Number(profile.average_rating || 0).toFixed(1)}</strong><span className="text-gray-500">({profile.reviews_count} reviews)</span></div>}
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
