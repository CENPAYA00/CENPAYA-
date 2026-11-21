import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { Search, Shield, Crown, ShieldAlert } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await supabaseWorkerRequest<{ data: any[] }>('/api/admin/users?limit=200');
      const profiles = result.data || [];
      const ids = profiles.map((user: any) => user.id).filter(Boolean);
      const { data: membershipRows } = ids.length
        ? await supabase.from('users').select('id, is_subscribed, is_membership_exempt').in('id', ids)
        : { data: [] };
      const membershipById: Record<string, any> = {};
      (membershipRows || []).forEach((row: any) => { membershipById[row.id] = row; });
      setUsers(profiles.map((user: any) => ({
        ...user,
        ...(membershipById[user.id] || {}),
      })).sort((a: any, b: any) => Number(!!b.is_subscribed) - Number(!!a.is_subscribed)));
    } catch (error) {
      console.warn('Could not load users', error);
      setUsers([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePremium = async (user: any) => {
    // Prevent revoking paid members
    if (user.is_subscribed && !user.is_membership_exempt) {
      return alert("You cannot revoke premium from a user who paid. They must cancel it themselves or contact support.");
    }
    
    const newStatus = !user.is_membership_exempt;
    await supabase.from('users').update({ is_membership_exempt: newStatus }).eq('id', user.id);
    load();
  };

  const changeRole = async (user: any, newRole: string) => {
    if (!confirm(`Change @${user.username} role to ${newRole}?`)) return;
    try {
      await supabaseWorkerRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', body: JSON.stringify({ role: newRole }),
      });
      load();
    } catch (error: any) { alert(error.message || 'Could not update role'); }
  };

  const filtered = users.filter(u => 
    u.username?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">👥 User Management</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{users.length} users · Paid members first</p>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search by username or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      {filtered.map(u => (
        <div key={u.id} className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold shrink-0">
            {u.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">@{u.username}</p>
              {(u.is_subscribed || u.is_membership_exempt) && <Crown size={12} className="text-gold" />}
            </div>
            <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
            <p className="text-[9px] text-gray-400">{u.country_iso} · {u.role || 'user'}</p>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Role Changer */}
            <select
              value={u.role || 'user'}
              onChange={(e) => changeRole(u, e.target.value)}
              className="text-[10px] bg-gray-100 dark:bg-darkline p-1 rounded font-bold outline-none"
            >
              <option value="user">User</option>
              <option value="support_agent">Staff</option>
              <option value="super_admin">Admin</option>
            </select>

            {/* Premium Toggle */}
            <button
              onClick={() => togglePremium(u)}
              className={`p-1.5 rounded-lg ${u.is_membership_exempt ? 'bg-gold/15 text-gold' : 'bg-gray-100 dark:bg-darkline text-gray-400'}`}
              title={u.is_subscribed ? "Paid Member (Cannot revoke)" : "Toggle Free Premium"}
              disabled={u.is_subscribed} // Lock paid members
            >
              <Crown size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
            }
