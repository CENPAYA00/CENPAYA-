import { useEffect, useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';
import { notify } from '../lib/notify'; // CHANGED TO NOTIFY

export function useArchivedPosts() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const result = await d1Request<{ data: any[] }>('/api/posts/archived'); setPosts(result.data || []); }
    catch (error: any) { notify.error(error.message || 'Could not load archive'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (id: string) => {
    try { await d1Request(`/api/posts/${encodeURIComponent(id)}/restore`, { method: 'POST' }); setPosts(prev => prev.filter(p => p.id !== id)); notify.success('Post restored successfully'); }
    catch (error: any) { notify.error(error.message || 'Could not restore post'); }
  };

  const remove = async (id: string) => {
    try { await d1Request(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }); setPosts(prev => prev.filter(p => p.id !== id)); notify.success('Post deleted permanently'); }
    catch (error: any) { notify.error(error.message || 'Could not delete post'); }
  };

  return { posts, loading, restore, remove };
      }
