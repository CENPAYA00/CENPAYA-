import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Star, Clock, RefreshCw, Check, MessageCircle } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedTier, setSelectedTier] = useState<'basic' | 'standard' | 'premium'>('basic');
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [srvRes, pkgRes] = await Promise.all([
        supabase.from('services').select('*, public_profiles!inner(username)').eq('id', id).single(),
        supabase.from('service_packages').select('*').eq('service_id', id),
      ]);
      if (srvRes.data) setService(srvRes.data);
      if (pkgRes.data) {
        setPackages(pkgRes.data);
        if (!pkgRes.data.find(p => p.tier === 'basic') && pkgRes.data[0]) {
          setSelectedTier(pkgRes.data[0].tier);
        }
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const selectedPkg = packages.find(p => p.tier === selectedTier);

  const handleOrder = async () => {
    if (!selectedPkg) return alert('Select a package first.');
    const user = await getCachedUser();
    if (!user) return navigate('/');
    if (user.id === service.seller_id) return alert('You cannot order your own service.');

    const requirements = prompt('Briefly describe what you need:');
    if (!requirements) return;

    setOrdering(true);
    const { data, error } = await supabase.from('service_orders').insert({
      service_id: service.id,
      package_id: selectedPkg.id,
      buyer_id: user.id,
      seller_id: service.seller_id,
      amount: selectedPkg.price,
      requirements,
      escrow_status: 'hold',
      auto_release_deadline_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    }).select().single();

    if (error) { alert(error.message); setOrdering(false); return; }
    alert('Order placed! Funds held in escrow until you confirm delivery.');
    navigate(`/service-order/${data.id}`);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!service) return <div className="p-4 text-center text-xs">Service not found.</div>;

  return (
    <div className="pb-24">
      <div className="px-3 pt-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy">Service</h1>
      </div>

      {/* Hero */}
      {service.thumbnail_url && (
        <img src={service.thumbnail_url} alt="" className="w-full h-48 object-cover mt-3" />
      )}

      <div className="px-3 mt-3">
        <h2 className="text-sm font-bold text-navy leading-snug">{service.title}</h2>

        <button
          onClick={() => navigate(`/seller/${service.seller_id}`)}
          className="flex items-center gap-2 mt-3 bg-white rounded-xl p-2 w-full shadow-sm"
        >
          <div className="w-8 h-8 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-[11px]">
            {service.public_profiles?.username?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="text-left">
            <p className="text-[11px] font-bold text-navy">@{service.public_profiles?.username}</p>
            <div className="flex items-center gap-1 text-[9px] text-gray-500">
              <Star size={9} className="text-gold" fill="currentColor" />
              <span>{(service.rating || 0).toFixed(1)}</span>
              <span>({service.review_count || 0} reviews)</span>
            </div>
          </div>
        </button>

        {service.description && (
          <p className="text-[11px] text-gray-700 mt-3 whitespace-pre-wrap leading-relaxed">{service.description}</p>
        )}
      </div>

      {/* Package tabs */}
      <div className="px-3 mt-4">
        <div className="flex bg-white rounded-xl shadow-sm overflow-hidden">
          {(['basic', 'standard', 'premium'] as const).map(tier => {
            const hasPkg = packages.some(p => p.tier === tier);
            return (
              <button
                key={tier}
                onClick={() => hasPkg && setSelectedTier(tier)}
                disabled={!hasPkg}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider ${
                  selectedTier === tier ? 'bg-navy text-white' : hasPkg ? 'text-gray-600' : 'text-gray-300'
                }`}
              >
                {tier}
              </button>
            );
          })}
        </div>

        {selectedPkg ? (
          <div className="bg-white rounded-xl shadow-sm mt-2 p-3">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[11px] font-bold text-navy">{selectedPkg.title}</p>
              <p className="text-sm font-black text-accent">{Number(selectedPkg.price).toLocaleString()} XAF</p>
            </div>
            {selectedPkg.description && (
              <p className="text-[10px] text-gray-600 mb-2 whitespace-pre-wrap">{selectedPkg.description}</p>
            )}
            <div className="flex gap-3 text-[10px] text-gray-500 mb-2">
              <span className="flex items-center gap-1"><Clock size={11} /> {selectedPkg.delivery_days} days</span>
              <span className="flex items-center gap-1"><RefreshCw size={11} /> {selectedPkg.revisions} revisions</span>
            </div>
            {Array.isArray(selectedPkg.features) && selectedPkg.features.length > 0 && (
              <div className="border-t border-gray-100 pt-2 mt-2">
                {selectedPkg.features.map((f: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-700 py-0.5">
                    <Check size={11} className="text-green-500" /> {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm mt-2 p-4 text-center">
            <p className="text-[10px] text-gray-500">This seller has not set up this package yet.</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 mt-4 flex gap-2">
        <button
          onClick={() => navigate('/chat')}
          className="flex-1 bg-white border border-navy text-navy font-bold py-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1"
        >
          <MessageCircle size={13} /> Contact
        </button>
        <button
          onClick={handleOrder}
          disabled={ordering || !selectedPkg}
          className="flex-1 bg-accent text-white font-bold py-2.5 rounded-lg text-[11px] disabled:opacity-50"
        >
          {ordering ? 'Placing order...' : `Continue (${Number(selectedPkg?.price || 0).toLocaleString()} XAF)`}
        </button>
      </div>
    </div>
  );
      }
