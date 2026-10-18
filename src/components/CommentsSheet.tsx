import { useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';

type CommentRow = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  moderation_status: string;
  username?: string;
  avatar_url?: string | null;
  pending?: boolean;
};

type Props = {
  postId: string | null;
  me: string | null;
  onClose: () => void;
  onCommentAdded?: (postId: string) => void;
};

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function CommentsSheet({ postId, me, onClose, onCommentAdded }: Props) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // FETCH COMMENTS
  useEffect(() => {
    if (!postId) return;
    let alive = true;
    setLoading(true);
    setText('');

    const fetchComments = async () => {
      const { data } = await supabase
        .from('post_comments')
        .select('id, body, user_id, created_at, moderation_status')
        .eq('post_id', postId)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: true })
        .limit(100);

      if (!alive) return;
      const rows = (data || []) as CommentRow[];
      if (rows.length === 0) { setItems([]); setLoading(false); return; }

      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url')
        .in('id', ids);

      const map: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p; });

      if (!alive) return;
      setItems(rows.map((r) => ({
        ...r,
        username: map[r.user_id]?.username || 'user',
        avatar_url: map[r.user_id]?.avatar_url || null,
      })));
      setLoading(false);
    };

    fetchComments();

    // REALTIME LISTENER
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        async (payload) => {
          const m = payload.new as CommentRow;
          if (m.moderation_status !== 'approved') return;
          
          const { data: prof } = await supabase
            .from('public_profiles')
            .select('username, avatar_url')
            .eq('id', m.user_id)
            .maybeSingle();

          setItems((prev) => {
            if (!prev) return prev;
            if (prev.some((c) => c.id === m.id)) return prev;
            return [...prev, { ...m, username: prof?.username || 'user', avatar_url: prof?.avatar_url }];
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [postId]);

  // AUTO SCROLL TO BOTTOM
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [items.length]);

  // LOCK BODY SCROLL
  useEffect(() => {
    if (!postId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [postId, onClose]);

  const send = async () => {
    const body = text.trim();
    if (!body || !postId) return;
    const u = me || (await getCachedUser())?.id;
    if (!u) { alert('Please log in to comment.'); return; }
    
    setSending(true);
    setText('');

    const temp: CommentRow = {
      id: 't' + Date.now(),
      body,
      user_id: u,
      created_at: new Date().toISOString(),
      moderation_status: 'approved',
      username: 'You',
      pending: true,
    };
    
    setItems((p) => [...p, temp]);
    onCommentAdded?.(postId);

    const { error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: u, body });

    if (error) {
      setItems((p) => p.filter((c) => c.id !== temp.id));
      setText(body);
    } else {
      // Remove the temp message (the realtime listener will add the real one with proper username/avatar)
      setItems((p) => p.filter((c) => c.id !== temp.id));
    }
    setSending(false);
  };

  if (!postId) return null;

  return (
    // CLAUDE'S Z-INDEX FIX: z-[1200] forces this above the bottom nav
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] mx-auto h-[min(80dvh,680px)] bg-white dark:bg-darkcard rounded-t-[24px] shadow-[0_-8px_30px_rgba(6,40,28,0.2)] flex flex-col animate-slide-up"
      >
        {/* DRAG HANDLE */}
        <div className="w-11 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 shrink-0" />

        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkline shrink-0">
          <p className="text-[18px] font-bold text-navy dark:text-white">Comments</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-darkline flex items-center justify-center cursor-pointer text-gray-600 dark:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* COMMENTS LIST */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
          {loading && <div className="text-center text-gray-500 py-10 text-[14px]">Loading comments...</div>}
          
          {!loading && items.length === 0 && (
            <div className="text-center text-gray-500 py-10 text-[14px]">No comments yet. Be the first!</div>
          )}

          {items.map((c) => (
            <div key={c.id} className={`flex gap-2.5 ${c.pending ? 'opacity-60' : ''}`}>
              <div className="w-9 h-9 shrink-0 rounded-full bg-[#12935a]/10 text-[#12935a] grid place-items-center font-bold text-[14px] overflow-hidden">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (c.username || 'U')[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="rounded-2xl bg-gray-100 dark:bg-darkline px-3.5 py-2 inline-block max-w-full">
                  <div className="text-[13px] font-bold text-navy dark:text-white">
                    @{c.username || 'user'}
                  </div>
                  <div className="text-[14px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words mt-0.5">
                    {c.body}
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 mt-1 pl-1">{ago(c.created_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* INPUT BAR (PINNED TO BOTTOM) */}
        <div className="flex items-end gap-2 p-3 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline pb-[calc(env(safe-area-inset-bottom,0px)+12px)] shrink-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } }}
            placeholder="Write a comment..."
            rows={1}
            className="flex-1 bg-gray-100 dark:bg-darkline rounded-[22px] px-4 py-3 text-[15px] text-navy dark:text-white outline-none resize-none max-h-24 border border-transparent focus:border-[#12935a]"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="w-11 h-11 shrink-0 rounded-full bg-[#12935a] text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
                                }
