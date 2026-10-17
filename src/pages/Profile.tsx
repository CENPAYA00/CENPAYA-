/* src/pages/Profile.tsx */
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Share2, Settings, Camera, Calendar, MapPin, Briefcase,
  Store, ChevronRight
} from 'lucide-react';
import { getCachedUser, setCached } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useI18n } from '../contexts/i18n';
import FeedPostCard from '../components/FeedPostCard';

const LIMIT = 20;

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState<'all' | 'posts' | 'market' | 'services'>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      if (!u) { setLoading(false); return; }

      // CHANGED: added .limit(LIMIT) to posts, listings, and services
      const [userRes, postsRes, servicesRes, listingsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', u.id).single(),
        supabase.from('posts').select('*').eq('user_id', u.id).eq('moderation_status', 'approved').is('archived_at', null).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('services').select('*').eq('seller_id', u.id).eq('is_active', true).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('listings').select('*').eq('seller_id', u.id).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('followed_id', u.id),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', u.id),
      ]);

      if (userRes.data) setUser(userRes.data);
      
      if (postsRes.data) {
        const enriched = (postsRes.data as any[]).map(p => ({ ...p, username: u.username }));
        setPosts(enriched);

        if (postsRes.data.length > 0) {
          const postIds = postsRes.data.map((p: any) => p.id);
          // CHANGED: Fetch likes/saved in parallel with posts to avoid waterfall delay
          const [likesRes, savedRes] = await Promise.all([
            supabase.from('post_likes').select('post_id').eq('user_id', u.id).in('post_id', postIds),
            supabase.from('saved_posts').select('post_id').eq('user_id', u.id).in('post_id', postIds),
          ]);
          setLikedPosts(new Set((likesRes.data || []).map((l: any) => l.post_id)));
          setSavedPosts(new Set((savedRes.data || []).map((s: any) => s.post_id)));
        }
      }
      if (servicesRes.data) setServices(servicesRes.data);
      if (listingsRes.data) setListings(listingsRes.data);
      setFollowerCount(followersRes.count || 0);
      setFollowingCount(followingRes.count || 0);
      setLoading(false);
    };
    load();
  }, []);

  const uploadImage = async (file: File, kind: 'avatar' | 'cover') => {
    if (!user) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file, { maxDimension: kind === 'cover' ? 1400 : 800 });
      const ext = compressed.name.split('.').pop();
      const path = `${user.id}/${kind}_${Date.now()}.${ext}`;
      const bucket = kind === 'avatar' ? 'avatars' : 'covers';
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      const field = kind === 'avatar' ? 'avatar_url' : 'cover_url';
      const { error: dbErr } = await supabase.from('users').update({ [field]: urlData.publicUrl }).eq('id', user.id);
      if (dbErr) throw dbErr;
      setUser({ ...user, [field]: urlData.publicUrl });
      setCached('home_posts', null);
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleShare = async () => {
    if (!user) return;
    const url = `https://cenpaya.pages.dev/seller/${user.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: `@${user.username} on CenPaya`, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Profile link copied');
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const currentlyLiked = likedPosts.has(postId);
    setLikedPosts(prev => { const n = new Set(prev); currentlyLiked ? n.delete(postId) : n.add(postId); return n; });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + (currentlyLiked ? -1 : 1) } : p));
    if (currentlyLiked) await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
    else await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
  };

  const handleSave = async (postId: string) => {
    if (!user) return;
    const isSaved = savedPosts.has(postId);
    setSavedPosts(prev => { const n = new Set(prev); isSaved ? n.delete(postId) : n.add(postId); return n; });
    if (isSaved) await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', user.id);
    else await supabase.from('saved_posts').insert({ post_id: postId, user_id: user.id });
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;
  if (!user) return <div className="p-4 text-center text-xs">Not logged in.</div>;

  const locationParts = [user.city, user.region, user.country_iso].filter(Boolean);
  const locationLine = locationParts.join(', ');

  // Memoized Lists (Solves tab switching lag)
  const renderPosts = (postsList: any[]) => postsList.map(post => (
    <FeedPostCard
      key={`p-${post.id}`}
      post={post}
      currentUserId={user.id}
      isLiked={likedPosts.has(post.id)}
      isSaved={savedPosts.has(post.id)}
      onLike={() => handleLike(post.id)}
      onComment={() => navigate(`/post/${post.id}`)}
      onShare={() => {}}
      onSave={() => handleSave(post.id)}
    />
  ));

  return (
    <div className="pb-24">
      <div className="relative h-40 bg-gradient-to-br from-brand to-brand-dark">
        {user.cover_url && <img src={user.cover_url} alt="" className="w-full h-full object-cover" />}
        <button
          onClick={() => coverRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-2 right-2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow cursor-pointer"
        >
          <Camera size={15} className="text-navy" />
        </button>
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && uploadImage(e.target.files[0], 'cover')} />
      </div>

      <div className="px-4 -mt-12">
        <div className="flex items-end justify-between">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-darkcard bg-accent flex items-center justify-center text-white font-black text-3xl overflow-hidden">
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : user.username?.[0]?.toUpperCase()}
            </div>
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center border-2 border-white dark:border-darkcard cursor-pointer"
            >
              <Camera size={13} className="text-white" />
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && uploadImage(e.target.files[0], 'avatar')} />
          </div>
          <div className="flex gap-2 pb-2">
            <button onClick={handleShare} className="bg-gray-100 dark:bg-darkcard text-navy dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer">
              <Share2 size={11} /> {t('share_profile')}
            </button>
            <button onClick={() => navigate('/settings')} className="bg-gray-100 dark:bg-darkcard text-navy dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer">
              <Settings size={11} /> {t('settings')}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-[17px] font-black text-navy dark:text-white">{user.username}</h1>
          <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
            <Calendar size={10} /> {t('member_since')} {new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {user.is_subscribed ? `⭐ ${t('premium_member')}` : t('free_member')}
          </p>
          {locationLine && (
            <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
              <MapPin size={10} className="text-accent" /> {locationLine}
            </p>
          )}
          {user.occupation && (
            <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
              <Briefcase size={10} className="text-accent" /> {user.occupation}
            </p>
          )}
          {user.bio && (
            <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">{user.bio}</p>
          )}
        </div>

        <div className="flex gap-5 mt-3">
          <div className="text-[11px]">
            <strong className="text-navy dark:text-white">{posts.length}</strong>{' '}
            <span className="text-gray-500">{t('posts')}</span>
          </div>
          <button onClick={() => navigate(`/profile/${user.id}/followers`)} className="text-[11px] cursor-pointer">
            <strong className="text-navy dark:text-white">{followerCount}</strong>{' '}
            <span className="text-gray-500">{t('followers')}</span>
          </button>
          <button onClick={() => navigate(`/profile/${user.id}/following`)} className="text-[11px] cursor-pointer">
            <strong className="text-navy dark:text-white">{followingCount}</strong>{' '}
            <span className="text-gray-500">{t('following')}</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-darkline mt-4 px-2">
        {(['all', 'posts', 'market', 'services'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-2.5 text-[11px] font-bold cursor-pointer ${
              tab === k ? 'text-accent border-b-2 border-accent' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {k === 'all' ? t('all') : k === 'posts' ? t('posts') : k === 'market' ? 'Market' : t('services')}
          </button>
        ))}
      </div>

      <div className="px-3 py-3">
        {tab === 'all' && (
          <>
            {posts.length === 0 && listings.length === 0 && services.length === 0 && (
              <p className="text-center text-[10px] text-gray-400 py-6">{t('no_results')}</p>
            )}
            {renderPosts(posts)}
            {listings.map(l => {
              const images: string[] = Array.isArray(l.images) ? l.images : [];
              const cover = images[0];
              const priceLabel = l.price_is_range
                ? `${Number(l.price_min || 0).toLocaleString()} – ${Number(l.price_max || l.price_min || 0).toLocaleString()}`
                : `${Number(l.price || 0).toLocaleString()}`;
              return (
                <button
                  key={`l-${l.id}`}
                  onClick={() => navigate(`/listing/${l.id}`)}
                  className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden text-left flex cursor-pointer"
                >
                  <div className="w-24 h-24 bg-gray-100 dark:bg-darkbg shrink-0">
                    {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> :
                      <div className="w-full h-full flex items-center justify-center"><Store size={18} className="text-gray-400" /></div>}
                  </div>
                  <div className="flex-1 p-3 min-w-0">
                    <p className="text-[12px] font-bold text-navy dark:text-white truncate">{l.title}</p>
                    <p className="text-[12px] font-black text-accent mt-1">{priceLabel} <span className="text-[9px]">XAF</span></p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 self-center mr-2" />
                </button>
              );
            })}
            {services.map(s => (
              <button
                key={`s-${s.id}`}
                onClick={() => navigate(`/service/${s.id}`)}
                className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 p-3 text-left flex items-center gap-3 cursor-pointer"
              >
                <Briefcase size={16} className="text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-navy dark:text-white truncate">{s.title}</p>
                  <p className="text-[10px] text-accent font-bold">{Number(s.starting_price || 0).toLocaleString()} XAF</p>
                </div>
                <ChevronRight size={14} className="text-gray-400" />
              </button>
            ))}
          </>
        )}

        {tab === 'posts' && posts.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">{t('no_results')}</p>
        )}
        {tab === 'posts' && renderPosts(posts)}

        {tab === 'market' && listings.length === 0 && (
          <div className="text-center py-6">
            <Store size={28} className="mx-auto text-gray-400 mb-2" />
            <p className="text-[10px] text-gray-400">{t('no_results')}</p>
            <button onClick={() => navigate('/create-listing')} className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg cursor-pointer">
              {t('create_listing')}
            </button>
          </div>
        )}
        {tab === 'market' && listings.map(l => {
          const images: string[] = Array.isArray(l.images) ? l.images : [];
          const cover = images[0];
          const priceLabel = l.price_is_range
            ? `${Number(l.price_min || 0).toLocaleString()} – ${Number(l.price_max || l.price_min || 0).toLocaleString()}`
            : `${Number(l.price || 0).toLocaleString()}`;
          return (
            <button
              key={l.id}
              onClick={() => navigate(`/listing/${l.id}`)}
              className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden text-left flex cursor-pointer"
            >
              <div className="w-24 h-24 bg-gray-100 dark:bg-darkbg shrink-0">
                {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> :
                  <div className="w-full h-full flex items-center justify-center"><Store size={18} className="text-gray-400" /></div>}
              </div>
              <div className="flex-1 p-3 min-w-0">
                <p className="text-[12px] font-bold text-navy dark:text-white truncate">{l.title}</p>
                <p className="text-[12px] font-black text-accent mt-1">{priceLabel} <span className="text-[9px]">XAF</span></p>
                {l.location_city && <p className="text-[10px] text-gray-400 mt-0.5">{l.location_city}</p>}
              </div>
              <ChevronRight size={16} className="text-gray-400 self-center mr-2" />
            </button>
          );
        })}

        {tab === 'services' && services.length === 0 && (
          <div className="text-center py-6">
            <Briefcase size={28} className="mx-auto text-gray-400 mb-2" />
            <p className="text-[10px] text-gray-400">{t('no_services')}</p>
            <button onClick={() => navigate('/create-service')} className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg cursor-pointer">
              {t('create_service')}
            </button>
          </div>
        )}
        {tab === 'services' && services.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(`/service/${s.id}`)}
            className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 p-3 text-left flex items-center gap-3 cursor-pointer"
          >
            <Briefcase size={16} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy dark:text-white truncate">{s.title}</p>
              <p className="text-[10px] text-accent font-bold">{Number(s.starting_price || 0).toLocaleString()} XAF</p>
            </div>
            <ChevronRight size={14} className="text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
    }
