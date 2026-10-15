import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, MessageCircle, ChevronRight, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import Select from '../components/Select';
import { ALL_SUPPORT_CATEGORIES } from '../constants/supportCategories';

export default function ContactAdmin() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    const me = await getCachedUser();
    if (!me) { setLoading(false); return; }
    const { data } = await supabase
      .from('support_tickets')
      .select('id, category, subject, status, created_at')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white flex-1">Contact Admin</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 cursor-pointer"
        >
          <Plus size={12} /> New
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 mb-3">
        <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
          Use this for <strong>official platform matters</strong> — policy questions, appeals, verification, or concerns about the CenPaya team itself.
          <br /><br />
          For orders, escrow, refunds, or account issues, please use <strong>Contact Support Agents</strong> instead.
        </p>
      </div>

      {loading && <p className="text-center text-xs text-gray-400 py-6">Loading...</p>}

      {!loading && tickets.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <MessageCircle size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">No messages yet</p>
          <p className="text-[10px] text-gray-500 mt-1">Tap "New" to send a message to the admin team.</p>
        </div>
      )}

      {tickets.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(`/contact-admin/${t.id}`)}
          className="w-full bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-center gap-3 text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <MessageCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-navy dark:text-white truncate">{t.subject || t.category}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{t.category}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                t.status === 'open' ? 'bg-yellow-100 text-yellow-700'
                : t.status === 'closed' ? 'bg-gray-200 text-gray-600'
                : 'bg-green-100 text-green-700'
              }`}>
                {t.status || 'open'}
              </span>
              <span className="text-[9px] text-gray-400">
                {new Date(t.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <ChevronRight size={14} className="text-gray-400 shrink-0" />
        </button>
      ))}

      {showNew && (
        <NewMessageSheet
          onClose={() => setShowNew(false)}
          onSent={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function NewMessageSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    setErr('');
    if (!category) return setErr('Pick a category.');
    if (!subject.trim()) return setErr('Add a subject.');
    if (message.trim().length < 5) return setErr('Message is too short.');

    setBusy(true);
    const me = await getCachedUser();
    if (!me) { setBusy(false); return setErr('Not signed in.'); }

    const { error } = await supabase.from('support_tickets').insert({
      user_id: me.id,
      category,
      subject: subject.trim(),
      body: message.trim(),
      status: 'open',
      created_at: new Date().toISOString(),
    });

    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">New message to admin</p>
          <button onClick={onClose} className="cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-3 space-y-3">
          <p className="text-[10px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 leading-relaxed">
            For order/escrow/refund help, please use <strong>Contact Support Agents</strong> instead.
          </p>
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            options={ALL_SUPPORT_CATEGORIES}
            placeholder="Choose a category"
          />
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
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              placeholder="Describe your issue in detail..."
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
            />
          </div>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
          <button
            onClick={send}
            disabled={busy}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send size={14} /> {busy ? 'Sending...' : 'Send to admin'}
          </button>
        </div>
      </div>
    </div>
  );
      }
