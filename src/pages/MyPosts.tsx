import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Trash2, ArrowLeft, Plus, Archive } from 'lucide-react';
import { useI18n } from '../contexts/i18n';

export default function MyPosts() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)      // hide archived
        .order('created_at', { ascending: false });
      if (data) setPosts(data);
      setLoading(false);
    };
    load();
  }, []);

  const handleDelete = async (postId: string) => {
    if (!window.confirm('Delete this post permanently?')) return;
    setDeleting(postId);
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) alert('Could not delete: ' + error.message);
    else setPosts(prev => prev.filter(p => p.id !== postId));
    setDeleting(null);
  };

  const handleArchive = async (postId: string) => {
    if (!window.confirm('Archive this post? You can restore it later.')) return;
    const { error } = await supabase
      .from('posts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) { alert(error.message); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
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

  if (loading) {
    return (
      <div className="px-3 py-3 pb-24 space-y-3">
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-darkcard rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('posts')}</h1>
        <button
          onClick={() => navigate('/archive')}
          className="ml-auto text-[10px] font-bold text-gray-500 flex items-center gap-1"
        >
          <Archive size={12} /> Archive
        </button>
      </div>

      {posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-5 rounded-2xl shadow-sm text-center">
          <p className="text-[11px] font-bold text-navy dark:text-white">You haven't posted anything yet</p>
          <button
            onClick={() => navigate('/create-post')}
            className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg flex items-center gap-1 mx-auto"
          >
            <Plus size={12} /> {t('create_post')}
          </button>
        </div>
      )}

      {posts.map(post => (
        <div key={post.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
          <div className="p-3 flex items-center gap-2">
            <p className="text-[9px] text-gray-400">{timeAgo(post.created_at)}</p>
            {post.moderation_status === 'pending' && (
              <span className="text-[9px] font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full ml-auto">PENDING</span>
            )}
            {post.moderation_status === 'removed' && (
              <span className="text-[9px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full ml-auto">REMOVED</span>
            )}
            {post.moderation_status === 'approved' && (
              <span className="text-[9px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full ml-auto">LIVE</span>
            )}
          </div>

          {post.content && (
            <p className="px-3 pb-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{post.content}</p>
          )}

          {post.image_url && (
            <img src={post.image_url.split(',')[0]} alt="" className="w-full h-auto bg-gray-100" />
          )}

          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-darkline">
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><Heart size={12} /> {post.likes_count || 0}</span>
              <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.comments_count || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleArchive(post.id)}
                className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-300 px-2 py-1 rounded-lg bg-gray-100 dark:bg-darkbg"
              >
                <Archive size={12} /> Archive
              </button>
              <button
                onClick={() => handleDelete(post.id)}
                disabled={deleting === post.id}
                className="flex items-center gap-1 text-[10px] font-bold text-red-500 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 disabled:opacity-50"
              >
                <Trash2 size={12} />
                {deleting === post.id ? 'Deleting...' : t('delete')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
    }
