import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Wallet, Smartphone, Shield, Check, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import Select from '../components/Select';

type PaymentMethod = 'wallet' | 'momo';

export default function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listingId = params.get('listing');
  const serviceId = params.get('service');
  const packageId = params.get('package');

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('wallet');
  const [payPhone, setPayPhone] = useState('');
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState('');
  const [countries, setCountries] = useState<any[]>([]);
  const [country, setCountry] = useState('CM');
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    const load = async () => {
      const me = await getCachedUser();
      if (!me) { navigate('/'); return; }

      // Fetch item
      if (listingId) {
        const { data } = await supabase.from('listings').select('*').eq('id', listingId).single();
        setItem({ ...data, _kind: 'listing' });
      } else if (serviceId) {
        const { data } = await supabase.from('services').select('*').eq('id', serviceId).single();
        let pkg = null;
        if (packageId) {
          const { data: p } = await supabase.from('service_packages').select('*').eq('id', packageId).maybeSingle();
          pkg = p;
        }
        setItem({ ...data, _kind: 'service', _pkg: pkg });
      }

      // Seller
      const { data: order } = await supabase.from('listings').select('seller_id').eq('id', listingId || '').maybeSingle();
      const sellerId = order?.seller_id;
      if (sellerId) {
        const { data: p } = await supabase.from('public_profiles').select('id, username, avatar_url').eq('id', sellerId).maybeSingle();
        setSeller(p);
      }

      // Wallet
      const { data: profile } = await supabase.from('users').select('wallet_balance, phone, country_iso, region, city').eq('id', me.id).maybeSingle();
      setWalletBalance(Number(profile?.wallet_balance || 0));
      setPayPhone(profile?.phone || '');
      setCountry(profile?.country_iso || 'CM');
      setRegion(profile?.region || '');
      setCity(profile?.city || '');

      // Countries
      const { data: countryData } = await supabase
        .from('supported_countries')
        .select('code, name, phone_prefix, flag_emoji, regions, cities')
        .in('code', ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'])
        .order('name');
      setCountries(countryData || []);
      const cRow = (countryData || []).find((x: any) => x.code === (profile?.country_iso || 'CM'));
      const rList = Array.isArray(cRow?.regions) ? cRow.regions : [];
      setRegions(rList);
      if (!rList.includes(region)) setRegion(rList[0] || '');
      const cList = (cRow?.cities || {})[region] || [];
      setCities(cList);
      if (!cList.includes(city)) setCity(cList[0] || '');

      setLoading(false);
    };
    load();
  }, [listingId, serviceId, packageId, navigate]);

  // Cascade region/city when country changes
  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const rList = Array.isArray(c?.regions) ? c.regions : [];
    setRegions(rList);
    if (!rList.includes(region)) setRegion(rList[0] || '');
  }, [country, countries]);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const cList = (c?.cities || {})[region] || [];
    setCities(cList);
    if (!cList.includes(city)) setCity(cList[0] || '');
  }, [region, country, countries]);

  const amount = item?._kind === 'service'
    ? Number(item?._pkg?.price || item?.starting_price || 0)
    : (item?.price_is_range ? Number(item?.price_min || 0) : Number(item?.price || 0));

  const platformFee = Math.round(amount * 0.02); // 2% — adjust if different
  const total = amount + platformFee;

  const confirm = async () => {
    setErr('');
    if (!item) return setErr('Item not found.');
    if (method === 'wallet' && walletBalance < total) return setErr('Insufficient wallet balance. Top up first.');
    if (method === 'momo' && !payPhone.trim()) return setErr('Enter your Mobile Money number.');

    setProcessing(true);
    const me = await getCachedUser();
    if (!me) { setProcessing(false); return; }

    const payload: any = {
      buyer_id: me.id,
      seller_id: item.seller_id,
      amount,
      platform_fee: platformFee,
      total_amount: total,
      payment_method: method,
      payment_phone: method === 'momo' ? payPhone : null,
      escrow_status: 'hold',
      escrow_created_at: new Date().toISOString(),
      shipping_country: country,
      shipping_region: region,
      shipping_city: city,
      shipping_address: address.trim() || null,
      buyer_note: note.trim() || null,
    };

    if (item._kind === 'listing') {
      payload.listing_id = item.id;
      payload.listing_title = item.title;
    } else {
      payload.service_id = item.id;
      payload.service_package_id = packageId;
      payload.listing_title = item.title;
    }

    const { data, error } = await supabase.from('orders').insert(payload).select().single();
    setProcessing(false);

    if (error) { setErr(error.message); return; }
    navigate(`/order/${data.id}`);
  };

  if (loading) return <div className="p-4 text-center text-xs">Loading checkout…</div>;
  if (!item) return <div className="p-4 text-center text-xs">Item not found.</div>;

  return (
    <div className="pb-28">
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-20 bg-white dark:bg-darkcard border-b border-gray-100 dark:border-darkline">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[14px] font-bold text-navy dark:text-white">Checkout</h1>
      </div>

      {/* Item summary */}
      <div className="p-3">
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 flex gap-3 mb-3">
          {item.images?.[0] || item.thumbnail_url ? (
            <img
              src={Array.isArray(item.images) ? item.images[0] : item.thumbnail_url}
              alt=""
              className="w-16 h-16 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-darkbg shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">{item.title}</p>
            {seller && <p className="text-[10px] text-gray-500 mt-0.5">@{seller.username}</p>}
            <p className="text-[14px] font-black text-accent mt-1">{amount.toLocaleString()} XAF</p>
          </div>
        </div>
      </div>

      {/* Shipping / Delivery */}
      <div className="px-3 space-y-3 mb-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <MapPin size={11} /> Delivery address (optional)
        </p>

        <Select
          label="Country"
          value={country}
          onChange={setCountry}
          options={countries.map(c => ({ value: c.code, label: `${c.flag_emoji || ''} ${c.name}`.trim() }))}
        />

        {regions.length > 0 && (
          <Select label="Region" value={region} onChange={setRegion} options={regions.map(r => ({ value: r, label: r }))} />
        )}
        {cities.length > 0 && (
          <Select label="City" value={city} onChange={setCity} options={cities.map(c => ({ value: c, label: c }))} />
        )}

        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="Street / landmark (optional)"
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      {/* Payment method */}
      <div className="px-3 space-y-2 mb-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment method</p>

        <button
          onClick={() => setMethod('wallet')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${
            method === 'wallet' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent">
            <Wallet size={16} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-bold text-navy dark:text-white">Wallet</p>
            <p className="text-[10px] text-gray-500">Balance: {walletBalance.toLocaleString()} XAF</p>
          </div>
          {method === 'wallet' && <Check size={16} className="text-accent" />}
        </button>

        <button
          onClick={() => setMethod('momo')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left ${
            method === 'momo' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent">
            <Smartphone size={16} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-bold text-navy dark:text-white">Mobile Money</p>
            <p className="text-[10px] text-gray-500">MTN / Orange MoMo</p>
          </div>
          {method === 'momo' && <Check size={16} className="text-accent" />}
        </button>

        {method === 'momo' && (
          <input
            value={payPhone}
            onChange={e => setPayPhone(e.target.value)}
            placeholder="+237 6XX XXX XXX"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[12px]"
          />
        )}
      </div>

      {/* Order summary */}
      <div className="px-3 mb-3">
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Item</span>
            <span className="font-bold text-navy dark:text-white">{amount.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Platform fee (2%)</span>
            <span className="font-bold text-navy dark:text-white">{platformFee.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[13px] pt-1.5 border-t border-gray-100 dark:border-darkline">
            <span className="font-bold text-navy dark:text-white">Total</span>
            <span className="font-black text-accent">{total.toLocaleString()} XAF</span>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="px-3 mb-3">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note for seller (optional)"
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      {/* Escrow info */}
      <div className="px-3 mb-3">
        <div className="bg-gray-50 dark:bg-darkbg rounded-xl p-3 flex items-start gap-2">
          <Shield size={14} className="text-accent shrink-0 mt-0.5" />
          <p className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed">
            Your payment is held in escrow. The seller is only paid after you confirm delivery, or 72 hours after they confirm shipment.
          </p>
        </div>
      </div>

      {err && (
        <div className="px-3 mb-3">
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl">{err}</div>
        </div>
      )}

      {/* Sticky confirm */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkcard border-t border-gray-100 dark:border-darkline p-3 z-40">
        <div className="max-w-[600px] mx-auto">
          <button
            onClick={confirm}
            disabled={processing}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50 cursor-pointer"
          >
            {processing ? 'Processing…' : `Pay ${total.toLocaleString()} XAF`}
          </button>
        </div>
      </div>
    </div>
  );
      }
