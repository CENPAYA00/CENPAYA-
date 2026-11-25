import { useEffect, useState } from 'react';
import { supabaseWorkerRequest } from '../../lib/supabaseWorkerApi';
import { CreditCard, X, Check, Lock, AlertTriangle, RefreshCw } from 'lucide-react';

type Environment = 'sandbox' | 'production';
type Provider = {
  id: string;
  provider_name: string;
  display_name: string | null;
  provider_type: string;
  is_active: boolean;
  priority: number;
  supported_countries: string[] | null;
  has_sandbox_key: boolean;
  has_production_key: boolean;
  sandbox_updated_at: string | null;
  production_updated_at: string | null;
};

function dateLabel(value: string | null): string {
  if (!value) return 'Never updated';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export default function AdminVault() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Provider | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await supabaseWorkerRequest<{ data: Provider[] }>('/api/v1/admin/providers');
      setProviders(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load API Vault providers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleActive = async (provider: Provider) => {
    setBusyProvider(provider.id);
    setError('');
    try {
      await supabaseWorkerRequest('/api/v1/admin/rpc/admin_set_provider_active', {
        method: 'POST',
        body: JSON.stringify({ args: { p_provider_name: provider.provider_name, p_active: !provider.is_active } }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update provider status.');
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-navy dark:text-white mb-1">🔐 Platform API Vault</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Payment-provider credentials are stored in Supabase Vault and accessed by the financial Worker only.
          Secret values are never returned to this screen.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load()} aria-label="Retry loading API Vault"><RefreshCw size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-xs text-gray-500">Loading payment providers…</div>
      ) : providers.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-darkcard p-6 text-center shadow-sm">
          <CreditCard size={26} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-semibold text-navy dark:text-white">No payment providers returned</p>
          <p className="mt-1 text-xs text-gray-500">Check administrator access and provider configuration.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-navy dark:text-white" />
            <p className="text-[13px] font-bold text-navy dark:text-white">Payment gateways</p>
            <span className="text-[10px] text-gray-500">· {providers.length}</span>
          </div>

          {providers.map(provider => (
            <section key={provider.id} className="rounded-xl bg-white dark:bg-darkcard shadow-sm overflow-hidden">
              <div className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-navy dark:text-white truncate">
                    {provider.display_name || provider.provider_name}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono">{provider.provider_name}</p>
                  <p className="mt-1 text-[10px] text-gray-500">
                    Markets: {provider.supported_countries?.length ? provider.supported_countries.join(' · ') : 'Not restricted'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleActive(provider)}
                  disabled={busyProvider === provider.id}
                  aria-label={provider.is_active ? `Disable ${provider.display_name || provider.provider_name}` : `Enable ${provider.display_name || provider.provider_name}`}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full disabled:opacity-50 ${provider.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-darkline text-gray-500'}`}
                >
                  {busyProvider === provider.id ? 'Saving…' : provider.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                <div className="rounded-lg bg-gray-50 dark:bg-darkbg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Sandbox</p>
                    {provider.has_sandbox_key
                      ? <span className="text-[9px] font-bold text-green-700 flex items-center gap-1"><Check size={10} /> Configured</span>
                      : <span className="text-[9px] text-amber-600">Not configured</span>}
                  </div>
                  <p className="mt-1 text-[9px] text-gray-400">{dateLabel(provider.sandbox_updated_at)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-darkbg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Production</p>
                    {provider.has_production_key
                      ? <span className="text-[9px] font-bold text-green-700 flex items-center gap-1"><Check size={10} /> Configured</span>
                      : <span className="text-[9px] text-amber-600">Not configured</span>}
                  </div>
                  <p className="mt-1 text-[9px] text-gray-400">{dateLabel(provider.production_updated_at)}</p>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-darkline px-3 py-2 flex items-center justify-between">
                <p className="text-[9px] text-gray-400">Priority {provider.priority}</p>
                <button type="button" onClick={() => setEditing(provider)} className="text-[11px] font-bold text-accent">
                  Manage credentials
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <KeyEditor
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function KeyEditor({
  provider, onClose, onSaved,
}: { provider: Provider; onClose: () => void; onSaved: () => void }) {
  const [environment, setEnvironment] = useState<Environment>('sandbox');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  const hasCredentials = environment === 'sandbox' ? provider.has_sandbox_key : provider.has_production_key;

  const save = async () => {
    setError('');
    if (!publicKey.trim() || !secretKey.trim()) {
      setError('Enter both the public/API key and secret key. Existing secret values cannot be viewed or recovered here.');
      return;
    }
    setSaving(true);
    try {
      await supabaseWorkerRequest('/api/v1/admin/gateway-credentials', {
        method: 'POST',
        body: JSON.stringify({
          provider_name: provider.provider_name,
          api_public_key: publicKey.trim(),
          api_secret_key: secretKey.trim(),
          webhook_secret: webhookSecret.trim() || null,
          environment,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save credentials.');
    } finally {
      setSaving(false);
    }
  };

  const removeKeys = async () => {
    if (!hasCredentials) return;
    if (!window.confirm(`Remove ${environment} credentials for ${provider.provider_name}?`)) return;
    setError('');
    setRemoving(true);
    try {
      await supabaseWorkerRequest('/api/v1/admin/gateway-credentials/remove', {
        method: 'POST',
        body: JSON.stringify({ provider_name: provider.provider_name, environment }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove credentials.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage ${provider.display_name || provider.provider_name} credentials`}
        onClick={event => event.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] bg-white dark:bg-darkcard rounded-t-2xl sm:rounded-2xl overflow-y-auto"
      >
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard z-10">
          <div>
            <p className="text-[12px] font-bold text-navy dark:text-white">{provider.display_name || provider.provider_name}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest">Payment gateway credentials</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Environment</label>
            <select
              value={environment}
              onChange={event => { setEnvironment(event.target.value as Environment); setPublicKey(''); setSecretKey(''); setWebhookSecret(''); setError(''); }}
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px]"
            >
              <option value="sandbox">Sandbox / test</option>
              <option value="production">Production / live</option>
            </select>
          </div>

          {hasCredentials && (
            <p className="text-[10px] text-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
              Credentials are already configured for this environment. Enter replacement values to rotate them; existing secrets are never displayed.
            </p>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Public / API key</label>
            <input autoComplete="off" value={publicKey} onChange={event => setPublicKey(event.target.value)}
              placeholder="Enter new public/API key"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Secret key / token</label>
            <input type="password" autoComplete="new-password" value={secretKey} onChange={event => setSecretKey(event.target.value)}
              placeholder="Enter new secret key"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Webhook secret (optional)</label>
            <input type="password" autoComplete="new-password" value={webhookSecret} onChange={event => setWebhookSecret(event.target.value)}
              placeholder="Enter webhook signing secret"
              className="w-full p-3 border border-gray-200 dark:border-darkline rounded-xl bg-gray-50 dark:bg-darkbg text-[12px] font-mono" />
          </div>

          <p className="text-[9px] text-gray-400 flex items-center gap-1">
            <Lock size={10} /> Values are sent to the authenticated Worker and stored in Supabase Vault. They are not returned to the browser.
          </p>

          {error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}

          <button type="button" onClick={() => void save()} disabled={saving || removing}
            className="w-full bg-navy dark:bg-accent text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save credentials'}
          </button>

          {hasCredentials && (
            <button type="button" onClick={() => void removeKeys()} disabled={saving || removing}
              className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 font-bold py-2.5 rounded-xl text-[11px] disabled:opacity-50">
              {removing ? 'Removing…' : `Remove ${environment} credentials`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
