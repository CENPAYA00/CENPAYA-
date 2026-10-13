import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminPermission } from '../../types/AdminPermission';
import { UserPlus, Check, Shield } from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
  { key: 'can_resolve_disputes', label: 'Resolve Disputes' },
  { key: 'can_ban_users', label: 'Ban Users' },
  { key: 'can_review_kyc', label: 'Review KYC' },
  { key: 'can_view_finances', label: 'View Platform Finances' },
  { key: 'can_manage_listings', label: 'Manage Listings' },
  { key: 'can_manage_tickets', label: 'Manage Support Tickets' },
];

export default function AdminPermissions() {
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

  const load = async () => {
    // All current staff — owner, super_admin, support_agent
    const { data: staffData } = await supabase
      .from('users')
      .select('id, username, role')
      .in('role', ['owner', 'super_admin', 'support_agent'])
      .order('role')
      .order('username');

    // Regular users who could become staff
    const { data: candidateData } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(50);

    // Active permissions
    const { data: permsData } = await supabase
      .from('admin_permissions')
      .select('*')
      .is('revoked_at', null);

    if (staffData) setStaff(staffData);
    if (candidateData) setCandidates(candidateData);
    if (permsData) setPermissions(permsData as AdminPermission[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grantPermission = async (permissionKey: string) => {
    if (!selectedAgent) return alert('Please select a staff member first.');
    const { error } = await supabase.rpc('admin_grant_permission', {
      p_target_user_id: selectedAgent,
      p_permission_key: permissionKey,
    });
    if (error) alert('Error: ' + error.message);
    else { alert('Permission granted!'); load(); }
  };

  const revokePermission = async (userId: string, permissionKey: string) => {
    await supabase
      .from('admin_permissions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('permission_key', permissionKey);
    load();
  };

  const promoteToAgent = async (userId: string) => {
    if (!window.confirm('Promote this user to Support Agent?')) return;
    setPromoting(userId);
    const { error } = await supabase.rpc('admin_assign_role', {
      p_target_user_id: userId,
      p_new_role: 'support_agent',
    });
    if (error) alert(error.message);
    else { alert('Promoted.'); load(); }
    setPromoting(null);
  };

  const demoteToUser = async (userId: string) => {
    if (!window.confirm('Remove staff role and set this user back to regular user?')) return;
    setPromoting(userId);
    const { error } = await supabase.rpc('admin_assign_role', {
      p_target_user_id: userId,
      p_new_role: 'user',
    });
    if (error) alert(error.message);
    else { alert('Demoted.'); load(); }
    setPromoting(null);
  };

  const hasPermission = (userId: string, key: string) =>
    permissions.some(p => p.user_id === userId && p.permission_key === key);

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">🔑 Staff Permissions</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Grant specific powers to staff. Only the owner can do this.
      </p>

      {/* Current staff list */}
      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden mb-4">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center gap-2">
          <Shield size={14} className="text-navy dark:text-white" />
          <p className="text-[12px] font-bold text-navy dark:text-white">
            Current staff ({staff.length})
          </p>
        </div>

        {staff.length === 0 && (
          <p className="p-4 text-[11px] text-gray-500">No staff yet. Promote a user below.</p>
        )}

        {staff.map(s => (
          <div key={s.id} className="p-3 border-b border-gray-100 dark:border-darkline last:border-b-0 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold">
              {s.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">@{s.username}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.role}</p>
            </div>

            {s.role === 'support_agent' && (
              <button
                onClick={() => demoteToUser(s.id)}
                disabled={promoting === s.id}
                className="text-[10px] font-bold text-red-500 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 disabled:opacity-50"
              >
                {promoting === s.id ? '…' : 'Remove'}
              </button>
            )}

            {s.role === 'owner' && (
              <span className="text-[9px] font-bold bg-navy text-white px-2 py-1 rounded-full uppercase">
                Owner
              </span>
            )}
            {s.role === 'super_admin' && (
              <span className="text-[9px] font-bold bg-accent text-white px-2 py-1 rounded-full uppercase">
                Super
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Select staff to grant permissions */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-4">
        <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">
          Grant permissions to
        </label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px]"
        >
          <option value="">-- Choose a staff member --</option>
          {staff.map(a => (
            <option key={a.id} value={a.id}>@{a.username} ({a.role})</option>
          ))}
        </select>
      </div>

      {selectedAgent && (
        <div className="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm mb-4">
          <p className="text-[12px] font-bold text-navy dark:text-white mb-3">Available permissions</p>
          {AVAILABLE_PERMISSIONS.map(perm => {
            const granted = hasPermission(selectedAgent, perm.key);
            return (
              <div key={perm.key} className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-darkline last:border-b-0">
                <span className="text-[12px] text-navy dark:text-white">{perm.label}</span>
                {granted ? (
                  <button
                    onClick={() => revokePermission(selectedAgent, perm.key)}
                    className="text-[10px] font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full flex items-center gap-1"
                  >
                    <Check size={10} /> Granted
                  </button>
                ) : (
                  <button
                    onClick={() => grantPermission(perm.key)}
                    className="text-[10px] font-bold text-white bg-navy dark:bg-accent px-3 py-1 rounded-full"
                  >
                    Grant
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Promote a user to staff */}
      <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center gap-2">
          <UserPlus size={14} className="text-navy dark:text-white" />
          <p className="text-[12px] font-bold text-navy dark:text-white">
            Promote users to support agents
          </p>
        </div>

        {candidates.length === 0 && (
          <p className="p-4 text-[11px] text-gray-500">No regular users to promote.</p>
        )}

        {candidates.map(u => (
          <div key={u.id} className="p-3 border-b border-gray-100 dark:border-darkline last:border-b-0 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-darkline flex items-center justify-center text-gray-500 font-bold">
              {u.username?.[0]?.toUpperCase()}
            </div>
            <p className="flex-1 text-[12px] text-navy dark:text-white truncate">@{u.username}</p>
            <button
              onClick={() => promoteToAgent(u.id)}
              disabled={promoting === u.id}
              className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {promoting === u.id ? '…' : 'Make agent'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
            }
