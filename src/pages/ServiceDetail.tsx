import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Star, Clock, RefreshCw, Check, MessageCircle, Shield, FileText } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import DocumentCard from '../components/DocumentCard';

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwn, setIsOwn] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();

      const [srvRes, pkgRes] = await Promise.all([
        supabase.from('services').select('*').eq('id', id).single(),
        supabase.from('service_packages').select('*').eq('service_id', id).order('price', { ascending: true }),
      ]);

      setService(srvRes.data);

      const pkgs = pkgRes.data || [];
      setPackages(pkgs);
      if (pkgs.length > 0) setSelectedPkg(pkgs[0]);

      if (me && srvRes.data?.seller_id === me.id) setIsOwn(true);

      if (srvRes.data?.seller_id) {
        const { data: profile } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url')
          .eq('id', srvRes.data.seller_id)
          .maybeSingle();
        setSeller(profile);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleOrder = () => {
    if (!service || !selectedPkg) return;
    if (isOwn) return;
    navigate(`/service-order/new?service=${service.id}&package=${selectedPkg.id}`);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!service) return <div className="p-4 text-center text-xs">Service not found.</div>;

  const docs: string[] = Array.isArray(service.documents) ? service.documents : [];

  return (
    <div className="pb-28">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[13px] font-bold text-navy dark:text-white truncate">Service</h1>
      </div>

      {service.thumbnail_url && (
        <img src={service.thumbnail_url} alt="" className="w-full h-56 object-cover" />
      )}

      <div className="p-4">
        {service.category && (
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{service.category}</p>
        )}
        <h1 className="text-[16px] font-bold text-navy dark:text-white mt-1">{service.title}</h1>

        <button
          onClick={() => navigate(`/seller/${service.seller_id}`)}
          className="w-full flex items-center gap-3 mt-3 bg-gray-50 dark:bg-darkbg rounded-xl p-3"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold overflow-hidden">
            {seller?.avatar_url ? (
              <img src={seller.avatar_url} alt="" className="w-10 h-10 object-cover" />
            ) : (
              seller?.username?.[0]?.toUpperCase() || 'U'
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-[12px] font-bold text-navy dark:text-white">@{seller?.username || 'seller'}</p>
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Star size={10} className="text-gold" fill="currentColor" />
              <span>{(service.rating || 0).toFixed(1)}</span>
              <span>·</span>
              <span>{service.orders_count || 0} orders</span>
            </div>
          </div>
        </button>

        {packages.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Packages</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3">
              {packages.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPkg(p)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                    selectedPkg?.id === p.id
                      ? 'bg-accent text-white'
                      : 'bg-gray-100 dark:bg-darkline text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>

            {selectedPkg && (
              <div className="bg-gray-50 dark:bg-darkbg rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold text-navy dark:text-white">{selectedPkg.title}</p>
                  <p className="text-[14px] font-black text-accent">
                    {Number(selectedPkg.price).toLocaleString()} XAF
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 mb-1">
                  <span className="flex items-center gap-1"><Clock size={10} /> {selectedPkg.delivery_days} days</span>
                  <span className="flex items-center gap-1"><RefreshCw size={10} /> {selectedPkg.revisions ?? 0} revisions</span>
                </div>
                {Array.isArray(selectedPkg.features) && selectedPkg.features.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {selectedPkg.features.map((f: string, i: number) => (
                      <li key={i} className="text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-1">
                        <Check size={11} className="text-green-500" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 bg-gray-50 dark:bg-darkbg rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={13} className="text-gray-500 dark:text-gray-400" />
            <p className="text-[11px] font-bold text-navy dark:text-white">Escrow protection</p>
          </div>
          <p className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed">
            Your payment is held securely. The freelancer is paid only after you approve the delivery, or automatically 72 hours after they deliver — whichever comes first.
          </p>
        </div>

        {service.description && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">About this service</p>
            <p className="text-[12px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{service.description}</p>
          </div>
        )}

        {docs.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileText size={11} /> Attached documents
            </p>
            {docs.map((url, i) => <DocumentCard key={i} url={url} />)}
          </div>
        )}
      </div>

      {!isOwn && selectedPkg && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-3 z-40">
          <div className="flex gap-2 max-w-[600px] mx-auto">
            <button
              onClick={handleOrder}
              className="flex-1 bg-accent text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              Order · {Number(selectedPkg.price).toLocaleString()} XAF
            </button>
            <button
              onClick={() => navigate(`/seller/${service.seller_id}`)}
              className="w-12 bg-brand text-white font-bold rounded-xl flex items-center justify-center active:scale-[0.98]"
            >
              <MessageCircle size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
    }
