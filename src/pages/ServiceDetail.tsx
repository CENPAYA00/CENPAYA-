import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Star, Clock, RefreshCw, Check, MessageCircle, Shield, FileText, ShoppingCart } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import DocumentCard from '../components/DocumentCard';
import ImageViewer from '../components/ImageViewer';

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwn, setIsOwn] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);

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
    if (!service) return;
    if (isOwn) return;
    const pkgParam = selectedPkg ? `&package=${selectedPkg.id}` : '';
    navigate(`/checkout?service=${service.id}${pkgParam}`);
  };

  const handleChat = async () => {
    if (!service) return;
    const me = await getCachedUser();
    if (!me) return alert('Please log in to chat.');
    if (me.id === service.seller_id) return alert("You can't chat with yourself.");

    setStartingChat(true);
    try {
      const { data: mine } = await supabase
        .from('chat_participants')
        .select('channel_id')
        .eq('user_id', me.id);

      const myChannelIds = (mine || []).map((c: any) => c.channel_id);

      let channelId: string | null = null;
      if (myChannelIds.length > 0) {
        const { data: match } = await supabase
          .from('chat_participants')
          .select('channel_id')
          .in('channel_id', myChannelIds)
          .eq('user_id', service.seller_id)
          .maybeSingle();
        channelId = match?.channel_id || null;
      }

      if (!channelId) {
        const { data: ch, error: chErr } = await supabase
          .from('chat_channels')
          .insert({ channel_type: 'P2P_MARKETPLACE' })
          .select()
          .single();
        if (chErr || !ch) throw chErr || new Error('Could not create channel');
        channelId = ch.id;

        await supabase.from('chat_participants').insert([
          { channel_id: channelId, user_id: me.id },
          { channel_id: channelId, user_id: service.seller_id },
        ]);
      }

      navigate(`/chat/${channelId}`);
    } catch (e: any) {
      alert(e.message || 'Could not start chat');
    } finally {
      setStartingChat(false);
    }
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!service) return <div className="p-4 text-center text-xs">Service not found.</div>;

  const docs: string[] = Array.isArray(service.documents) ? service.documents : [];

  const images: string[] = Array.isArray(service.images) && service.images.length > 0
    ? service.images
    : service.thumbnail_url
    ? [service.thumbnail_url]
    : [];

  const hasRange = service.price_is_range && service.price_min != null;
  const displayPrice = selectedPkg
    ? `${Number(selectedPkg.price).toLocaleString()} XAF`
    : hasRange
    ? `${Number(service.price_min).toLocaleString()} – ${Number(service.price_max ?? service.price_min).toLocaleString()} XAF`
    : `${Number(service.starting_price || 0).toLocaleString()} XAF`;

  return (
    <div className="pb-40">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[13px] font-bold text-navy dark:text-white truncate">Service</h1>
      </div>

      {images.length > 0 && (
        <div className="relative bg-black">
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => { setViewerStart(i); setViewerOpen(true); }}
                className="shrink-0 w-full snap-center cursor-pointer"
              >
                <img src={src} alt="" className="w-full h-56 object-cover" />
              </button>
            ))}
          </div>
          {images.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {images.length} photos
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {service.category && (
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{service.category}</p>
        )}
        <h1 className="text-[16px] font-bold text-navy dark:text-white mt-1">{service.title}</h1>

        {hasRange && !selectedPkg && (
          <p className="text-[16px] font-black text-accent mt-2">{displayPrice}</p>
        )}

        <button
          onClick={() => navigate(`/seller/${service.seller_id}`)}
          className="w-full flex items-center gap-3 mt-3 bg-gray-50 dark:bg-darkbg rounded-xl p-3 cursor-pointer"
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
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer ${
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

      {!isOwn && (
        <div
          className="fixed left-0 right-0 z-[60] bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-3 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 56px)' }}
        >
          <div className="flex gap-2 max-w-[600px] mx-auto">
            <button
              onClick={handleOrder}
              className="flex-1 bg-accent text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <ShoppingCart size={15} /> Order · {selectedPkg ? Number(selectedPkg.price).toLocaleString() : Number(service.starting_price || 0).toLocaleString()} XAF
            </button>
            <button
              onClick={handleChat}
              disabled={startingChat}
              className="w-14 bg-brand text-white font-bold rounded-xl flex items-center justify-center active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <MessageCircle size={15} />
            </button>
          </div>
        </div>
      )}

      {viewerOpen && (
        <ImageViewer images={images} startIndex={viewerStart} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
            }
