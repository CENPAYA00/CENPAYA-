import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Share2, Settings, Heart, Camera, Image as ImageIcon,
  Users, Briefcase, ChevronRight, Calendar
} from 'lucide-react';
import { getCachedUser, setCached } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useI18n } from '../contexts/i18n';

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState<'all' | 'photos' | 'services'>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      if (!u) { setLoading(false); return; }

      const [userRes, postsRes, servicesRes, followersRes, followingRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', u.id).single(),
        supabase.from('posts').select('*').eq('user_id', u.id)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false }),
        supabase.from('services').select('*').eq('seller_id', u.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('followed_id', u.id),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', u.id),
      ]);

      if (userRes.data) setUser(userRes.data);
      if (postsRes.data) setPosts(postsRes.data);
      if (servicesRes.data) setServices(servicesRes.data);
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
      const compressed = await compressImage(file);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;
  if (!user) return <div className="p-4 text-center text-xs">Not logged in.</div>;

  const photos = posts.filter(p => p.image_url);
  const visible = tab === 'photos' ? photos : tab === 'services' ? [] : posts;

  return (
    <div className="pb-24">
      {/* Cover */}
      <div className="relative h-40 bg-gradient-to-br from-brand to-brand-dark">
        {user.cover_url && (
          <img src={user.cover_url} alt="" className="w-full h-full object-cover" />
        )}
        <button
          onClick={() => coverRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-2 right-2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow"
        >
          <Camera size={15} className="text-navy" />
        </button>
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'cover')}
        />
      </div>

      {/* Avatar + actions */}
      <div className="px-4 -mt-12">
        <div className="flex items-end justify-between">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-darkcard bg-accent flex items-center justify-center text-white font-black text-3xl overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                user.username?.[0]?.toUpperCase()
              )}
            </div>
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center border-2 border-white dark:border-darkcard"
            >
              <Camera size={13} className="text-white" />
            </button>
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], 'avatar')}
            />
          </div>
          <div className="flex gap-2 pb-2">
            <button onClick={handleShare} className="bg-gray-100 dark:bg-darkcard text-navy dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Share2 size={11} /> {t('share_profile')}
            </button>
            <button onClick={() => navigate('/settings')} className="bg-gray-100 dark:bg-darkcard text-navy dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Settings size={11} /> {t('settings')}
            </button>
          </div>
        </div>

        {/* Name & stats */}
        <div className="mt-3">
          <h1 className="text-[17px] font-black text-navy dark:text-white">{user.username}</h1>
          <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
            <Calendar size={10} /> {t('member_since')} {new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {user.is_subscribed ? `⭐ ${t('premium_member')}` : t('free_member')}
            {' · '}
            {user.country_iso || 'CM'}
          </p>
        </div>

        <div className="flex gap-5 mt-3">
          <button className="text-[11px]">
            <strong className="text-navy dark:text-white">{posts.length}</strong>{' '}
            <span className="text-gray-500">{t('posts')}</span>
          </button>
          <button onClick={() => navigate(`/followers/${user.id}`)} className="text-[11px]">
            <strong className="text-navy dark:text-white">{followerCount}</strong>{' '}
            <span className="text-gray-500">{t('followers')}</span>
          </button>
          <button onClick={() => navigate(`/following/${user.id}`)} className="text-[11px]">
            <strong className="text-navy dark:text-white">{followingCount}</strong>{' '}
            <span className="text-gray-500">{t('following')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-darkline mt-4 px-2">
        {(['all', 'photos', 'services'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-2.5 text-[11px] font-bold ${
              tab === k
                ? 'text-accent border-b-2 border-accent'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {t(k)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-3 py-3">
        {tab === 'all' && posts.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">{t('no_results')}</p>
        )}
        {tab === 'all' && posts.map(p => (
          <PostRow key={p.id} post={p} onClick={() => navigate(`/post/${p.id}`)} />
        ))}

        {tab === 'photos' && photos.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">{t('no_results')}</p>
        )}
        {tab === 'photos' && (
          <div className="grid grid-cols-3 gap-0.5">
            {photos.map(p => {
              const first = p.image_url.split(',')[0];
              return (
                <button key={p.id} onClick={() => navigate(`/post/${p.id}`)} className="aspect-square overflow-hidden bg-gray-100">
                  <img src={first} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        )}

        {tab === 'services' && services.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">{t('no_services')}</p>
        )}
        {tab === 'services' && services.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(`/service/${s.id}`)}
            className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 p-3 text-left flex items-center gap-3"
          >
            <Briefcase size={16} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy dark:text-white truncate">{s.title}</p>
              <p className="text-[10px] text-accent font-bold">
                {Number(s.starting_price || 0).toLocaleString()} XAF
              </p>
            </div>
            <ChevronRight size={14} className="text-gray-400" />
          </button>
        ))}
      </div>

      <div className="px-3 mt-4">
        <button onClick={handleLogout} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1">
          <LogOut size={13} /> {t('logout')}
        </button>
      </div>
    </div>
  );
}

function PostRow({ post, onClick }: { post: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden text-left">
      {post.content && (
        <p className="p-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{post.content}</p>
      )}
      {post.image_url && (
        <img src={post.image_url.split(',')[0]} alt="" className="w-full h-auto bg-gray-100" />
      )}
      <div className="px-3 py-2 text-[9px] text-gray-400 border-t border-gray-100 dark:border-darkline flex gap-3">
        <span className="flex items-center gap-1"><Heart size={11} /> {post.likes_count || 0}</span>
      </div>
    </button>
  );
        }
