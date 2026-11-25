import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2 } from 'lucide-react';
import FeedPostCard from '../components/FeedPostCard';
import { notify } from '../lib/notify';
import { d1Request } from '../lib/d1Api';

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try { const result = await d1Request<{ data: any[] }>('/api/posts/archived'); setPosts(result.data || []); }
    catch (error: any) { notify.error(error.message || 'Could not load archived posts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const restore = async (id: string) => {
    try { await d1Request('/api/posts/' + encodeURIComponent(id) + '/restore', { method: 'POST' }); setPosts(prev => prev.filter(p => p.id !== id)); notify.success('Post restored'); }
    catch (error: any) { notify.error(error.message || 'Could not restore post'); }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete permanently?')) return;
    try { await d1Request('/api/posts/' + encodeURIComponent(id), { method: 'DELETE' }); setPosts(prev => prev.filter(p => p.id !== id)); notify.success('Post deleted permanently'); }
    catch (error: any) { notify.error(error.message || 'Could not delete post'); }
  };
  if (loading) return <div className="p-4 text-center text-xs text-mute">Loading archive...</div>;
  return <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
    <div className="flex items-center gap-3 mb-6 mt-1"><button onClick={() => navigate(-1)} className="text-navy dark:text-white"><ArrowLeft size={22} /></button><h1 className="text-[22px] font-bold text-navy dark:text-white">Archived Posts</h1></div>
    {posts.length === 0 && <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline"><Archive size={32} className="mx-auto text-gray-400 mb-3" /><p className="text-[15px] font-bold text-navy dark:text-white">No archived posts</p></div>}
    {posts.map(post => <div key={post.id} className="mb-6">
      <FeedPostCard post={post} readOnly={true} />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={() => restore(post.id)} className="flex items-center gap-1.5 text-[12px] font-bold text-[#12935a] bg-[#12935a]/10 px-3 py-1.5 rounded-lg"><RotateCcw size={14} /> Restore</button>
        <button onClick={() => remove(post.id)} className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg"><Trash2 size={14} /> Delete</button>
      </div>
    </div>)}
  </div>;
}
