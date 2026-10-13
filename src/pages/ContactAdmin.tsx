import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, MessageCircle, Clock, X, ChevronRight } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ContactAdmin() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const { data } = await supabase.rpc('list_my_tickets');
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }
      const { data: cats } = await supabase
        .from('ticket_categories')
        .select('id, category_name, handling_priority')
        .order('handling_priority');
      setCategories(cats || []);
      if (cats && cats.length > 0) setCategoryId(cats[0].id);
      load();
    };
    init();
  }, []);

  const createTicket = async () => {
    setErr('');
    if (subject.trim().length < 3) return setErr('Subject must be at least 3 characters.');
    if (body.trim().length < 10) return setErr('Message must be at least 10 characters.');

    setCreating(true);
    const { data, error } = await supabase.rpc('create_ticket', {
      p_subject: subject.trim(),
      p_body: body.trim(),
      p_category_id: categoryId || null,
      p_associated_order_id: null,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Could not open ticket.');
      setCreating(false);
      return;
    }
    setShowNew(false);
    setSubject('');
    setBody('');
    navigate(`/contact-admin/${data.ticket_id}`);
    setCreating(false);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white flex-1">Contact Admin</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
        >
          <Plus size={12} /> New
        </button>
      </div>

      {tickets.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 shadow-sm text-center">
          <MessageCircle size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No conversations yet</p>
          <p className="text-[9px] text-gray-500 mt-1">
            Tap "New" to send a message to the admin team.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-3 bg-accent text-white text-[10px] font-bold px-4 py-2 rounded-lg"
          >
            Start a conversation
          </button>
        </div>
      )}

      {tickets.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(`/contact-admin/${t.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-start gap-3 text-left"
        >
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <MessageCircle size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate flex-1">{t.subject}</p>
              {t.unread > 0 && (
                <span className="text-[9px] font-bold bg-accent text-white px-1.5 py-0.5 rounded-full">
                  {t.unread}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{t.last_message || '—'}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                t.status === 'open' ? 'bg-yellow-100 text-yellow-700' :
                t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                t.status === 'resolved' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t.status}
              </span>
              <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                <Clock size={9} /> {new Date(t.updated_at || t.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <ChevronRight size={14} className="text-gray-400 mt-2" />
        </button>
      ))}

      {showNew && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setShowNew(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
          >
            <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
              <p className="text-[13px] font-bold text-navy dark:text-white">New message to admin</p>
              <button onClick={() => setShowNew(false)}><X size={18} /></button>
            </div>

            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Category</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.category_name.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Brief summary"
                  className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={5}
                  placeholder="Describe your issue in detail..."
                  className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
                />
              </div>

              {err && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-2 rounded-lg">{err}</div>
              )}

              <button
                onClick={createTicket}
                disabled={creating}
                className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
              >
                {creating ? 'Sending...' : 'Send to admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
      }
