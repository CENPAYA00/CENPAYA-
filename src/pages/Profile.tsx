import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Share2, Settings, Heart, Camera } from 'lucide-react';
import { getCachedUser, setCached } from '../lib/cache';

export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState<'posts' | 'products' | 'about'>('posts');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      if (!u) {
        setLoading(false);
        return;
      }

      const [userRes, postsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', u.id).single(),
        supabase.from('posts').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', u.id),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', u.id),
      ]);

      if (userRes.data) setUser(userRes.data);
      if (postsRes.data) setPosts(postsRes.data);
      setFollowerCount(followersRes.count || 0);
      setFollowingCount(followingRes.count || 0);
      setLoading(false);
    };
    load();
  }, []);

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const filePath = `${user.id}/avatar_${Date.now()}.${file.name.split('.').pop()}`;

    const { error: upErr } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
    if (upErr) {
      alert('Upload failed: ' + upErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const { error: dbErr } = await supabase.from('users').update({ avatar_url: urlData.publicUrl }).eq('id', user.id);

    if (dbErr) alert('Save failed: ' + dbErr.message);
    else setUser({ ...user, avatar_url: urlData.publicUrl });

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

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!user) return <div className="p-4 text-center text-xs">Not logged in.</div>;

  return (
    <div className="pb-24">
      <div className="h-28 bg-gradient-to-r from-brand to-brand-dark"></div>

      <div className="px-3 -mt-10">
        <div className="flex items-end gap-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden bg-accent flex items-center justify-center text-white font-black text-2xl">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                user.username?.[0]?.toUpperCase()
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-accent rounded-full flex items-center justify-center border-2 border-white"
            >
              <Camera size={12} className="text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarUpload(f);
              }}
            />
          </div>
          <div className="flex-1 pb-2">
            <div className="flex gap-2 justify-end">
              <button onClick={handleShare} className="bg-gray-100 text-navy text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Share2 size={11} /> Share
              </button>
              <button onClick={() => navigate('/settings')} className="bg-gray-100 text-navy text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Settings size={11} /> Settings
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-base font-bold text-navy">@{user.username}</h1>
          <p className="text-[10px] text-gray-500">{user.email}</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {user.is_subscribed ? '⭐ Premium Member' : 'Free Member'} • {user.country_iso || 'CM'}
          </p>
        </div>

        <div className="flex gap-4 mt-3 text-[10px]">
          <div><strong className="text-navy">{posts.length}</strong> <span className="text-gray-500">Posts</span></div>
          <div><strong className="text-navy">{followerCount}</strong> <span className="text-gray-500">Followers</span></div>
          <div><strong className="text-navy">{followingCount}</strong> <span className="text-gray-500">Following</span></div>
        </div>
      </div>

      <div className="flex border-b border-gray-100 mt-4">
        {(['posts', 'products', 'about'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-gray-400'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-3 py-3">
        {tab === 'posts' && (
          <div>
            {posts.length === 0 && <p className="text-center text-[10px] text-gray-400 py-6">No posts yet.</p>}
            {posts.map(p => (
              <div key={p.id} onClick={() => navigate(`/post/${p.id}`)} className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                {p.content && <p className="p-3 text-xs text-gray-800 whitespace-pre-wrap">{p.content}</p>}
                {p.image_url && <img src={p.image_url} alt="" className="w-full h-auto" />}
                <div className="px-3 py-2 text-[9px] text-gray-400 border-t border-gray-100 flex gap-3">
                  <span className="flex items-center gap-1"><Heart size={11} /> {p.likes_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'products' && <p className="text-center text-[10px] text-gray-400 py-6">Your listings appear here.</p>}
        {tab === 'about' && (
          <div className="bg-white p-3 rounded-2xl shadow-sm">
            <p className="text-[11px] font-bold text-navy mb-1">About</p>
            <p className="text-[10px] text-gray-600">Member since {new Date(user.created_at).toLocaleDateString()}</p>
            <p className="text-[10px] text-gray-600 mt-1">Country: {user.country_iso || 'Cameroon'}</p>
            <p className="text-[10px] text-gray-600 mt-1">Reputation: {user.reputation_score || 0}</p>
          </div>
        )}
      </div>

      <div className="px-3">
        <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1">
          <LogOut size={13} /> Log Out
        </button>
      </div>
    </div>
  );
      }
