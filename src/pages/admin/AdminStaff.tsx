import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, X, Mail, Shield, Copy, Check, Ban, Clock } from 'lucide-react';

const PERMISSIONS = [
  { key: 'can_resolve_disputes',  label: 'Resolve Disputes' },
  { key: 'can_ban_users',         label: 'Ban Users' },
  { key: 'can_review_kyc',        label: 'Review KYC' },
  { key: 'can_view_finances',     label: 'View Platform Finances' },
  { key: 'can_manage_listings',   label: 'Manage Listings' },
  { key: 'can_manage_tickets',    label: 'Manage Support Tickets' },
  { key: 'can_review_reports',    label: 'Review Reports' },
];

export default function AdminStaff() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_invitations');
    setInvitations(data?.invitations || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = async (token: string, id: string) => {
    const url = `https://cenpaya.pages.dev/staff/accept/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt('Copy this invitation link:', url);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this invitation?')) return;
    await supabase.rpc('admin_revoke_invitation', { p_id: id });
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-2xl font-bold text-navy dark:text-white">👤 Staff</h2>
          <p className="text-[11px] text-gray-500">Invite staff by email. They accept and get the assigned role.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-accent text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <UserPlus size={12} /> Invite
        </button>
      </div>

      {invitations.length === 0 && (
        <div className="bg-white dark:bg-darkcard p-6 rounded-xl text-center shadow-sm">
          <UserPlus size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-[12px] text-gray-500">No invitations yet</p>
        </div>
      )}

      {invitations.map(inv => (
        <div key={inv.id} className="bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-navy dark:text-white truncate">{inv.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  inv.role === 'super_admin' ? 'bg-accent/15 text-accent' : 'bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300'
                }`}>
                  {inv.role}
                </span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  inv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                  inv.status === 'revoked' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {inv.status}
                </span>
              </div>
            </div>
            {inv.status === 'pending' && (
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => copyLink(inv.token, inv.id)}
                  className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center"
                >
                  {copied === inv.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => revoke(inv.id)}
                  className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center"
                >
                  <Ban size={14} />
                </button>
              </div>
            )}
          </div>

          {Array.isArray(inv.permissions) && inv.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {inv.permissions.map((p: string) => (
                <span key={p} className="text-[8px] bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                  {PERMISSIONS.find(x => x.key === p)?.label || p}
                </span>
              ))}
            </div>
          )}

          {inv.status === 'pending' && (
            <p className="text-[9px] text-gray-400 flex items-center gap-1 mt-1.5">
              <Clock size={9} /> Expires {new Date(inv.expires_at).toLocaleDateString()}
            </p>
          )}
          {inv.status === 'accepted' && inv.accepted_at && (
            <p className="text-[9px] text-green-600 mt-1.5">
              Accepted {new Date(inv.accepted_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}

      {showInvite && <InviteSheet onClose={() => setShowInvite(false)} onCreated={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

function InviteSheet({ onClose, onCreated }: any) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'support_agent' | 'super_admin'>('support_agent');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const togglePerm = (key: string) => {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const submit = async () => {
    setErr('');
    if (!email.trim() || !email.includes('@')) return setErr('Enter a valid email.');
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_invite_staff', {
      p_email: email.trim().toLowerCase(),
      p_role: role,
      p_permissions: permissions,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Invite failed.');
      setBusy(false);
      return;
    }
    alert(`Invitation created. Share this link:\nhttps://cenpaya.pages.dev/staff/accept/${data.token}`);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard">
          <p className="text-[13px] font-bold text-navy dark:text-white">Invite staff</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Mail size={11} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
            />
            <p className="text-[9px] text-gray-400 mt-1">Must match the email they used to sign up.</p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Shield size={11} /> Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['support_agent', 'super_admin'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-3 rounded-xl border-2 text-[11px] font-bold ${
                    role === r ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-darkline text-navy dark:text-white'
                  }`}
                >
                  {r === 'support_agent' ? 'Support Agent' : 'Super Admin'}
                </button>
              ))}
            </div>
          </div>

          {role === 'support_agent' && (
            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 block">
                Permissions (optional)
              </label>
              <div className="space-y-1.5">
                {PERMISSIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => togglePerm(p.key)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border-2 text-left ${
                      permissions.includes(p.key)
                        ? 'border-accent bg-accent/5'
                        : 'border-gray-200 dark:border-darkline'
                    }`}
                  >
                    <span className="text-[11px] text-navy dark:text-white">{p.label}</span>
                    {permissions.includes(p.key) && <Check size={14} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {busy ? 'Creating invitation...' : 'Create invitation'}
          </button>
        </div>
      </div>
    </div>
  );
    }
