import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Share2, Globe, X, MoreHorizontal,
  Bookmark, EyeOff, Flag, Download, Link as LinkIcon, Crown, AtSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import ImageGrid from './ImageGrid';
import DocumentCard from './DocumentCard';
import ReportSheet from './ReportSheet';
import PostFollowButton from './PostFollowButton';
import ShareSheet from './ShareSheet';
import DemoBadge from './DemoBadge';
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
  onFollowToggle?: (isNowFollowing: boolean) => void;
};

function colorToVar(id: string): { bg: string; isGradient: boolean } {
  switch (id) {
    case 'pink':           return { bg: '#E40046', isGradient: false };
    case 'charcoal':       return { bg: '#1C1E21', isGradient: false };
    case 'blue':           return { bg: '#1877F2', isGradient: false };
    case 'maroon':         return { bg: '#6B1426', isGradient: false };
    case 'purple-magenta': return { bg: 'linear-gradient(135deg, #7F00FF, #E100FF)', isGradient: true };
    case 'sunset':         return { bg: 'linear-gradient(45deg, #FF416C, #FF4B2B)', isGradient: true };
    case 'cyan-blue':      return { bg: 'linear-gradient(180deg, #00B4DB, #0083B0)', isGradient: true };
    default:               return { bg: 'transparent', isGradient: false };
  }
}

