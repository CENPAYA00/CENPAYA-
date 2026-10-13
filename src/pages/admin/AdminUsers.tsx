import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Search, Ban, Check, Crown, Shield, MoreVertical, X, Filter
} from 'lucide-react';

type UserRow = {
  id: string;
  username: string;
  email: string;
  role: string;
  banned: boolean;
  is_subscribed: boolean;
  is_membership_exempt: boolean;
  country_iso: string | null;
  followers_count: number;
  created_at: string;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [bannedOnly, setBannedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [actionUser, setActionUser] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_search: search.trim() || null,
      p_role_filter: roleFilter || null,
      p_banned_only: bannedOnly,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) console.error(error);
    setUsers(data?.users || []);
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, roleFilter, bannedOnly]);

  const ban = async (u: UserRow) => {
    const reason = window.prompt(`Reason for banning @${u.username}? (min 10 characters)`);
    if (!reason || reason.trim().length < 10) return;
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_ban_user', {
      p_target_id: u.id,
      p_reason: reason.trim(),
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Ban failed');
    setBusy(null);
    setActionUser(null);
    load();
  };

  const unban = async (u: UserRow) => {
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_unban_user', { p_target_id: u.id });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Unban failed');
    setBusy(null);
    setActionUser(null);
    load();
  };

  const grantMembership = async (u: UserRow) => {
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_grant_membership', {
      p_target_user_id: u.id,
      p_reason: 'Super Admin Grant',
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Grant failed');
    setBusy(null);
    setActionUser(null);
    load();
  };

  const revokeMembership = async (u: UserRow) => {
    if (!window.confirm(`Remove Premium from @${u.username}?`)) return;
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_revoke_membership', { p_target_id: u.id });
    if (error || !data?.ok) alert(error?.message || error?.message || 'Revoke failed');
    setBusy(null);
    setActionUser(null);
    load();
  };

  const changeRole = async (u: UserRow, role: 'user' | 'support_agent') => {
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_assign_role', {
      p_target_user_id: u.id,
      p_new_role: role,
    });
    if (error || !data?.ok) alert(error?.message || data?.error || 'Role change failed');
    setBusy(null);
    setActionUser(null);
    load();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">👥 User Management</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {users.length} users · tap a user for actions
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search by username or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      {/* Filters toggle */}
      <button
        onClick={() => setShowFilters(v => !v)}
        className="w-full mb-3 text-[11px] font-bold text-accent flex items-center justify-center gap-1"
      >
        <Filter size={12} /> {showFilters ? 'Hide filters' : 'Show filters'}
      </button>

      {showFilters && (
        <div className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Role</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { v: '',      l: 'All' },
              { v: 'user',  l: 'Users' },
              { v: 'support_agent', l: 'Agents' },
              { v: 'super_admin', l: 'Super Admins' },
              { v: 'owner', l: 'Owner' },
            ].map(r => (
              <button
                key={r.v}
                onClick={() => setRoleFilter(r.v)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full ${
                  roleFilter === r.v
                    ? 'bg-navy dark:bg-accent text-white'
                    : 'bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300'
                }`}
              >
                {r.l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-navy dark:text-white">
            <input
              type="checkbox"
              checked={bannedOnly}
              onChange={e => setBannedOnly(e.target.checked)}
              className="accent-accent"
            />
            Show banned users only
          </label>
        </div>
      )}

      {/* Users list */}
      {loading && <div className="p-4 text-center text-xs text-gray-500">Loading...</div>}

      {!loading && users.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <p className="text-[12px] text-gray-500">No users found.</p>
        </div>
      )}

      {users.map(u => (
        <div
          key={u.id}
          className="bg-white dark:bg-darkcard p-3 rounded-xl shadow-sm mb-2 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-[13px] shrink-0">
            {u.username?.[0]?.toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">
                @{u.username}
              </p>
              {u.role === 'owner' && (
                <span className="text-[8px] font-bold bg-navy text-white px-1.5 py-0.5 rounded uppercase">Owner</span>
              )}
              {u.role === 'super_admin' && (
                <span className="text-[8px] font-bold bg-accent text-white px-1.5 py-0.5 rounded uppercase">Super</span>
              )}
              {u.role === 'support_agent' && (
                <span className="text-[8px] font-bold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded uppercase">Agent</span>
              )}
              {u.banned && (
                <span className="text-[8px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase">Banned</span>
              )}
              {u.is_subscribed && !u.is_membership_exempt && (
                <Crown size={11} className="text-gold" />
              )}
              {u.is_membership_exempt && (
                <Crown size={11} className="text-accent" />
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
            <p className="text-[9px] text-gray-400">
              {u.country_iso || '—'} · {u.followers_count} followers
            </p>
          </div>

          <button
            onClick={() => setActionUser(u)}
            className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-darkline flex items-center justify-center"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
        </div>
      ))}

      {actionUser && (
        <ActionSheet
          user={actionUser}
          busy={busy === actionUser.id}
          onClose={() => setActionUser(null)}
          onBan={() => ban(actionUser)}
          onUnban={() => unban(actionUser)}
          onGrant={() => grantMembership(actionUser)}
          onRevoke={() => revokeMembership(actionUser)}
          onMakeAgent={() => changeRole(actionUser, 'support_agent')}
          onRemoveStaff={() => changeRole(actionUser, 'user')}
        />
      )}
    </div>
  );
}

function ActionSheet({
  user, busy, onClose,
  onBan, onUnban, onGrant, onRevoke, onMakeAgent, onRemoveStaff,
}: any) {
  const actions: { label: string; tone: 'default' | 'danger' | 'accent'; onClick: () => void }[] = [];

  if (!user.banned && user.role !== 'owner') {
    actions.push({ label: 'Ban user', tone: 'danger', onClick: onBan });
  }
  if (user.banned) {
    actions.push({ label: 'Unban user', tone: 'accent', onClick: onUnban });
  }
  if (!user.is_subscribed || !user.is_membership_exempt) {
    actions.push({ label: 'Grant Premium membership', tone: 'accent', onClick: onGrant });
  }
  if (user.is_membership_exempt) {
    actions.push({ label: 'Revoke granted membership', tone: 'danger', onClick: onRevoke });
  }
  if (user.role === 'user') {
    actions.push({ label: 'Promote to Support Agent', tone: 'accent', onClick: onMakeAgent });
  }
  if (user.role === 'support_agent') {
    actions.push({ label: 'Remove staff role', tone: 'danger', onClick: onRemoveStaff });
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-white dark:bg-darkcard rounded-t-2xl animate-slide-up max-h-[80vh] overflow-y-auto"
      >
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <div>
            <p className="text-[12px] font-bold text-navy dark:text-white">@{user.username}</p>
            <p className="text-[10px] text-gray-500">{user.email}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-3">
          {actions.length === 0 && (
            <p className="text-[11px] text-gray-500 text-center py-4">No actions available.</p>
          )}

          {actions.map((a, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={a.onClick}
              className={`w-full text-left p-3 rounded-xl mb-2 text-[12px] font-bold disabled:opacity-50 ${
                a.tone === 'danger'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600'
                  : a.tone === 'accent'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-gray-50 dark:bg-darkbg text-navy dark:text-white'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
           }
