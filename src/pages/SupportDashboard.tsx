import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, HeadphonesIcon, Flag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

export default function SupportDashboard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [openTickets, setOpenTickets] = useState(0);
  const [activeDisputes, setActiveDisputes] = useState(0);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const [ticketsRes, disputesRes, recentRes] = await Promise.all([
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('status', 'open'),
        supabase.from('order_disputes').select('id', { count: 'exact', head: true }).eq('raised_by', me.id).neq('status', 'resolved'),
        supabase.from('support_tickets').select('id, subject, category, status, created_at').eq('user_id', me.id).order('created_at', { ascending: false }).limit(5),
      ]);

      setOpenTickets(ticketsRes.count || 0);
      setActiveDisputes(disputesRes.count || 0);
      setRecentTickets(recentRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('support_hub')}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={() => navigate('/contact-support')} className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 text-left cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent mb-2">
            <HeadphonesIcon size={16} />
          </div>
          <p className="text-[11px] font-bold text-navy dark:text-white">{t('open_tickets')}</p>
          <p className="text-[18px] font-black text-accent">{loading ? '—' : openTickets}</p>
        </button>
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3">
          <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 mb-2">
            <Flag size={16} />
          </div>
          <p className="text-[11px] font-bold text-navy dark:text-white">{t('active_disputes')}</p>
          <p className="text-[18px] font-black text-yellow-600">{loading ? '—' : activeDisputes}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 mb-3">
        <p className="text-[11px] font-bold text-navy dark:text-white mb-2">Talk to a Support Agent</p>
        <p className="text-[10px] text-gray-500 mb-3">
          For order help, escrow, refunds and account issues.
        </p>
        <button
          onClick={() => navigate('/contact-support')}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent text-white font-bold text-[12px] cursor-pointer"
        >
          <MessageCircle size={15} /> New support message
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden">
        <p className="px-3 pt-3 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          Recent
        </p>
        {recentTickets.length === 0 && !loading && (
          <p className="p-6 text-center text-[10px] text-gray-500">{t('no_messages_yet')}</p>
        )}
        {recentTickets.map(tk => (
          <button
            key={tk.id}
            onClick={() => navigate(`/contact-support/${tk.id}`)}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-t border-gray-100 dark:border-darkline text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
              <MessageCircle size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-navy dark:text-white truncate">{tk.subject || tk.category}</p>
              <p className="text-[9px] text-gray-500 truncate">{tk.category}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