export default function FeedPostCard({
  post, currentUserId, isLiked, isSaved, onLike, onComment, onShare, onSave, onHide, onFollowToggle,
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
    showToast("You won't see this again");
    onHide?.(post.id);
    try {
      const me = await getCachedUser();
      if (me) await supabase.from('not_interested_posts').upsert({ user_id: me.id, post_id: post.id });
    } catch {}
  };

  const hideSingle = async () => {
    setShowPostMenu(false);
    setHidden(true);
    showToast('Post hidden');
    onHide?.(post.id);
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

  const handleShareComplete = () => {
    logActivity('post_shared', { post_id: post.id });
    play('success');
    onShare(post.id);
    showToast('Sent');
  };

  const Toast = toast ? (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[11px] font-bold px-4 py-2 rounded-full z-[250]">
      {toast}
    </div>
  ) : null;

  const AuthorRow = (
    <div className="px-4 py-3 flex items-center gap-3">
      <button
        onClick={() => navigate(`/seller/${post.user_id}`)}
        className="flex items-center gap-3 flex-1 text-left min-w-0 cursor-pointer"
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-amber-700 flex items-center justify-center text-sm font-bold text-white overflow-hidden shrink-0">
          {post.avatar_url ? (
            <img src={post.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            post.username?.[0]?.toUpperCase() || 'U'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-bold text-navy dark:text-white truncate">
              {post.username}
            </p>
            {authorIsPremium && (
              <span className="bg-gold/15 text-gold text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                <Crown size={10} /> PRO
              </span>
            )}
            {post.is_demo && <DemoBadge />}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-mute flex-wrap mt-0.5">
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
            {post.feeling && (
              <>
                <span>·</span>
                <span>
                  {post.feeling_kind === 'activity' ? '' : 'is feeling '}
                  {post.feeling_emoji} {post.feeling}
                </span>
              </>
            )}
          </div>
        </div>
      </button>
      
      {currentUserId !== post.user_id && (
        <PostFollowButton 
          authorId={post.user_id} 
          initialFollowing={isFollowingAuthor} 
          onFollowToggle={onFollowToggle}
        />
      )}
      
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowPostMenu(true)}
          aria-label="More options"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 shrink-0 cursor-pointer"
        >
          <MoreHorizontal size={16} />
        </button>
        <button
          onClick={hideSingle}
          aria-label="Hide this post"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 shrink-0 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  const TagsRow = tags.length > 0 ? (
    <div className="px-4 pb-2 flex items-center gap-1 flex-wrap">
      <AtSign size={12} className="text-brand" />
      {tags.map((t: any) => (
        <button key={t.user_id} onClick={() => navigate(`/seller/${t.user_id}`)} className="text-[12px] font-bold text-brand cursor-pointer">
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
          onShared={() => handleShareComplete()}
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
    const { bg, isGradient } = colorToVar(post.bg_color);
    const inlineStyle = {
      '--inline-bg': isGradient ? 'transparent' : bg,
      '--inline-bg-image': isGradient ? bg : 'none',
      '--inline-fg': '#ffffff',
      color: '#ffffff',
    } as React.CSSProperties;

    return (
      <>
        <div className="bg-white dark:bg-darkcard rounded-card shadow-soft mb-4 overflow-hidden border border-gray-100 dark:border-darkline">
          {AuthorRow}
          <div
            data-inline-bg
            onClick={() => navigate(`/post/${post.id}`)}
            style={inlineStyle}
            className="cursor-pointer py-16 px-6 flex items-center justify-center min-h-[220px]"
          >
            <p className="text-xl font-bold text-center whitespace-pre-wrap leading-relaxed max-w-md">
              {post.content}
            </p>
          </div>
          {TagsRow}
          <MetricsRow likes={post.likes_count} comments={post.comments_count} shares={post.shares_count} />
          <ActionBar post={post} isLiked={isLiked} isSaved={!!isSaved} onLike={() => onLike(post.id)} onComment={() => onComment(post.id)} onShare={openShareSheet} onSave={() => onSave?.(post.id)} />
        </div>
        {menus}
      </>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-darkcard rounded-card shadow-soft mb-4 overflow-hidden border border-gray-100 dark:border-darkline">
        {AuthorRow}

        {post.content && (
          <p className="px-4 pb-3 text-[14px] text-ink dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {images.length > 0 && (
          <div className="w-full">
            <ImageGrid images={images} />
          </div>
        )}
        {docs.length > 0 && (
          <div className="px-4 pb-2">
            {docs.map((url, i) => <DocumentCard key={i} url={url} />)}
          </div>
        )}

        {TagsRow}

        <MetricsRow likes={post.likes_count} comments={post.comments_count} shares={post.shares_count} />
        <ActionBar post={post} isLiked={isLiked} isSaved={!!isSaved} onLike={() => onLike(post.id)} onComment={() => onComment(post.id)} onShare={openShareSheet} onSave={() => onSave?.(post.id)} />
      </div>
      {menus}
    </>
  );
}

function PostMenu({ hasImage, isInterested, onClose, onInterested, onNotInterested, onReport, onSaveToGallery, onCopyLink }: any) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-3xl animate-slide-up pb-safe">
        <div className="p-4 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[15px] font-bold text-navy dark:text-white">Post options</p>
          <button onClick={onClose} className="cursor-pointer bg-gray-100 dark:bg-white/10 p-1.5 rounded-full"><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2">
          {!isInterested && (
            <button onClick={onInterested} className="w-full text-left p-3.5 rounded-2xl bg-brand/10 text-brand font-bold text-[14px] flex items-center gap-2 cursor-pointer">
              <Heart size={16} /> Interested
            </button>
          )}
          <button onClick={onNotInterested} className="w-full text-left p-3.5 rounded-2xl bg-offwhite dark:bg-darkbg text-navy dark:text-white font-bold text-[14px] flex items-center gap-2 cursor-pointer">
            <EyeOff size={16} /> Not interested
          </button>
          <button onClick={onNotInterested} className="w-full text-left p-3.5 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-[14px] flex items-center gap-2 cursor-pointer">
            <X size={16} /> I don't want to see it
          </button>
          {hasImage && (
            <button onClick={onSaveToGallery} className="w-full text-left p-3.5 rounded-2xl bg-offwhite dark:bg-darkbg text-navy dark:text-white font-bold text-[14px] flex items-center gap-2 cursor-pointer">
              <Download size={16} /> Save image to device
            </button>
          )}
          <button onClick={onCopyLink} className="w-full text-left p-3.5 rounded-2xl bg-offwhite dark:bg-darkbg text-navy dark:text-white font-bold text-[14px] flex items-center gap-2 cursor-pointer">
            <LinkIcon size={16} /> Copy post link
          </button>
          <button onClick={onReport} className="w-full text-left p-3.5 rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[14px] flex items-center gap-2 cursor-pointer">
            <Flag size={16} /> Report post
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricsRow({ likes, comments, shares }: { likes: number; comments: number; shares: number }) {
  const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n || 0);
  const l = fmt(likes || 0);
  const c = fmt(comments || 0);
  const s = fmt(shares || 0);

  if (!likes && !comments && !shares) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[12px] text-mute">
      <div className="flex items-center gap-4">
        {likes > 0 && <span className="flex items-center gap-1"><Heart size={12} className="text-red-500 fill-red-500"/> {l}</span>}
        {comments > 0 && <span className="flex items-center gap-1"><MessageCircle size={12} /> {c}</span>}
      </div>
      {shares > 0 && <span>{s} shares</span>}
    </div>
  );
}

function ActionBar({ isLiked, isSaved, onLike, onComment, onShare, onSave }: any) {
  const { play } = useSound();
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-darkline">
      <button data-silent onClick={() => { play('like'); onLike(); }} className={`flex flex-1 justify-center items-center gap-2 py-2 text-[13px] font-semibold cursor-pointer ${isLiked ? 'text-red-500' : 'text-mute'}`}>
        <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} /> Like
      </button>
      <button data-silent onClick={() => { play('comment'); onComment(); }} className="flex flex-1 justify-center items-center gap-2 py-2 text-[13px] font-semibold text-mute cursor-pointer">
        <MessageCircle size={18} /> Comment
      </button>
      <button data-silent onClick={() => { play('share'); onShare(); }} className="flex flex-1 justify-center items-center gap-2 py-2 text-[13px] font-semibold text-mute cursor-pointer">
        <Share2 size={18} /> Share
      </button>
      <button data-silent onClick={() => { play('tap'); onSave(); }} className={`flex justify-center items-center py-2 px-3 text-[13px] font-semibold cursor-pointer ${isSaved ? 'text-brand' : 'text-mute'}`}>
        <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
  }
