import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Upload, Check } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

const CATEGORIES = ['Design', 'Development', 'Writing', 'Marketing', 'Video', 'Music', 'Business', 'Tutoring'];

const DEFAULT_PKGS = {
  basic: { title: 'Basic', price: 5000, delivery_days: 3, revisions: 1, features: ['Essential delivery'] },
  standard: { title: 'Standard', price: 15000, delivery_days: 5, revisions: 2, features: ['Standard delivery', 'Faster turnaround'] },
  premium: { title: 'Premium', price: 40000, delivery_days: 7, revisions: 3, features: ['Full delivery', 'Priority support', 'Unlimited revisions'] },
};

export default function CreateService() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Design');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [pkgs, setPkgs] = useState<any>(DEFAULT_PKGS);
  const [activeTier, setActiveTier] = useState<'basic' | 'standard' | 'premium'>('basic');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return alert('Fill title and description.');
    setLoading(true);
    const user = await getCachedUser();
    if (!user) return alert('Login first');

    let thumbUrl: string | null = null;
    if (thumbnail) {
      const path = `services/${user.id}/${Date.now()}_${thumbnail.name}`;
      const { error: upErr } = await supabase.storage.from('listings').upload(path, thumbnail);
      if (!upErr) {
        const { data } = supabase.storage.from('listings').getPublicUrl(path);
        thumbUrl = data.publicUrl;
      }
    }

    const { data: service, error } = await supabase.from('services').insert({
      seller_id: user.id,
      title: title.trim(),
      category,
      description: description.trim(),
      thumbnail_url: thumbUrl,
      starting_price: pkgs.basic.price,
      delivery_days: pkgs.basic.delivery_days,
    }).select().single();

    if (error) { alert(error.message); setLoading(false); return; }

    const tierRows = (['basic','standard','premium'] as const).map(t => ({
      service_id: service.id,
      tier: t,
      title: pkgs[t].title,
      price: pkgs[t].price,
      delivery_days: pkgs[t].delivery_days,
      revisions: pkgs[t].revisions,
      features: pkgs[t].features,
    }));

    await supabase.from('service_packages').insert(tierRows);

    alert('Service published!');
    navigate(`/service/${service.id}`);
    setLoading(false);
  };

  const updatePkg = (tier: string, key: string, value: any) => {
    setPkgs({ ...pkgs, [tier]: { ...pkgs[tier], [key]: value } });
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy">Create a Service</h1>
      </div>

      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-medium text-gray-600 mb-1">Service Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="I will design a professional logo..." className="w-full p-2.5 border rounded-lg text-xs bg-gray-50 mb-3" />

        <label className="block text-[10px] font-medium text-gray-600 mb-1">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2.5 border rounded-lg text-xs bg-gray-50 mb-3">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="block text-[10px] font-medium text-gray-600 mb-1">Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What will you deliver?" className="w-full p-2.5 border rounded-lg text-xs bg-gray-50 mb-3" />

        <label className="block text-[10px] font-medium text-gray-600 mb-1">Thumbnail Image</label>
        <input type="file" accept="image/*" onChange={e => setThumbnail(e.target.files?.[0] || null)} className="w-full p-2 border rounded-lg text-[10px] bg-gray-50" />
      </div>

      {/* Packages */}
      <div className="bg-white p-3 rounded-2xl shadow-sm mb-3">
        <p className="text-[11px] font-bold text-navy mb-2">Packages</p>
        <div className="flex bg-gray-50 rounded-xl p-1 mb-3">
          {(['basic','standard','premium'] as const).map(t => (
            <button key={t} onClick={() => setActiveTier(t)} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg ${activeTier === t ? 'bg-navy text-white' : 'text-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>

        <label className="block text-[10px] font-medium text-gray-600 mb-1">Package Title</label>
        <input value={pkgs[activeTier].title} onChange={e => updatePkg(activeTier, 'title', e.target.value)} className="w-full p-2.5 border rounded-lg text-xs bg-gray-50 mb-3" />

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="block text-[10px] text-gray-600 mb-1">Price</label>
            <input type="number" value={pkgs[activeTier].price} onChange={e => updatePkg(activeTier, 'price', Number(e.target.value))} className="w-full p-2 border rounded-lg text-xs bg-gray-50" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-600 mb-1">Days</label>
            <input type="number" value={pkgs[activeTier].delivery_days} onChange={e => updatePkg(activeTier, 'delivery_days', Number(e.target.value))} className="w-full p-2 border rounded-lg text-xs bg-gray-50" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-600 mb-1">Revisions</label>
            <input type="number" value={pkgs[activeTier].revisions} onChange={e => updatePkg(activeTier, 'revisions', Number(e.target.value))} className="w-full p-2 border rounded-lg text-xs bg-gray-50" />
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-accent text-white font-bold py-3 rounded-lg text-xs flex items-center justify-center gap-1 disabled:opacity-50"
      >
        <Upload size={13} /> {loading ? 'Publishing...' : 'Publish Service'}
      </button>
    </div>
  );
                                                                   }
