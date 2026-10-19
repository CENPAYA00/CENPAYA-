import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useArchivedPosts } from '../hooks/useArchivedPosts';
import FeedPostCard from '../components/FeedPostCard';
import { getCachedUser } from '../lib/cache';

export default function ArchivedPosts() {
  const navigate = useNavigate();
  const { posts, loading, restore, remove } = useArchivedPosts();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getCachedUser().then(u => { if (u) setUserId(u.id); });
  }, []);

  return (
    <div className="px-4 py-4 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 mt-1">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[22px] font-bold text-navy dark:text-white">Archived Posts</h1>
        <span className="text-[12px] font-bold text-mute ml-auto bg-gray-100 dark:bg-darkline px-2.5 py-1 rounded-full">
          {posts.length}
        </span>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="h-64 bg-gray-200 dark:bg-darkcard rounded-[20px] animate-pulse" />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-[20px] p-8 text-center shadow-sm border border-gray-100 dark:border-darkline">
          <Archive size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-[15px] font-bold text-navy dark:text-white">No archived posts</p>
          <p className="text-[13px] text-mute mt-1">Posts you archive will appear here.</p>
        </div>
      )}

      {/* Archived Posts List */}
      {posts.map(post => (
        <div key={post.id} className="mb-6">
          {/* Action Buttons */}
          <div className="flex justify-end gap-2 mb-2 px-1">
            <button
              onClick={() => restore(post.id)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-[#12935a] bg-[#12935a]/10 hover:bg-[#12935a]/20 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw size={14} /> Restore
            </button>
            <button
              onClick={() => { if (confirm('Delete permanently?')) remove(post.id); }}
              className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>

          {/* Full Post Card */}
          <FeedPostCard
            post={post}
            currentUserId={userId}
            isLiked={false}
            isSaved={false}
            onLike={() => {}}
            onComment={() => navigate(`/post/${post.id}`)}
            onShare={() => {}}
            onSave={() => {}}
          />
        </div>
      ))}
    </div>
  );
          }
