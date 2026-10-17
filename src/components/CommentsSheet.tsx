/* src/components/CommentsSheet.tsx */
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
};

type Props = {
  postId: string | null;
  me: string | null;
  onClose: () => void;
  onCommentAdded?: (postId: string) => void;
};

export default function CommentsSheet({ postId, me, onClose, onCommentAdded }: Props) {
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!postId) return;
    let alive = true;
    setItems(null);
    setText('');

    supabase
      .from('post_comments')
      .select('id, body, user_id, created_at, moderation_status')
      .eq('post_id', postId)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(50)
      .then(async ({ data }) => {
        if (!alive) return;
        const rows = (data || []) as CommentRow[];
        if (rows.length === 0) { setItems([]); return; }
        const ids = [...new Set(rows.map((r) => r.user_id))];
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, username')
          .in('id', ids);
        const map: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { map[p.id] = p.username; });
        if (!alive) return;
        setItems(rows.map((r) => ({ ...r, username: map[r.user_id] || 'user' })));
      });

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
            .select('username')
            .eq('id', m.user_id)
            .maybeSingle<{ username: string }>();
          setItems((prev) => {
            if (!prev) return prev;
            if (prev.some((c) => c.id === m.id)) return prev;
            return [...prev, { ...m, username: prof?.username || 'user' }];
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [postId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

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
    };
    setItems((p) => (p ? [...p, temp] : [temp]));

    const { error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: u, body });

    if (error) {
      setItems((p) => (p ? p.filter((c) => c.id !== temp.id) : p));
      alert(error.message);
    } else {
      onCommentAdded?.(postId);
    }
    setSending(false);
  };

  if (!postId) return null;

  const fmt = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] flex-col rounded-t-3xl bg-white dark:bg-darkcard animate-slide-up"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-darkline">
          <p className="text-[13px] font-bold text-navy dark:text-white">Comments</p>
          <button onClick={onClose} className="cursor-pointer" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items === null && (
            <>
              <div className="h-10 rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse" />
              <div className="h-10 rounded-lg bg-gray-200 dark:bg-white/10 animate-pulse" />
            </>
          )}
          {items?.length === 0 && (
            <p className="py-8 text-center text-gray-500 text-[11px]">No comments yet. Be the first.</p>
          )}
          {items?.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-accent/15 text-accent grid place-items-center font-bold text-[11px]">
                {(c.username || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="rounded-2xl bg-gray-100 dark:bg-white/10 px-3 py-2 inline-block max-w-full">
                  <div className="text-[10px] font-bold text-navy dark:text-white">
                    @{c.username || 'user'}
                  </div>
                  <div className="text-[11px] text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {c.body}
                  </div>
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5 pl-1">{fmt(c.created_at)}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="flex gap-2 border-t border-gray-100 dark:border-darkline p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Write a comment..."
            className="flex-1 rounded-full bg-gray-100 dark:bg-white/10 px-4 py-2 text-[12px] outline-none"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white disabled:opacity-40 cursor-pointer"
            aria-label="Send comment"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
            }
