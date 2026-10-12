import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import { useI18n } from '../contexts/i18n';

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

export default function Notifications() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { setLoading(false); return; }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', me.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setItems((data || []) as Notif[]);
      setLoading(false);
    };
    load();
  }, []);

  const markAllRead = async () => {
    const me = await getCachedUser();
    if (!me) return;
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', me.id).eq('is_read', false);
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const openOne = async (n: Notif) => {
    const me = await getCachedUser();
    if (me && !n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.link_url) navigate(n.link_url);
  };

  if (loading) return <div className="p-4 text-center text-xs">{t('loading')}</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white flex-1">{t('notifications')}</h1>
        {items.some(n => !n.is_read) && (
          <button onClick={markAllRead} className="text-[10px] font-bold text-accent flex items-center gap-1">
            <Check size={11} /> {t('mark_all_read')}
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="bg-white dark:bg-darkcard rounded-2xl p-6 text-center shadow-sm">
          <Bell size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[11px] font-bold text-navy dark:text-white">{t('no_notifications')}</p>
        </div>
      )}

      {items.map(n => (
        <button
          key={n.id}
          onClick={() => openOne(n)}
          className={`w-full text-left bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-start gap-3 ${
            n.is_read ? 'opacity-70' : ''
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <Bell size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-navy dark:text-white">{n.title}</p>
            {n.body && (
              <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">{n.body}</p>
            )}
            <p className="text-[9px] text-gray-400 mt-1">
              {new Date(n.created_at).toLocaleString()}
            </p>
          </div>
          {!n.is_read && <span className="w-2 h-2 rounded-full bg-accent mt-1" />}
        </button>
      ))}
    </div>
  );
    }
