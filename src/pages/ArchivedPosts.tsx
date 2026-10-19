import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useArchivedPosts } from '../hooks/useArchivedPosts';
import FeedPostCard from '../components/FeedPostCard';

const noop = () => {};

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const { posts, loading, restore, remove } = useArchivedPosts();

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

      {posts.map((post) => (
        <div key={post.id} className="mb-6">
          {/* EXACT CLAUDE LOGIC */}
          <FeedPostCard
            post={post}
            currentUserId={post.user_id}
            isLiked={false}
            onLike={noop}
            onComment={noop}
            onShare={noop}
            readOnly
          />
          
          <div className="flex justify-end gap-2 -mt-2 relative z-10">
            <button
              onClick={() => restore(post.id)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-[#12935a] bg-[#12935a]/10 px-3 py-1.5 rounded-lg active:scale-95 cursor-pointer backdrop-blur-md"
            >
              <RotateCcw size={14} /> Restore
            </button>
            <button
              onClick={() => {
                if (confirm('Delete permanently?')) remove(post.id);
              }}
              className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg active:scale-95 cursor-pointer backdrop-blur-md"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
