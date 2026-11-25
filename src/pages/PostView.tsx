import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { d1Request } from '../lib/d1Api';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, Send } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { getBackground, backgroundStyle } from '../lib/postBackgrounds';
import { useI18n } from '../contexts/i18n';

export default function PostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [post, setPost] = useState<any>(null);
  const [author, setAuthor] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentAuthors, setCommentAuthors] = useState<Record<string, string>>({});
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<any>(null);

  const loadComments = async (postId: string) => {
    const result = await d1Request<{ data: any[] }>(`/api/posts/${encodeURIComponent(postId)}/comments`);
    const rows = result.data || [];
    setComments(rows);
    const map: Record<string, string> = {};
    rows.forEach((c: any) => { if (c.user_id) map[c.user_id] = c.username || 'User'; });
    setCommentAuthors(map);
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const u = await getCachedUser();
        setMe(u);
        const [postResult, stateResult] = await Promise.all([
          d1Request<{ data: any }>(`/api/posts/${encodeURIComponent(id)}`),
          d1Request<{ data?: { liked?: boolean; saved?: boolean } }>(`/api/posts/${encodeURIComponent(id)}/my-state`).catch(() => ({ data: undefined })),
        ]);
        const row = postResult.data;
        setPost(row);
        if (row?.author_id || row?.user_id) {
          const profile = await d1Request<{ data: any }>(`/api/profiles/${encodeURIComponent(row.author_id || row.user_id)}`);
          setAuthor(profile.data);
        }
        await loadComments(id);
        setLiked(!!stateResult.data?.liked);
        setSaved(!!stateResult.data?.saved);
      } catch (error: any) { alert(error.message || 'Could not load post'); }
      finally { setLoading(false); }
    };
    void load();
  }, [id]);

  const toggleLike = async () => {
    if (!post) return;
    const next = !liked;
    setLiked(next);
    setPost({ ...post, likes_count: Math.max(0, (post.likes_count || 0) + (next ? 1 : -1)) });
    try { await d1Request(`/api/posts/${encodeURIComponent(post.id)}/like`, { method: next ? 'POST' : 'DELETE' }); }
    catch (error: any) { setLiked(!next); setPost((p: any) => ({ ...p, likes_count: Math.max(0, (p.likes_count || 0) + (next ? -1 : 1)) })); alert(error.message || 'Could not update like'); }
  };

  const toggleSave = async () => {
    if (!post) return;
    const next = !saved;
    setSaved(next);
    try { await d1Request(`/api/posts/${encodeURIComponent(post.id)}/save`, { method: next ? 'POST' : 'DELETE' }); }
    catch (error: any) { setSaved(!next); alert(error.message || 'Could not update saved post'); }
  };

  const submitComment = async () => {
    if (!commentInput.trim() || !id) return;
    setSending(true);
    try {
      const u = me || await getCachedUser();
      if (!u) throw new Error('Please log in to comment.');
      await d1Request(`/api/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ body: commentInput.trim() }) });
      setCommentInput('');
      await loadComments(id);
      if (post) setPost({ ...post, comments_count: (post.comments_count || 0) + 1 });
    } catch (error: any) { alert(error.message || 'Could not post comment'); }
    finally { setSending(false); }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = `https://cenpaya.pages.dev/post/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: 'CenPaya post' }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    }
    try { await d1Request(`/api/posts/${encodeURIComponent(post.id)}/share`, { method: 'POST', body: JSON.stringify({ channel: 'external' }) }); } catch {}
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;
  if (!post) return <div className="p-4 text-center text-xs">{t('no_results')}</div>;

  const isColored = post.post_type === 'colored' && post.bg_color && !post.image_url;
  const bg = isColored ? getBackground(post.bg_color) : null;
  const images: string[] = post.image_url
    ? post.image_url.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-sm font-bold text-navy dark:text-white flex-1">{t('post')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden">
        <div className="p-3 flex items-center gap-2">
          <button onClick={() => navigate(`/seller/${(post.author_id || post.user_id)}`)} className="flex items-center gap-2 cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">
              {author?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="text-left">
              <p className="text-[11px] font-bold text-navy dark:text-white">@{author?.username || 'User'}</p>
              <p className="text-[9px] text-gray-400">{new Date(post.created_at).toLocaleString()}</p>
            </div>
          </button>
        </div>

        {isColored && bg ? (
          <div style={backgroundStyle(bg)} className={`${bg.bgClass} py-12 px-6 min-h-[220px] flex items-center justify-center`}>
            <p className={`text-lg font-bold ${bg.textClass} text-center whitespace-pre-wrap leading-relaxed max-w-md`}>
              {post.content}
            </p>
          </div>
        ) : (
          <>
            {post.content && (
              <p className="px-3 pb-3 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{post.content}</p>
            )}
            {images.length === 1 && <img src={images[0]} alt="" className="w-full" />}
            {images.length > 1 && (
              <div className={`grid gap-0.5 ${images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {images.map((u: string, i: number) => (
                  <img key={i} src={u} alt="" className="w-full aspect-square object-cover" />
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-around border-t border-gray-100 dark:border-darkline">
          <button onClick={toggleLike} className={`flex items-center gap-1 py-2.5 text-[11px] font-bold cursor-pointer ${liked ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} /> {post.likes_count || 0}
          </button>
          <div className="flex items-center gap-1 py-2.5 text-[11px] font-bold text-gray-600 dark:text-gray-300">
            <MessageCircle size={15} /> {post.comments_count || 0}
          </div>
          <button onClick={handleShare} className="flex items-center gap-1 py-2.5 text-[11px] font-bold text-gray-600 dark:text-gray-300 cursor-pointer">
            <Share2 size={15} /> {t('share')}
          </button>
          <button onClick={toggleSave} className={`flex items-center gap-1 py-2.5 text-[11px] font-bold cursor-pointer ${saved ? 'text-accent' : 'text-gray-600 dark:text-gray-300'}`}>
            <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm mt-3 p-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">
          {t('comments')} ({comments.length})
        </p>

        {comments.length === 0 && (
          <p className="text-[10px] text-gray-400 py-3 text-center">{t('no_comments')}</p>
        )}

        {comments.map(c => (
          <div key={c.id} className="mb-3 last:mb-0">
            <p className="text-[10px] font-bold text-navy dark:text-white">
              @{commentAuthors[c.user_id] || 'User'}
            </p>
            <p className="text-[11px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{c.body}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleString()}</p>
          </div>
        ))}

        <div className="flex gap-2 mt-3 border-t border-gray-100 dark:border-darkline pt-3">
          <input
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            placeholder={t('write_comment')}
            className="flex-1 p-2 bg-gray-50 dark:bg-darkbg border border-gray-200 dark:border-darkline rounded-full text-xs"
          />
          <button
            onClick={submitComment}
            disabled={!commentInput.trim() || sending}
            className="bg-accent text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40 cursor-pointer"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
    }
