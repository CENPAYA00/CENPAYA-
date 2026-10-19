import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // REMOVED: const [userId, setUserId] = useState...

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data: archived } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', me.id)
        .not('archived_at', 'is', null)
        .order('created_at', { ascending: false });

      if (!archived || archived.length === 0) { setLoading(false); return; }

      const sellerIds = [...new Set(archived.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url')
        .in('id', sellerIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      setPosts(archived.map((p: any) => ({
        ...p,
        username: profileMap[p.user_id]?.username || 'User',
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
      })));
      setLoading(false);
    };
    load();
  }, []);

  const restore = async (id: string) => {
    await supabase.from('posts').update({ archived_at: null }).eq('id', id);
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  const remove = async (id: string) => {
    if (!confirm('Delete permanently?')) return;
    await supabase.from('posts').delete().eq('id', id);
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading archive...</div>;

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">Archived Posts</h1>
        <span className="text-[12px] font-bold text-mute ml-auto bg-gray-100 dark:bg-darkline px-2.5 py-1 rounded-full">
          {posts.length}
        </span>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline">
          <Archive size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No archived posts</p>
        </div>
      )}

      {posts.map(post => {
        // Split comma-separated image_url into an array
        const images = post.image_url 
          ? post.image_url.split(',').map((s: string) => s.trim()).filter(Boolean) 
          : [];

        return (
          <div key={post.id} className="bg-white dark:bg-darkcard rounded-[20px] shadow-sm mb-6 overflow-hidden border border-gray-100 dark:border-darkline">
            
            {/* Author Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-darkline">
              <div className="w-10 h-10 rounded-full bg-[#12935a]/10 text-[#12935a] flex items-center justify-center font-bold overflow-hidden shrink-0">
                {post.avatar_url ? <img src={post.avatar_url} className="w-full h-full object-cover" /> : post.username[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <p data-no-translate className="text-[15px] font-bold text-navy dark:text-white">{post.username}</p>
                <div className="flex items-center gap-1 text-[11px] text-mute">
                  <Globe size={10} /> {new Date(post.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Text Content */}
            {post.content && (
              <p data-no-translate className="p-4 text-[15px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                {post.content}
              </p>
            )}

            {/* CLAUDE'S IMAGE GRID LOGIC */}
            {images.length > 0 && (
              <div style={{
                display: 'grid', gap: 4, marginTop: 8,
                gridTemplateColumns: images.length === 1 ? '1fr' : '1fr 1fr',
              }}>
                {images.map((url: string) => (
                  <img key={url} src={url} loading="lazy"
                    style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, objectFit: 'cover' }} />
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 p-3 border-t border-gray-100 dark:border-darkline mt-2">
              <button
                onClick={() => restore(post.id)}
                className="flex items-center gap-1.5 text-[12px] font-bold text-[#12935a] bg-[#12935a]/10 hover:bg-[#12935a]/20 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw size={14} /> Restore
              </button>
              <button
                onClick={() => remove(post.id)}
                className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
                         }
