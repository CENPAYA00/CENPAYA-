import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Shield, MessageCircle, ShoppingCart, MapPin, Package, Zap } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import ImageViewer from '../components/ImageViewer';
import DocumentCard from '../components/DocumentCard';
import BoostModal from '../components/BoostModal'; // ADDED

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  const [showBoost, setShowBoost] = useState(false); // ADDED

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const me = await getCachedUser();
      setMeId(me?.id || null);

      const { data } = await supabase.from('listings').select('*').eq('id', id).single();
      setListing(data);

      if (data?.seller_id) {
        const { data: profile } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url')
          .eq('id', data.seller_id)
          .maybeSingle();
        setSeller(profile);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleBuy = () => {
    if (!listing) return;
    navigate(`/checkout?listing=${listing.id}`);
  };

  const handleChat = async () => {
    if (!listing) return;
    const me = await getCachedUser();
    if (!me) return alert('Please log in to chat.');
    if (me.id === listing.seller_id) return alert("You can't chat with yourself.");

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
          .eq('user_id', listing.seller_id)
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
          { channel_id: channelId, user_id: listing.seller_id },
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
  if (!listing) return <div className="p-4 text-center text-xs">Listing not found.</div>;

  const images: string[] = Array.isArray(listing.images)
    ? listing.images
    : typeof listing.images === 'string'
    ? listing.images.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const docs: string[] = Array.isArray(listing.documents) ? listing.documents : [];

  const hasRange = listing.price_is_range && listing.price_min != null;
  const priceLabel = hasRange
    ? `${Number(listing.price_min).toLocaleString()} – ${Number(listing.price_max ?? listing.price_min).toLocaleString()} XAF`
    : listing.price
    ? `${Number(listing.price).toLocaleString()} XAF`
    : null;

  const isOwn = meId === listing.seller_id;

  return (
    <div className="pb-40">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 text-[13px] font-bold text-navy dark:text-white truncate">Listing</p>
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
                <img src={src} alt="" className="w-full h-auto max-h-[70vh] object-contain bg-black" />
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
        {listing.category && (
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{listing.category}</p>
        )}
        <h1 className="text-[16px] font-bold text-navy dark:text-white mt-1">{listing.title}</h1>

        {priceLabel && <p className="text-[20px] font-black text-accent mt-2">{priceLabel}</p>}

        {listing.availability === 'in_stock' && (
          <span className="inline-flex items-center gap-1 mt-2 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Package size={10} /> In Stock
          </span>
        )}
        {listing.availability === 'single' && (
          <span className="inline-flex items-center gap-1 mt-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            Only one available
          </span>
        )}

        {(listing.location_city || listing.location) && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-2">
            <MapPin size={12} /> {listing.location_city || listing.location}
          </p>
        )}

        {/* ADDED: Optional Boost Banner for the Owner */}
        {isOwn && (
          <div className="mt-4 bg-[#eaf6ef] dark:bg-[#12935a]/10 border border-[#12935a]/20 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-[#0a3d2b] dark:text-white">Boost this listing</p>
              <p className="text-[11px] text-[#3e4f47] dark:text-gray-300 mt-0.5">Reach more buyers and sell faster.</p>
            </div>
            <button 
              onClick={() => setShowBoost(true)} 
              className="bg-[#12935a] text-white text-[12px] font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Zap size={14} /> Boost
            </button>
          </div>
        )}

        <button
          onClick={() => navigate(`/seller/${listing.seller_id}`)}
          className="w-full flex items-center gap-3 mt-4 bg-gray-50 dark:bg-darkbg rounded-xl p-3 cursor-pointer"
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
            <p className="text-[10px] text-accent">View seller profile →</p>
          </div>
        </button>

        <div className="mt-4 bg-gray-50 dark:bg-darkbg rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={13} className="text-gray-500 dark:text-gray-400" />
            <p className="text-[11px] font-bold text-navy dark:text-white">Escrow Protection</p>
          </div>
          <p className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed">
            Your money is held securely by CenPaya. The seller is only paid after you confirm delivery, or 72 hours after they confirm shipment.
          </p>
        </div>

        {listing.description && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</p>
            <p className="text-[12px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
          </div>
        )}

        {docs.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Attached documents</p>
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
              onClick={handleBuy}
              className="flex-1 bg-accent text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <ShoppingCart size={15} /> Buy Now
            </button>
            <button
              onClick={handleChat}
              disabled={startingChat}
              className="flex-1 bg-brand text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <MessageCircle size={15} /> {startingChat ? 'Opening…' : 'Chat'}
            </button>
          </div>
        </div>
      )}

      {viewerOpen && (
        <ImageViewer
          images={images}
          startIndex={viewerStart}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* ADDED: Boost Modal */}
      <BoostModal 
        isOpen={showBoost} 
        onClose={() => setShowBoost(false)} 
        targetType="listing" 
        targetId={listing.id} 
        targetTitle={listing.title} 
      />
    </div>
  );
    }
