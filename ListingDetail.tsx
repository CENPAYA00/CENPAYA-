import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { validateCoupon } from '../utils/validateCoupon';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('users')
          .select('is_subscribed')
          .eq('id', user.id)
          .single();
        setIsSubscribed(profile?.is_subscribed || false);
      }

      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      if (data) setListing(data);
      setLoading(false);
    };
    load();
  }, [id]);

  const handleApplyCoupon = async () => {
    if (!couponCode || !listing) return;
    const result = await validateCoupon(couponCode, listing.price, isSubscribed);

    if (result.valid && result.coupon) {
      setDiscount(result.discount);
      setAppliedCouponId(result.coupon.id);
      setCouponMessage(`✅ Coupon applied: -${result.discount.toFixed(0)} XAF`);
    } else {
      setDiscount(0);
      setAppliedCouponId(null);
      setCouponMessage(`❌ ${result.error}`);
    }
  };

  const handleBuyNow = async () => {
    if (!userId) {
      alert('Please log in to buy.');
      navigate('/');
      return;
    }

    setBuying(true);
    const finalAmount = listing.price - discount;

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        listing_id: listing.id,
        buyer_id: userId,
        seller_id: listing.seller_id,
        amount: finalAmount,
        currency_code: 'XAF',
      })
      .select()
      .single();

    if (error) {
      alert('Error creating order: ' + error.message);
      setBuying(false);
      return;
    }

    if (appliedCouponId) {
      await supabase.from('coupon_redemptions_ledger').insert({
        coupon_id: appliedCouponId,
        user_id: userId,
        order_id: order.id,
      });

      const { data: coupon } = await supabase
        .from('marketplace_coupons')
        .select('current_redemptions_count')
        .eq('id', appliedCouponId)
        .single();
      if (coupon) {
        await supabase
          .from('marketplace_coupons')
          .update({ current_redemptions_count: coupon.current_redemptions_count + 1 })
          .eq('id', appliedCouponId);
      }
    }

    const { data: payment, error: payError } = await supabase.functions.invoke(
      'initiate-payment',
      { body: { order_id: order.id, provider: 'CAMPAY' } }
    );

    if (payError) {
      alert('Payment initiation failed: ' + payError.message);
      setBuying(false);
      return;
    }

    if (payment?.payment_url) {
      window.location.href = payment.payment_url;
    } else {
      alert('Payment link could not be generated.');
    }
    setBuying(false);
  };

  if (loading) return <div className="p-4 text-center">Loading...</div>;
  if (!listing) return <div className="p-4 text-center">Listing not found.</div>;

  const finalAmount = listing.price - discount;

  // Final marketplace fee: 3% + 25 for members, 5% + 50 for non-members
  const feePct = isSubscribed ? 3 : 5;
  const feeFixed = isSubscribed ? 25 : 50;
  const estimatedFee = (finalAmount * (feePct / 100)) + feeFixed;

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <button onClick={() => navigate(-1)} className="text-navy font-bold mb-3">← Back</button>

      <div className="bg-white p-4 rounded-2xl shadow-sm">
        {listing.images?.[0] && (
          <img src={listing.images[0]} alt={listing.title} className="w-full h-56 object-cover rounded-xl mb-4" />
        )}

        <h1 className="text-xl font-bold text-navy">{listing.title}</h1>
        <p className="text-2xl font-bold text-gold mt-2">{listing.price} XAF</p>

        <button
          onClick={() => navigate(`/seller/${listing.seller_id}`)}
          className="text-gold text-sm font-bold mt-1"
        >
          View Seller Profile →
        </button>

        <div className="bg-gray-50 p-3 rounded-xl mt-4">
          <p className="text-xs text-gray-500 mb-1 font-bold">🛡️ Escrow Protection</p>
          <p className="text-xs text-gray-600">
            Your money is held securely by CenPaya. The seller is only paid after you confirm delivery, or 48 hours after they confirm shipment.
          </p>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-500 font-bold mb-1">
            Marketplace Fee ({isSubscribed ? 'Member' : 'Non-Member'})
          </p>
          <p className="text-xs text-gray-700">
            {feePct}% + {feeFixed} XAF ≈ {estimatedFee.toFixed(0)} XAF
          </p>
          {!isSubscribed && (
            <button
              onClick={() => navigate('/subscribe')}
              className="text-xs text-gold font-bold underline mt-1"
            >
              Subscribe to save with 3% + 25 XAF fees →
            </button>
          )}
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-xl">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Have a coupon?</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              disabled={!!appliedCouponId}
              className="flex-1 p-2 border rounded-lg bg-white font-mono text-sm"
            />
            <button
              onClick={handleApplyCoupon}
              disabled={!!appliedCouponId}
              className="bg-navy text-white font-bold px-4 rounded-lg text-sm disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          {couponMessage && <p className="text-xs mt-2 text-navy">{couponMessage}</p>}
        </div>

        {discount > 0 && (
          <div className="mt-3 p-3 bg-gold bg-opacity-20 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-navy">{listing.price} XAF</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Discount</span>
              <span className="text-red-500">-{discount.toFixed(0)} XAF</span>
            </div>
            <div className="flex justify-between font-bold text-navy border-t pt-2 mt-2">
              <span>Total</span>
              <span>{finalAmount.toFixed(0)} XAF</span>
            </div>
          </div>
        )}

        <button
          onClick={handleBuyNow}
          disabled={buying}
          className="w-full bg-gold text-navy py-3 rounded-xl font-bold mt-4 disabled:opacity-50"
        >
          {buying ? 'Processing...' : `Buy Now — ${finalAmount.toFixed(0)} XAF`}
        </button>
        <button
          onClick={() => navigate('/chat')}
          className="w-full bg-navy text-white py-3 rounded-xl font-bold mt-2"
        >
          Chat with Seller
        </button>
      </div>
    </div>
  );
}