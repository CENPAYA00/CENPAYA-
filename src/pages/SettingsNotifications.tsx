import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { d1Request } from '../lib/d1Api';

type Pref = 'email' | 'sms' | 'push' | 'follows' | 'comments' | 'orders';
export default function SettingsNotifications() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Record<Pref, boolean>>({ email: true, sms: true, push: true, follows: true, comments: true, orders: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    d1Request<{ data?: Record<string, boolean> }>('/api/me/notification-preferences')
      .then(r => { if (r.data) setPrefs(p => ({ ...p, ...r.data })); })
      .catch((e: any) => alert(e.message || 'Could not load notification preferences'))
      .finally(() => setLoading(false));
  }, []);
  const toggle = (k: Pref) => setPrefs(p => ({ ...p, [k]: !p[k] }));
  const save = async () => {
    setSaving(true);
    try { await d1Request('/api/me/notification-preferences', { method: 'PATCH', body: JSON.stringify(prefs) }); alert('Saved'); }
    catch (e: any) { alert(e.message || 'Could not save preferences'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  const rows: { key: Pref; label: string; sub: string }[] = [
    { key: 'push', label: 'Push notifications', sub: 'In-app alerts on your device' },
    { key: 'email', label: 'Email notifications', sub: 'Receive alerts by email' },
    { key: 'sms', label: 'SMS notifications', sub: 'Receive alerts by SMS' },
    { key: 'follows', label: 'New followers', sub: 'When someone follows you' },
    { key: 'comments', label: 'Comments', sub: 'When someone comments on your posts' },
    { key: 'orders', label: 'Orders', sub: 'Order and escrow updates' },
  ];
  return <div className="px-3 py-3 pb-24">
    <div className="flex items-center gap-2 mb-3"><button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button><h1 className="text-base font-bold text-navy dark:text-white">Notifications</h1></div>
    <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden mb-3">
      {rows.map((r, i) => <div key={r.key} className={`p-3 flex items-center justify-between ${i > 0 ? 'border-t border-gray-100 dark:border-darkline' : ''}`}>
        <div><p className="text-[12px] font-bold text-navy dark:text-white">{r.label}</p><p className="text-[10px] text-gray-500">{r.sub}</p></div>
        <button onClick={() => toggle(r.key)} className={`relative w-11 h-6 rounded-full transition-colors ${prefs[r.key] ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${prefs[r.key] ? 'translate-x-5' : ''}`} /></button>
      </div>)}
    </div>
    <button onClick={save} disabled={saving} className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50 flex items-center justify-center gap-1"><Check size={14} /> {saving ? 'Saving...' : 'Save preferences'}</button>
  </div>;
}
