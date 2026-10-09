import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminPermission } from '../../types/AdminPermission';

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
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: staff } = await supabase
        .from('users')
        .select('id, username, role')
        .in('role', ['support_agent', 'super_admin']);

      const { data: perms } = await supabase
        .from('admin_permissions')
        .select('*')
        .is('revoked_at', null);

      if (staff) setAgents(staff);
      if (perms) setPermissions(perms as AdminPermission[]);
      setLoading(false);
    };
    load();
  }, []);

  const grantPermission = async (permissionKey: string) => {
    if (!selectedAgent) return alert('Please select a staff member first.');
    const { error } = await supabase.rpc('admin_grant_permission', {
      p_target_user_id: selectedAgent,
      p_permission_key: permissionKey,
    });
    if (error) alert('Error: ' + error.message);
    else { alert('Permission granted!'); window.location.reload(); }
  };

  const hasPermission = (userId: string, key: string) =>
    permissions.some(p => p.user_id === userId && p.permission_key === key);

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">🔑 Staff Permissions</h2>
      <p className="text-sm text-gray-500 mb-4">
        Grant specific powers to individual support agents. Only you (Super Admin) can do this.
      </p>

      <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Staff Member</label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-full p-3 border rounded-xl bg-gray-50"
        >
          <option value="">-- Choose a staff member --</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>@{a.username} ({a.role})</option>
          ))}
        </select>
      </div>

      {selectedAgent && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="font-bold text-navy mb-3">Available Permissions</p>
          {AVAILABLE_PERMISSIONS.map(perm => (
            <div key={perm.key} className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-sm text-navy">{perm.label}</span>
              {hasPermission(selectedAgent, perm.key) ? (
                <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">Granted</span>
              ) : (
                <button
                  onClick={() => grantPermission(perm.key)}
                  className="text-xs font-bold text-white bg-navy px-3 py-1 rounded-full"
                >
                  Grant
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}