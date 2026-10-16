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
  const [pkg, setPkg] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [walletFunds, setWalletFunds] = useState<number>(0);
  const [feePct, setFeePct] = useState<number>(3);
  const [feeFixed, setFeeFixed] = useState<number>(50);
  const [method, setMethod] = useState<PaymentMethod>('wallet');
  const [payPhone, setPayPhone] = useState('');
  const [requirements, setRequirements] = useState('');
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

      let loadedItem: any = null;

      if (listingId) {
        const { data } = await supabase.from('listings').select('*').eq('id', listingId).single();
        loadedItem = data ? { ...data, _kind: 'listing' } : null;
      } else if (serviceId) {
        const { data } = await supabase.from('services').select('*').eq('id', serviceId).single();
        loadedItem = data ? { ...data, _kind: 'service' } : null;

        if (packageId) {
          const { data: p } = await supabase.from('service_packages').select('*').eq('id', packageId).maybeSingle();
          setPkg(p);
        }
      }

      setItem(loadedItem);

      if (loadedItem?.seller_id) {
        const { data: p } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url')
          .eq('id', loadedItem.seller_id)
          .maybeSingle();
        setSeller(p);
      }

      // Wallet
      const { data: w } = await supabase.from('wallets').select('available_funds').eq('user_id', me.id).maybeSingle();
      setWalletFunds(Number(w?.available_funds || 0));

      // Fees
      try {
        const { data: fPct } = await supabase.rpc('setting', { p_key: 'fee_pct_non_member' });
        const { data: fFixed } = await supabase.rpc('setting', { p_key: 'fee_fixed_non_member' });
        setFeePct(Number(fPct ?? 3));
        setFeeFixed(Number(fFixed ?? 50));
      } catch {
        setFeePct(3);
        setFeeFixed(50);
      }

      // Profile defaults
      const { data: profile } = await supabase
        .from('users')
        .select('phone, country_iso, region, city')
        .eq('id', me.id)
        .maybeSingle();
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
      const rList: string[] = Array.isArray(cRow?.regions) ? cRow.regions : [];
      setRegions(rList);
      if (!rList.includes(region)) setRegion(rList[0] || '');
      const cList: string[] = (cRow?.cities || {})[region] || [];
      setCities(cList);
      if (!cList.includes(city)) setCity(cList[0] || '');

      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, serviceId, packageId]);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const rList: string[] = Array.isArray(c?.regions) ? c.regions : [];
    setRegions(rList);
    if (!rList.includes(region)) setRegion(rList[0] || '');
  }, [country, countries]);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === country);
    const cList: string[] = (c?.cities || {})[region] || [];
    setCities(cList);
    if (!cList.includes(city)) setCity(cList[0] || '');
  }, [region, country, countries]);

  const amount = item?._kind === 'service'
    ? Number(pkg?.price || item?.starting_price || 0)
    : (item?.price_is_range ? Number(item?.price_min || 0) : Number(item?.price || 0));

  const feePctAmount = Math.round(amount * feePct / 100);
  const total = amount + feePctAmount + feeFixed;

  const confirm = async () => {
    setErr('');
    if (!item) return setErr('Item not found.');
    if (method === 'wallet' && walletFunds < total) {
      return setErr(`Insufficient wallet balance. You need ${total.toLocaleString()} XAF. Top up first.`);
    }
    if (method === 'momo' && !payPhone.trim()) return setErr('Enter your Mobile Money number.');

    setProcessing(true);
    const me = await getCachedUser();
    if (!me) { setProcessing(false); return; }

    try {
      if (item._kind === 'service') {
        const { data, error } = await supabase.rpc('create_service_order', {
          p_service_id: item.id,
          p_package_id: packageId,
          p_requirements: requirements.trim() || null,
          p_pay_from_wallet: method === 'wallet',
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Order failed');
        navigate(`/service-order/${data.order_id}`);
      } else {
        const payload: any = {
          buyer_id: me.id,
          seller_id: item.seller_id,
          listing_id: item.id,
          listing_title: item.title,
          amount,
          currency_code: 'XAF',
          fee_pct: feePct,
          fee_fixed: feeFixed,
          escrow_status: 'hold',
          escrow_created_at: new Date().toISOString(),
          shipping_country: country,
          shipping_region: region,
          shipping_city: city,
          shipping_address: address.trim() || null,
          payment_method: method,
          payment_phone: method === 'momo' ? payPhone : null,
        };

        const { data, error } = await supabase.from('orders').insert(payload).select().single();
        if (error) throw error;
        navigate(`/order/${data.id}`);
      }
    } catch (e: any) {
      setErr(e.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
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
            <p className="text-[12px] font-bold text-navy dark:text-white truncate">
              {item.title}
              {pkg && <span className="text-gray-500"> · {pkg.title}</span>}
            </p>
            {seller && <p className="text-[10px] text-gray-500 mt-0.5">@{seller.username}</p>}
            <p className="text-[14px] font-black text-accent mt-1">{amount.toLocaleString()} XAF</p>
          </div>
        </div>
      </div>

      {item._kind === 'listing' && (
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
      )}

      {item._kind === 'service' && (
        <div className="px-3 mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Requirements for the seller</p>
          <textarea
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            rows={4}
            placeholder="What should the freelancer know about your project?"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[12px] resize-none"
          />
        </div>
      )}

      <div className="px-3 space-y-2 mb-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment method</p>

        <button
          onClick={() => setMethod('wallet')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left cursor-pointer ${
            method === 'wallet' ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-darkline'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent">
            <Wallet size={16} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-bold text-navy dark:text-white">Wallet</p>
            <p className="text-[10px] text-gray-500">Available: {walletFunds.toLocaleString()} XAF</p>
          </div>
          {method === 'wallet' && <Check size={16} className="text-accent" />}
        </button>

        <button
          onClick={() => setMethod('momo')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left cursor-pointer ${
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

      <div className="px-3 mb-3">
        <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm p-3 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Item</span>
            <span className="font-bold text-navy dark:text-white">{amount.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Platform fee ({feePct}%)</span>
            <span className="font-bold text-navy dark:text-white">{feePctAmount.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Service fee</span>
            <span className="font-bold text-navy dark:text-white">{feeFixed.toLocaleString()} XAF</span>
          </div>
          <div className="flex justify-between text-[13px] pt-1.5 border-t border-gray-100 dark:border-darkline">
            <span className="font-bold text-navy dark:text-white">Total</span>
            <span className="font-black text-accent">{total.toLocaleString()} XAF</span>
          </div>
        </div>
      </div>

      <div className="px-3 mb-3">
        <div className="bg-gray-50 dark:bg-darkbg rounded-xl p-3 flex items-start gap-2">
          <Shield size={14} className="text-accent shrink-0 mt-0.5" />
          <p className="text-[10px] text-gray-600 dark:text-gray-300 leading-relaxed">
            Your payment is held in escrow. The seller is only paid after you confirm delivery, or automatically 48 hours after they mark delivered.
          </p>
        </div>
      </div>

      {err && (
        <div className="px-3 mb-3">
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl">{err}</div>
        </div>
      )}

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
