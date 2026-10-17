import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { MessageSquare, Check, Shield } from 'lucide-react';

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

  if (loading) return <div className="p-8 text-center text-[13px] text-[#6f8077]">Loading...</div>;

  return (
    <div className="pb-24 max-w-4xl mx-auto pt-4">
      
      {/* Profile Card */}
      <div className="bg-white dark:bg-darkcard rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-4 mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077] mb-1">Your role</p>
        <p className="text-[20px] font-bold text-[#0a3d2b] dark:text-white capitalize mb-3">
          {profile?.role?.replace('_', ' ')}
        </p>
        {Array.isArray(profile?.permissions) && profile.permissions.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6f8077] mb-2">Permissions</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.permissions.map((p: string) => (
                <span key={p} className="text-[11px] font-semibold bg-[#e3f7ec] text-[#12935a] px-2.5 py-1 rounded-md">
                  {p.replace(/^can_/, '').replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Segmented Tab Control */}
      <div className="grid grid-cols-2 bg-[#e9eeeb] dark:bg-darkline rounded-[14px] p-1 mb-4 shadow-inner">
        {(['all', 'mine'] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 text-[13px] font-semibold rounded-[10px] transition-all ${
              tab === k ? 'bg-white dark:bg-darkcard text-[#0a3d2b] dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#6f8077]'
            }`}
          >
            {k === 'all' ? 'All open' : 'Assigned to me'}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {tickets.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-8 rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] text-center">
          <MessageSquare size={32} className="mx-auto text-[#b4c0ba] mb-3" />
          <p className="text-[15px] font-bold text-[#0a3d2b] dark:text-white">
            {tab === 'mine' ? 'No tickets assigned to you' : 'No open tickets'}
          </p>
        </div>
      )}

      {/* Ticket Cards */}
      <div className="space-y-3">
        {tickets.map(t => (
          <div key={t.id} className="bg-white dark:bg-darkcard rounded-[16px] shadow-[0_1px_4px_rgba(10,61,43,0.08)] p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#e3f7ec] flex items-center justify-center text-[#12935a] shrink-0">
                <MessageSquare size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-[#0a3d2b] dark:text-white truncate">{t.subject}</p>
                <p className="text-[12px] text-[#6f8077] font-medium mt-0.5">@{t.username}</p>
                
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold bg-[#fff9e0] text-[#8a5a00] px-2 py-0.5 rounded-md border border-[#f3e08a]">
                    {t.priority}
                  </span>
                  <span className="text-[11px] font-medium text-[#6f8077]">{t.category}</span>
                  {t.unread > 0 && (
                    <span className="text-[10px] font-bold bg-[#12935a] text-white px-2 py-0.5 rounded-full">
                      {t.unread} new
                    </span>
                  )}
                  {t.assigned_to_me && (
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                      Assigned to you
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/staff/tickets/${t.id}`)}
                className="flex-1 bg-[#0a3d2b] text-white text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Shield size={14} /> Open ticket
              </button>
              {!t.assigned_to_me && (
                <button
                  onClick={() => claim(t.id)}
                  className="flex-1 bg-[#e3f7ec] text-[#12935a] text-[13px] font-semibold py-2.5 rounded-[12px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Check size={14} /> Claim
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
