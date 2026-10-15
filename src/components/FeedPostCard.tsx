import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Share2, Globe, X, MoreHorizontal,
  Bookmark, Send, EyeOff, Flag, Download, Link as LinkIcon, Crown, AtSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { getBackground, backgroundStyle } from '../lib/postBackgrounds';
import ImageGrid from './ImageGrid';
import DocumentCard from './DocumentCard';
import ReportSheet from './ReportSheet';
import PostFollowButton from './PostFollowButton';
import ShareSheet from './ShareSheet';
import { useSound } from '../contexts/sound';
import { logActivity } from '../lib/activityLog';

type Props = {
  post: any;
  currentUserId?: string | null;
  isLiked: boolean;
  isSaved?: boolean;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onShare: (postId: string) => void;
  onSave?: (postId: string) => void;
  onHide?: (postId: string) => void;
};

export default function FeedPostCard({
  post, currentUserId, isLiked, isSaved, onLike, onComment, onShare, onSave, onHide,
}: Props) {
  const navigate = useNavigate();
  const { play } = useSound();
  const [hidden, setHidden] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isInterested, setIsInterested] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (hidden) return null;

  const images: string[] = Array.isArray(post.image_url)
    ? post.image_url
    : post.image_url
    ? post.image_url.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const docs: string[] = Array.isArray(post.documents) ? post.documents : [];
  const tags: any[] = Array.isArray(post.tags) ? post.tags : [];
  const authorIsPremium = !!post.author_is_premium;
  const isFollowingAuthor = !!post.is_following_author;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const markInterested = async () => {
    setShowPostMenu(false);
    setIsInterested(true);
    showToast('Marked as interested');
    try {
      const me = await getCachedUser();
      if (me) await supabase.from('interested_posts').upsert({ user_id: me.id, post_id: post.id });
    } catch {}
  };

  const notInterested = async () => {
    setShowPostMenu(false);
    setHidden(true);
    onHide?.(post.id);
    try {
      const me = await getCachedUser();
      if (me) await supabase.from('not_interested_posts').upsert({ user_id: me.id, post_id: post.id });
    } catch {}
  };

  const saveToGallery = async () => {
    setShowPostMenu(false);
    if (images.length === 0) { showToast('No image to save.'); return; }
    try {
      const res = await fetch(images[0]);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `cenpaya-${post.id.slice(0, 8)}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      showToast('Saved to your device');
    } catch { showToast('Could not save image.'); }
  };

  const copyLink = async () => {
    setShowPostMenu(false);
    const url = `https://cenpaya.pages.dev/post/${post.id}`;
    try { await navigator.clipboard.writeText(url); showToast('Link copied'); }
    catch { prompt('Copy this link:', url); }
  };

  const openShareSheet = () => {
    play('tap');
    setShowShareSheet(true);
  };

  const handleShareComplete = (postId: string) => {
    logActivity('post_shared', { post_id: postId });
    play('success');
    onShare(postId);
    showToast('Sent');
  };

  const Toast = toast ? (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[11px] font-bold px-4 py-2 rounded-full z-[250]">
      {toast}
    </div>
  ) : null;

  const AuthorRow = (
    <div className="p-3 flex items-center gap-2">
      <button
        onClick={() => navigate(`/seller/${post.user_id}`)}
        className="flex items-center gap-2 flex-1 text-left min-w-0 cursor-pointer"
      >
        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-sm font-bold text-accent overflow-hidden shrink-0">
          {post.avatar_url ? (
            <img src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            post.username?.[0]?.toUpperCase() || 'U'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-bold text-navy dark:text-white truncate">
              @{post.username}
            </p>
            {authorIsPremium && <Crown size={11} className="text-gold shrink-0" />}
          </div>
          <div className="flex items-center gap-1 text-[9px] text-gray-500">
            <Globe size={9} />
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </button>
      <PostFollowButton
        authorId={post.user_id}
        initialFollowing={isFollowingAuthor}
      />
      <button
        onClick={() => setShowPostMenu(true)}
        aria-label="More options"
        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 shrink-0 cursor-pointer"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );

  const TagsRow = tags.length > 0 ? (
    <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
      <AtSign size={10} className="text-accent" />
      {tags.map((t: any) => (
        <button
          key={t.user_id}
          onClick={() => navigate(`/seller/${t.user_id}`)}
          className="text-[10px] font-bold text-accent cursor-pointer"
        >
          {t.username}
        </button>
      ))}
    </div>
  ) : null;

  const menus = (
    <>
      {showShareSheet && (
        <ShareSheet
          postId={post.id}
          onClose={() => setShowShareSheet(false)}
          onShared={() => handleShareComplete(post.id)}
        />
      )}
      {showPostMenu && (
        <PostMenu
          hasImage={images.length > 0}
          isInterested={isInterested}
          onClose={() => setShowPostMenu(false)}
          onInterested={markInterested}
          onNotInterested={notInterested}
          onReport={() => { setShowPostMenu(false); setShowReport(true); }}
          onSaveToGallery={saveToGallery}
          onCopyLink={copyLink}
        />
      )}
      {showReport && <ReportSheet targetType="post" targetId={post.id} onClose={() => setShowReport(false)} />}
      {Toast}
    </>
  );

  if (post.post_type === 'colored' && post.bg_color && images.length === 0) {
    const bg = getBackground(post.bg_color);
    return (
      <>
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
          {AuthorRow}
          <div
            onClick={() => navigate(`/post/${post.id}`)}
            style={backgroundStyle(bg)}
            className={`cursor-pointer ${bg.bgClass} py-12 px-6 flex items-center justify-center min-h-[200px]`}
          >
            <p className={`text-lg font-bold ${bg.textClass} text-center whitespace-pre-wrap leading-relaxed max-w-md`}>
              {post.content}
            </p>
          </div>
          {TagsRow}
          <ActionBar
            post={post}
            isLiked={isLiked}
            isSaved={!!isSaved}
            onLike={() => onLike(post.id)}
            onComment={() => onComment(post.id)}
            onShare={openShareSheet}
            onSave={() => onSave?.(post.id)}
          />
        </div>
        {menus}
      </>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
        {AuthorRow}

        {post.content && (
          <p className="px-3 pb-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {images.length > 0 && <ImageGrid images={images} />}
        {docs.length > 0 && (
          <div className="px-3 pb-2">
            {docs.map((url, i) => <DocumentCard key={i} url={url} />)}
          </div>
        )}

        {TagsRow}

        <MetricsRow likes={post.likes_count} comments={post.comments_count} shares={post.shares_count || 0} />
        <ActionBar
          post={post}
          isLiked={isLiked}
          isSaved={!!isSaved}
          onLike={() => onLike(post.id)}
          onComment={() => onComment(post.id)}
          onShare={openShareSheet}
          onSave={() => onSave?.(post.id)}
        />
      </div>
      {menus}
    </>
  );
}

function PostMenu({ hasImage, isInterested, onClose, onInterested, onNotInterested, onReport, onSaveToGallery, onCopyLink }: any) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Post options</p>
          <button onClick={onClose} className="cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2">
          {!isInterested && (
            <button onClick={onInterested} className="w-full text-left p-3 rounded-xl bg-accent/10 text-accent font-bold text-[12px] flex items-center gap-2 cursor-pointer">
              <Heart size={14} /> Interested
            </button>
          )}
          <button onClick={onNotInterested} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2 cursor-pointer">
            <EyeOff size={14} /> Not interested
          </button>
          {hasImage && (
            <button onClick={onSaveToGallery} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2 cursor-pointer">
              <Download size={14} /> Save image to device
            </button>
          )}
          <button onClick={onCopyLink} className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2 cursor-pointer">
            <LinkIcon size={14} /> Copy post link
          </button>
          <button onClick={onReport} className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2 cursor-pointer">
            <Flag size={14} /> Report post
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricsRow({ likes, comments, shares }: any) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-[10px] text-gray-500">
      <div className="flex items-center gap-3">
        {likes > 0 && <span>❤️ {likes}</span>}
        {comments > 0 && <span>💬 {comments}</span>}
      </div>
      {shares > 0 && <span>{shares} shares</span>}
    </div>
  );
}

function ActionBar({ post, isLiked, isSaved, onLike, onComment, onShare, onSave }: any) {
  return (
    <div className="border-t border-gray-100 dark:border-darkline grid grid-cols-4">
      <button onClick={onLike} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer">
        <Heart size={14} className={isLiked ? 'fill-red-500 text-red-500' : ''} /> Like
      </button>
      <button onClick={onComment} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer">
        <MessageCircle size={14} /> Comment
      </button>
      <button onClick={onShare} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer">
        <Share2 size={14} /> Share
      </button>
      <button onClick={onSave} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98] cursor-pointer">
        <Bookmark size={14} className={isSaved ? 'fill-accent text-accent' : ''} /> Save
      </button>
    </div>
  );
    }
