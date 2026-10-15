import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useArchivedPosts } from '../hooks/useArchivedPosts';

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const { posts, loading, restore, remove } = useArchivedPosts();

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Archived posts</h1>
        <span className="text-[9px] text-gray-400 ml-auto">{posts.length}</span>
      </div>

      {loading && <p className="text-center text-xs text-gray-400 py-6">Loading...</p>}

      {!loading && posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Archive size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No archived posts</p>
        </div>
      )}

      {posts.map(post => (
        <div key={post.id} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
          {post.content && (
            <p className="p-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{post.content}</p>
          )}
          {post.image_url && (
            <img src={post.image_url.split(',')[0]} className="w-full" alt="" />
          )}
          <div className="flex justify-end gap-2 p-2 border-t border-gray-100 dark:border-darkline">
            <button
              onClick={() => restore(post.id)}
              className="flex items-center gap-1 text-[10px] font-bold text-accent px-2 py-1 rounded-lg bg-accent/10"
            >
              <RotateCcw size={12} /> Restore
            </button>
            <button
              onClick={() => { if (confirm('Delete permanently?')) remove(post.id); }}
              className="flex items-center gap-1 text-[10px] font-bold text-red-500 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
