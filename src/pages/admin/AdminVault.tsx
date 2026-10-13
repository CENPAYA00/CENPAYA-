import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CreditCard, MessageSquare, Mail, X, Check, Lock } from 'lucide-react';

type Provider = {
  id: string;
  provider_name: string;
  display_name: string;
  provider_type: string;
  is_active: boolean;
  priority: number;
  has_key: boolean;
  environment: string | null;
  updated_at: string | null;
};

const SECTIONS: { key: string; title: string; icon: any; subtitle: string }[] = [
  { key: 'PAYMENT_GATEWAY', title: 'Payment gateways', icon: CreditCard, subtitle: 'Mobile money & card aggregators' },
  { key: 'SMS_SERVICE',     title: 'SMS providers',    icon: MessageSquare, subtitle: 'OTP and transactional SMS' },
  { key: 'EMAIL_SERVICE',   title: 'Email providers',  icon: Mail, subtitle: 'Transactional email' },
];

export default function AdminVault() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);

  const load = async () => {
    setLoading(true);

    const { data: providersData } = await supabase
      .from('system_providers')
      .select('id, provider_name, display_name, provider_type, is_active, priority')
      .in('provider_type', ['PAYMENT_GATEWAY', 'SMS_SERVICE', 'EMAIL_SERVICE'])
      .order('provider_type')
      .order('priority');

    const { data: vaultData } = await supabase
      .from('platform_api_vault')
      .select('provider_id, environment, updated_at')
      .eq('environment', 'production');

    const vaultMap: Record<string, { environment: string; updated_at: string }> = {};
    (vaultData || []).forEach((v: any) => {
      vaultMap[v.provider_id] = { environment: v.environment, updated_at: v.updated_at };
    });

    setProviders((providersData || []).map((p: any) => ({
      ...p,
      has_key: !!vaultMap[p.id],
      environment: vaultMap[p.id]?.environment || null,
      updated_at: vaultMap[p.id]?.updated_at || null,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (p: Provider) => {
    await supabase
      .from('system_providers')
      .update({ is_active: !p.is_active })
      .eq('id', p.id);
    load();
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy dark:text-white mb-2">🔐 API Vault</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Keys are encrypted and only accessible from the backend. Tap a provider to add or update its keys.
      </p>

      {SECTIONS.map(section => {
        const list = providers.filter(p => p.provider_type === section.key);
        const Icon = section.icon;
        return (
          <div key={section.key} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={15} className="text-navy dark:text-white" />
              <p className="text-[13px] font-bold text-navy dark:text-white">{section.title}</p>
              <span className="text-[10px] text-gray-500">· {list.length}</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">{section.subtitle}</p>

            <div className="bg-white dark:bg-darkcard rounded-xl shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center px-3 py-2 bg-gray-50 dark:bg-darkbg border-b border-gray-100 dark:border-darkline">
                <p className="flex-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Provider</p>
                <p className="w-20 text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">Status</p>
                <p className="w-20 text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider">Keys</p>
                <p className="w-10"></p>
              </div>

              {list.length === 0 && (
                <p className="p-4 text-[11px] text-gray-400 text-center">No providers in this category.</p>
              )}

              {list.map(p => (
                <div key={p.id} className="flex items-center px-3 py-3 border-b border-gray-100 dark:border-darkline last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-navy dark:text-white truncate">
                      {p.display_name || p.provider_name}
                    </p>
                    {p.updated_at && (
                      <p className="text-[9px] text-gray-400">
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="w-20 flex justify-center">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        p.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 dark:bg-darkline text-gray-500'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <div className="w-20 flex justify-center">
                    {p.has_key ? (
                      <span className="text-[9px] font-bold text-green-700 flex items-center gap-1">
                        <Check size={10} /> Set
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-gray-400">Not set</span>
                    )}
                  </div>

                  <div className="w-10 flex justify-end">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-[10px] font-bold text-accent"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {editing && (
        <KeyEditor
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function KeyEditor({
  provider, onClose, onSaved,
}: { provider: Provider; onClose: () => void; onSaved: () => void }) {
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!publicKey.trim() || !secretKey.trim()) {
      return alert('Public key and secret key are required.');
    }
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_gateway_credentials', {
      p_provider_name: provider.provider_name,
      p_api_public_key: publicKey.trim(),
      p_api_secret_key: secretKey.trim(),
      p_webhook_secret: webhookSecret.trim() || null,
      p_environment: 'production',
    });
    if (error) {
      alert('Error: ' + error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  };

  const removeKeys = async () => {
    if (!window.confirm(`Remove keys for ${provider.provider_name}?`)) return;
    const { error } = await supabase.rpc('admin_remove_gateway_credentials', {
      p_provider_name: provider.provider_name,
      p_environment: 'production',
    });
    if (error) alert(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-h-[90vh] bg-white dark:bg-darkcard rounded-t-2xl overflow-y-auto animate-slide-up"
      >
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard z-10">
          <div>
            <p className="text-[12px] font-bold text-navy dark:text-white">
              {provider.display_name || provider.provider_name}
            </p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest">{provider.provider_type}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              Public / API key
            </label>
            <input
              value={publicKey}
              onChange={e => setPublicKey(e.target.value)}
              placeholder="pk_live_..."
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              Secret key
            </label>
            <input
              type="password"
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder="sk_live_..."
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              Webhook secret (optional)
            </label>
            <input
              type="password"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              placeholder="whsec_..."
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono"
            />
          </div>

          <p className="text-[9px] text-gray-400 flex items-center gap-1">
            <Lock size={10} /> Keys are stored in the platform_api_vault table and never shown to regular users.
          </p>

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-navy dark:bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save keys'}
          </button>

          {provider.has_key && (
            <button
              onClick={removeKeys}
              className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-2.5 rounded-xl text-[11px]"
            >
              Remove keys
            </button>
          )}
        </div>
      </div>
    </div>
  );
      }
