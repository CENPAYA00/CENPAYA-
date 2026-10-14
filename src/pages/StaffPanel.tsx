import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Shield, MessageSquare, Clock, Check, User as UserIcon, Inbox, ArrowLeft, Flag } from 'lucide-react';

const PERMISSION_LABELS: Record<string, string> = {
  can_resolve_disputes: 'Resolve Disputes',
  can_ban_users: 'Ban Users',
  can_review_kyc: 'Review KYC',
  can_view_finances: 'View Platform Finances',
  can_manage_listings: 'Manage Listings',
  can_manage_tickets: 'Manage Support Tickets',
  can_review_reports: 'Review Reports',
};

export default function StaffPanel() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [profileRes, ticketsRes] = await Promise.all([
      supabase.rpc('staff_my_profile'),
      supabase.rpc('staff_list_tickets', { p_scope: tab }),
    ]);

    if (!profileRes.data?.ok) {
      navigate('/home');
      return;
    }
    setProfile(profileRes.data);
    setTickets(ticketsRes.data?.tickets || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  const claim = async (ticketId: string) => {
    const { error } = await supabase.rpc('staff_claim_ticket', { p_ticket_id: ticketId });
    if (error) alert(error.message);
    else load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate('/home')} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white flex-1">Staff Panel</h1>
        <button onClick={() => navigate('/admin')}
          className="bg-navy dark:bg-accent text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
          <Shield size={11} /> Admin
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-4 mb-3">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Your role</p>
        <p className="text-[15px] font-black text-navy dark:text-white capitalize mb-2">
          {profile?.role?.replace('_', ' ')}
        </p>
        {Array.isArray(profile?.permissions) && profile.permissions.length > 0 && (
          <>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Permissions</p>
            <div className="flex flex-wrap gap-1">
              {profile.permissions.map((p: string) => (
                <span key={p} className="text-[9px] font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {PERMISSION_LABELS[p] || p}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex bg-gray-100 dark:bg-darkcard rounded-xl p-1 mb-3">
        {(['all', 'mine'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg capitalize ${
              tab === k ? 'bg-white dark:bg-darkbg text-navy dark:text-white shadow-sm' : 'text-gray-500'
            }`}>
            {k === 'all' ? 'All open' : 'Assigned to me'}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={() => navigate('/admin/inbox')}
          className="flex-1 bg-white dark:bg-darkcard rounded-xl shadow-sm p-3 flex items-center gap-2">
          <Inbox size={14} className="text-accent" />
          <span className="text-[11px] font-bold text-navy dark:text-white">Inbox</span>
        </button>
        <button onClick={() => navigate('/admin/reports')}
          className="flex-1 bg-white dark:bg-darkcard rounded-xl shadow-sm p-3 flex items-center gap-2">
          <Flag size={14} className="text-red-500" />
          <span className="text-[11px] font-bold text-navy dark:text-white">Reports</span>
        </button>
      </div>

      {tickets.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-2xl shadow-sm text-center">
          <MessageSquare size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] font-bold text-navy dark:text-white">
            {tab === 'mine' ? 'No tickets assigned to you' : 'No open tickets'}
          </p>
        </div>
      )}

      {tickets.map(t => (
        <div key={t.id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0">
              <MessageSquare size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">{t.subject}</p>
              <p className="text-[10px] text-gray-500">@{t.username}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[9px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                  {t.priority}
                </span>
                <span className="text-[9px] text-gray-400">{t.category}</span>
                {t.unread > 0 && (
                  <span className="text-[9px] font-bold bg-accent text-white px-1.5 py-0.5 rounded-full">
                    {t.unread} new
                  </span>
                )}
                {t.assigned_to_me && (
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    Assigned to you
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/admin/inbox/${t.id}`)}
              className="flex-1 bg-navy dark:bg-accent text-white text-[10px] font-bold py-2 rounded-lg">
              Open ticket
            </button>
            {!t.assigned_to_me && (
              <button onClick={() => claim(t.id)}
                className="flex-1 bg-accent/10 text-accent text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1">
                <Check size={11} /> Claim
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
