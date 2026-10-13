import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Shield, MessageCircle, ShoppingCart } from 'lucide-react';
import { getCachedUser } from '../lib/cache';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data } = await supabase.from('listings').select('*').eq('id', id).single();
      setListing(data);

      if (data?.seller_id) {
        const { data: profile } = await supabase
          .from('public_profiles')
          .select('id, username')
          .eq('id', data.seller_id)
          .maybeSingle();
        setSeller(profile);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleBuy = async () => {
    const me = await getCachedUser();
    if (!me) return alert('Please log in to buy.');
    if (!listing) return;
    setBuying(true);
    // Route to order creation flow
    navigate(`/order/new?listing=${listing.id}`);
    setBuying(false);
  };

  const handleChat = async () => {
    if (!listing) return;
    // Open chat with seller — depends on your chat channel creation flow
    navigate(`/seller/${listing.seller_id}`);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading...</div>;
  if (!listing) return <div className="p-4 text-center text-xs">Listing not found.</div>;

  const images: string[] = Array.isArray(listing.images)
    ? listing.images
    : typeof listing.images === 'string'
    ? listing.images.split(',').map((s: string) => s.trim()).filter(Boolean)
    : listing.image_url
    ? listing.image_url.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-accent text-[11px] font-bold flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden">
        {images.length > 0 && (
          <div className="relative aspect-square bg-gray-100 dark:bg-darkbg">
            <img src={images[0]} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-4">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{listing.category || 'Listing'}</p>
          <h1 className="text-[15px] font-bold text-navy dark:text-white mt-1">{listing.title}</h1>

          {listing.price && (
            <p className="text-[18px] font-black text-accent mt-2">
              {Number(listing.price).toLocaleString()} XAF
            </p>
          )}

          <button
            onClick={() => navigate(`/seller/${listing.seller_id}`)}
            className="text-[11px] font-bold text-accent mt-2"
          >
            View Seller Profile →
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
            <div className="mt-3">
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-[11px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{listing.description}</p>
            </div>
          )}
        </div>

        {/* Buttons — Buy is high contrast, always visible */}
        <div className="p-4 pt-0 flex flex-col gap-2">
          <button
            onClick={handleBuy}
            disabled={buying}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            <ShoppingCart size={15} />
            {buying ? 'Opening...' : 'Buy Now'}
          </button>
          <button
            onClick={handleChat}
            className="w-full bg-brand dark:bg-brand text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <MessageCircle size={15} /> Chat with Seller
          </button>
        </div>
      </div>
    </div>
  );
                           }
