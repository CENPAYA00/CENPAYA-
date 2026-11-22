import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check } from 'lucide-react';
import { d1Request } from '../lib/d1Api';
import { useI18n } from '../contexts/i18n';

type Notif = {
  id: string;
  notification_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  body: string | null;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
};

function notificationPath(item: Notif): string | null {
  if (item.link_url && item.link_url.startsWith("/") && !item.link_url.startsWith("//")) return item.link_url;
  if (!item.entity_id) return null;
  switch (item.entity_type) {
    case 'post': return `/post/${item.entity_id}`;
    case 'listing':
    case 'marketplace_listing': return `/listing/${item.entity_id}`;
    case 'user':
    case 'profile': return `/seller/${item.entity_id}`;
    case 'chat':
    case 'thread': return `/chat/${item.entity_id}`;
    default: return null;
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await d1Request<{ data: Notif[] }>('/api/notifications?limit=50');
      setItems(data || []);
    } catch (error) {
      console.error('Could not load notifications:', error);
      setItems([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const markOneRead = async (item: Notif) => {
    if (item.is_read) return;
    try {
      await d1Request<{ success: boolean }>(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: 'POST' });
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
    } catch (error) { console.error('Could not mark notification read:', error); }
  };

  const markAllRead = async () => {
    const unread = items.filter(item => !item.is_read);
    await Promise.all(unread.map(item => markOneRead(item)));
  };

  const openOne = async (item: Notif) => {
    await markOneRead(item);
    const path = notificationPath(item);
    if (path) navigate(path);
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
      {items.map(item => (
        <button key={item.id} onClick={() => openOne(item)}
          className={`w-full text-left bg-white dark:bg-darkcard rounded-2xl shadow-sm mb-2 p-3 flex items-start gap-3 ${item.is_read ? 'opacity-70' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0"><Bell size={15} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-navy dark:text-white">{item.title}</p>
            {item.body && <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">{item.body}</p>}
            <p className="text-[9px] text-gray-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
          </div>
          {!item.is_read && <span className="w-2 h-2 rounded-full bg-accent mt-1" />}
        </button>
      ))}
    </div>
  );
}
