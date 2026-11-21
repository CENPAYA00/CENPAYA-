import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { useI18n } from '../contexts/i18n';
import FeedPostCard from '../components/FeedPostCard';
import { d1Request } from '../lib/d1Api';

export default function Saved() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    d1Request<{ data: any[] }>('/api/posts/saved')
      .then(r => setPosts(r.data || []))
      .catch((e: any) => alert(e.message || 'Could not load saved posts'))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button><h1 className="text-base font-bold text-navy dark:text-white">{t('saved')}</h1></div>
    {posts.length===0&&<div className="bg-white dark:bg-darkcard rounded-2xl p-8 text-center shadow-sm"><Bookmark size={28} className="mx-auto text-gray-400 mb-2" /><p className="text-xs text-gray-500">No saved posts yet</p></div>}
    {posts.map(post=><div key={post.id} className="mb-3"><FeedPostCard post={post} readOnly={true} /></div>)}
  </div>;
}
