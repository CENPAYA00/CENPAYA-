import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminFeatures() {
  const [flags, setFlags] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('application_feature_flags').select('*');
      if (data) setFlags(data);
    };
    fetch();
  }, []);

  const toggle = async (flag: any) => {
    await supabase
      .from('application_feature_flags')
      .update({ is_enabled_globally: !flag.is_enabled_globally })
      .eq('id', flag.id);
    setFlags(flags.map(f => f.id === flag.id ? { ...f, is_enabled_globally: !f.is_enabled_globally } : f));
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">⚙️ Feature Flags</h2>
      {flags.map(f => (
        <div key={f.id} className="bg-white p-4 rounded-xl shadow-sm mb-2 flex justify-between items-center">
          <div>
            <p className="font-bold text-navy">{f.display_name}</p>
            <p className="text-xs text-gray-500">{f.description}</p>
          </div>
          <button
            onClick={() => toggle(f)}
            className={`w-12 h-6 rounded-full transition-colors ${f.is_enabled_globally ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${f.is_enabled_globally ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
          </button>
        </div>
      ))}
    </div>
  );
}