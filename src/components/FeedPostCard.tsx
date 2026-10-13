import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Share2, Globe, X, MoreHorizontal,
  Bookmark, Send, EyeOff, Flag, Download, Link as LinkIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { getBackground, backgroundStyle } from '../lib/postBackgrounds';
import ImageGrid from './ImageGrid';
import DocumentCard from './DocumentCard';
import ReportSheet from './ReportSheet';

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
  post, isLiked, isSaved, onLike, onComment, onShare, onSave, onHide,
}: Props) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (hidden) return null;

  const images: string[] = Array.isArray(post.image_url)
    ? post.image_url
    : post.image_url
    ? post.image_url.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const docs: string[] = Array.isArray(post.documents) ? post.documents : [];

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const notInterested = async () => {
    setShowPostMenu(false);
    setHidden(true);
    onHide?.(post.id);
    try {
      const me = await getCachedUser();
      if (me) {
        await supabase.from('not_interested_posts').upsert({
          user_id: me.id,
          post_id: post.id,
        });
      }
    } catch (e) {
      console.warn('not_interested record failed', e);
    }
  };

  const saveToGallery = async () => {
    setShowPostMenu(false);
    if (images.length === 0) {
      showToast('This post has no image to save.');
      return;
    }
    try {
      const url = images[0];
      const res = await fetch(url);
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
    } catch (e) {
      console.warn('save to gallery failed', e);
      showToast('Could not save image. Long-press it instead.');
    }
  };

  const copyLink = async () => {
    setShowPostMenu(false);
    const url = `https://cenpaya.pages.dev/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      prompt('Copy this link:', url);
    }
  };

  const openShareSheet = async () => {
    setShowShareSheet(true);
    const me = await getCachedUser();
    if (!me) return;

    const { data: myChannels } = await supabase
      .from('chat_participants')
      .select('channel_id')
      .eq('user_id', me.id);

    if (!myChannels || myChannels.length === 0) return;
    const ids = myChannels.map((c: any) => c.channel_id);

    const { data: others } = await supabase
      .from('chat_participants')
      .select('channel_id, user_id')
      .in('channel_id', ids)
      .neq('user_id', me.id);

    const otherIds = [...new Set((others || []).map((o: any) => o.user_id))];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, username')
      .in('id', otherIds);

    const map: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { map[p.id] = p.username; });

    setChannels((others || []).map((o: any) => ({
      channel_id: o.channel_id,
      username: map[o.user_id] || 'User',
    })));
  };

  const shareToChannel = async (channelId: string) => {
    setSharing(true);
    const me = await getCachedUser();
    if (!me) { setSharing(false); return; }

    await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: me.id,
      body: '📎 Shared a post',
      message_type: 'shared_post',
      shared_post_id: post.id,
    });

    onShare(post.id);
    setSharing(false);
    setShowShareSheet(false);
    showToast('Sent');
  };

  const Toast = toast ? (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[11px] font-bold px-4 py-2 rounded-full z-[250]">
      {toast}
    </div>
  ) : null;

  if (post.post_type === 'colored' && post.bg_color && images.length === 0) {
    const bg = getBackground(post.bg_color);
    return (
      <>
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
          <Header
            post={post}
            onClose={() => setHidden(true)}
            onProfile={() => navigate(`/seller/${post.user_id}`)}
            onMenu={() => setShowPostMenu(true)}
          />
          <div
            onClick={() => navigate(`/post/${post.id}`)}
            style={backgroundStyle(bg)}
            className={`cursor-pointer ${bg.bgClass} py-12 px-6 flex items-center justify-center min-h-[200px]`}
          >
            <p className={`text-lg font-bold ${bg.textClass} text-center whitespace-pre-wrap leading-relaxed max-w-md`}>
              {post.content}
            </p>
          </div>
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

        {showShareSheet && (
          <ShareSheet
            channels={channels}
            sharing={sharing}
            onPick={shareToChannel}
            onClose={() => setShowShareSheet(false)}
          />
        )}

        {showPostMenu && (
          <PostMenu
            hasImage={images.length > 0}
            onClose={() => setShowPostMenu(false)}
            onNotInterested={notInterested}
            onReport={() => { setShowPostMenu(false); setShowReport(true); }}
            onSaveToGallery={saveToGallery}
            onCopyLink={copyLink}
          />
        )}

        {showReport && (
          <ReportSheet
            targetType="post"
            targetId={post.id}
            onClose={() => setShowReport(false)}
          />
        )}

        {Toast}
      </>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-3 overflow-hidden">
        <Header
          post={post}
          onClose={() => setHidden(true)}
          onProfile={() => navigate(`/seller/${post.user_id}`)}
          onMenu={() => setShowPostMenu(true)}
        />

        {post.content && (
          <p className="px-3 pb-3 text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {images.length > 0 && <ImageGrid images={images} />}

        {docs.length > 0 && (
          <div className="px-3 pb-2">
            {docs.map((url, i) => (
              <DocumentCard key={i} url={url} />
            ))}
          </div>
        )}

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

      {showShareSheet && (
        <ShareSheet
          channels={channels}
          sharing={sharing}
          onPick={shareToChannel}
          onClose={() => setShowShareSheet(false)}
        />
      )}

      {showPostMenu && (
        <PostMenu
          hasImage={images.length > 0}
          onClose={() => setShowPostMenu(false)}
          onNotInterested={notInterested}
          onReport={() => { setShowPostMenu(false); setShowReport(true); }}
          onSaveToGallery={saveToGallery}
          onCopyLink={copyLink}
        />
      )}

      {showReport && (
        <ReportSheet
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}

      {Toast}
    </>
  );
}

function PostMenu({
  hasImage, onClose, onNotInterested, onReport, onSaveToGallery, onCopyLink,
}: {
  hasImage: boolean;
  onClose: () => void;
  onNotInterested: () => void;
  onReport: () => void;
  onSaveToGallery: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between">
          <p className="text-[13px] font-bold text-navy dark:text-white">Post</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-3 space-y-2">
          <button
            onClick={onNotInterested}
            className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2"
          >
            <EyeOff size={14} /> I don't want to see this
          </button>

          {hasImage && (
            <button
              onClick={onSaveToGallery}
              className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2"
            >
              <Download size={14} /> Save image to device
            </button>
          )}

          <button
            onClick={onCopyLink}
            className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-darkbg text-navy dark:text-white font-bold text-[12px] flex items-center gap-2"
          >
            <LinkIcon size={14} /> Copy post link
          </button>

          <button
            onClick={onReport}
            className="w-full text-left p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 font-bold text-[12px] flex items-center gap-2"
          >
            <Flag size={14} /> Report post
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareSheet({ channels, sharing, onPick, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex justify-between items-center">
          <p className="text-[11px] font-bold text-navy dark:text-white">Share to chat</p>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        {channels.length === 0 && (
          <p className="text-center text-[10px] text-gray-400 py-6">No conversations yet</p>
        )}
        {channels.map((c: any) => (
          <button
            key={c.channel_id}
            disabled={sharing}
            onClick={() => onPick(c.channel_id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 active:bg-gray-50 disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">
              {c.username?.[0]?.toUpperCase()}
            </div>
            <span className="flex-1 text-left text-[11px] font-bold text-navy dark:text-white">
              @{c.username}
            </span>
            <Send size={14} className="text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({ post, onClose, onProfile, onMenu }: { post: any; onClose: () => void; onProfile: () => void; onMenu: () => void }) {
  return (
    <div className="p-3 flex items-center gap-2">
      <button onClick={onProfile} className="flex items-center gap-2 flex-1 text-left">
        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-sm font-bold text-accent overflow-hidden">
          {post.avatar_url ? (
            <img src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            post.username?.[0]?.toUpperCase() || 'U'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-navy dark:text-white truncate">@{post.username}</p>
          <div className="flex items-center gap-1 text-[9px] text-gray-500">
            <Globe size={9} />
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </button>
      <button onClick={onClose} aria-label="Hide post" className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100">
        <X size={14} />
      </button>
      <button onClick={onMenu} aria-label="More options" className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100">
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

function MetricsRow({ likes, comments, shares }: { likes: number; comments: number; shares: number }) {
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
      <button onClick={onLike} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98]">
        <Heart size={14} className={isLiked ? 'fill-red-500 text-red-500' : ''} /> Like
      </button>
      <button onClick={onComment} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98]">
        <MessageCircle size={14} /> Comment
      </button>
      <button onClick={onShare} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98]">
        <Share2 size={14} /> Share
      </button>
      <button onClick={onSave} className="flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-darkbg active:scale-[0.98]">
        <Bookmark size={14} className={isSaved ? 'fill-accent text-accent' : ''} /> Save
      </button>
    </div>
  );
    }
