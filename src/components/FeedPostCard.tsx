import { useSound } from '../contexts/sound';
function ActionBar({ post, isLiked, isSaved, onLike, onComment, onShare, onSave }: any) {
  const { play } = useSound();
  return (
    <div className="border-t border-gray-100 dark:border-darkline grid grid-cols-4">
      <button
        onClick={() => { play('like'); onLike(); }}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer"
      >
        <Heart size={14} className={isLiked ? 'fill-red-500 text-red-500' : ''} /> Like
      </button>
      <button
        onClick={() => { play('comment'); onComment(); }}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer"
      >
        <MessageCircle size={14} /> Comment
      </button>
      <button
        onClick={() => { play('share'); onShare(); }}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer"
      >
        <Share2 size={14} /> Share
      </button>
      <button
        onClick={() => { play('tap'); onSave(); }}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer"
      >
        <Bookmark size={14} className={isSaved ? 'fill-accent text-accent' : ''} /> Save
      </button>
    </div>
  );
}
