import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminVault() {
  const [providers, setProviders] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProviders = async () => {
      const { data } = await supabase
        .from('system_providers')
        .select('provider_name, display_name, provider_type')
        .eq('is_active', true)
        .in('provider_type', ['PAYMENT_GATEWAY', 'SMS_SERVICE', 'EMAIL_SERVICE'])
        .order('provider_type');
      if (data) setProviders(data);
    };
    fetchProviders();
  }, []);

  const handleSave = async () => {
    if (!selected) return alert('Please select a provider');
    setLoading(true);

    const { error } = await supabase.rpc('admin_set_gateway_credentials', {
      p_provider_name: selected,
      p_api_public_key: publicKey,
      p_api_secret_key: secretKey,
      p_environment: 'production',
    });

    if (error) alert('Error: ' + error.message);
    else {
      alert('Credentials saved securely to vault!');
      setPublicKey('');
      setSecretKey('');
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">🔐 API Vault</h2>
      <p className="text-sm text-gray-500 mb-4">Your API keys are encrypted and only accessible to the backend.</p>

      <div className="bg-white p-4 rounded-xl shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Provider</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full p-3 border rounded-xl mb-4 bg-gray-50"
        >
          <option value="">-- Choose a provider --</option>
          {providers.map(p => (
            <option key={p.provider_name} value={p.provider_name}>
              {p.display_name} ({p.provider_type})
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-700 mb-1">Public / API Key</label>
        <input
          type="text"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          className="w-full p-3 border rounded-xl mb-4 font-mono text-sm"
          placeholder="pk_live_..."
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
        <input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          className="w-full p-3 border rounded-xl mb-6 font-mono text-sm"
          placeholder="sk_live_..."
        />

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-navy text-white font-bold py-3 rounded-xl"
        >
          {loading ? 'Saving...' : 'Save Keys Securely'}
        </button>
      </div>
    </div>
  );
}