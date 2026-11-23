import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Wallet, Smartphone, Shield, Check, MapPin } from 'lucide-react';
import { supabaseWorkerRequest } from '../lib/supabaseWorkerApi';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';
import Select from '../components/Select';

type PaymentMethod = 'wallet' | 'momo';
type CheckoutItem = {
  id: string; title?: string; seller_id?: string; price?: number | string;
  price_min?: number | string; price_is_range?: boolean; starting_price?: number | string;
  images?: string[]; thumbnail_url?: string; _kind?: 'listing' | 'service';
};
type ServicePackage = { id: string; title?: string; price?: number | string };
type SellerProfile = { username?: string | null };
type CheckoutCountry = {
  code: string; country_code?: string; name: string; flag_emoji?: string;
  regions?: string[]; cities?: Record<string, string[]>;
};
type PersonalDetails = { phone?: string | null; country_iso?: string | null; region?: string | null; city?: string | null };

export default function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listingId = params.get('listing');
  const serviceId = params.get('service');
  const packageId = params.get('package');

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<CheckoutItem | null>(null);
  const [pkg, setPkg] = useState<ServicePackage | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [walletFunds, setWalletFunds] = useState<number>(0);
  const [feePct, setFeePct] = useState<number>(0);
  const [feeFixed, setFeeFixed] = useState<number>(0);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  const [serverPlatformFee, setServerPlatformFee] = useState(0);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [quoteReady, setQuoteReady] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('wallet');
  const [payPhone, setPayPhone] = useState('');
  const [requirements, setRequirements] = useState('');
  const [milestones, setMilestones] = useState<{ title: string; amount: number }[]>([]);
  const [processing, setProcessing] = useState(false);
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const [err, setErr] = useState('');

  const [countries, setCountries] = useState<CheckoutCountry[]>([]);
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

      let loadedItem: CheckoutItem | null = null;

      if (listingId) {
        const { data } = await d1Request<{ data: Omit<CheckoutItem, '_kind'> }>(`/api/market/listings/${encodeURIComponent(listingId)}`);
        loadedItem = data ? { ...data, _kind: 'listing' } : null;
      } else if (serviceId) {
        const { data } = await d1Request<{ data: Omit<CheckoutItem, '_kind'> }>(`/api/market/listings/${encodeURIComponent(serviceId)}`);
        loadedItem = data ? { ...data, _kind: 'service' } : null;

        if (packageId) {
          const { data: packages } = await d1Request<{ data: ServicePackage[] }>(`/api/market/listings/${encodeURIComponent(serviceId)}/packages`);
          const selectedPackage = (packages || []).find(p => p.id === packageId) || null;
          setPkg(selectedPackage);
          setServerAmount(Number(selectedPackage?.price || loadedItem?.starting_price || 0));
          setServerTotal(Number(selectedPackage?.price || loadedItem?.starting_price || 0));
        }
      }

      setItem(loadedItem);

      if (loadedItem?.seller_id) {
        const { data: p } = await d1Request<{ data: SellerProfile }>(`/api/profiles/${encodeURIComponent(loadedItem.seller_id)}`);
        setSeller(p);
      }

      try {
        const walletResponse = await supabaseWorkerRequest<{ data: { available_funds?: number } | null }>('/api/v1/wallet');
        setWalletFunds(Number(walletResponse.data?.available_funds || 0));
      } catch { setWalletFunds(0); }

      if (listingId) {
        try {
          const quoteResponse = await supabaseWorkerRequest<{ data: { amount: number; fee_pct: number; fee_fixed: number; platform_fee: number; total: number } }>(`/api/v1/checkout/quote?listing_id=${encodeURIComponent(listingId)}`);
          setServerAmount(Number(quoteResponse.data.amount));
          setFeePct(Number(quoteResponse.data.fee_pct));
          setFeeFixed(Number(quoteResponse.data.fee_fixed));
          setServerPlatformFee(Number(quoteResponse.data.platform_fee));
          setServerTotal(Number(quoteResponse.data.total));
          setMilestones([{ title: 'Project delivery', amount: Number(quoteResponse.data.amount) }]);
          setQuoteReady(true);
        } catch { setQuoteReady(false); }
      } else if (serviceId) {
        try {
          const quoteResponse = await supabaseWorkerRequest<{ data: {
            seller_id: string; amount: number; fee_pct: number; fee_fixed: number;
            platform_fee: number; total: number; currency_code: string;
          } }>(`/api/v1/checkout/service-quote?service_id=${encodeURIComponent(serviceId)}`);
          setServerAmount(Number(quoteResponse.data.amount));
          setFeePct(Number(quoteResponse.data.fee_pct));
          setFeeFixed(Number(quoteResponse.data.fee_fixed));
          setServerPlatformFee(Number(quoteResponse.data.platform_fee));
          setServerTotal(Number(quoteResponse.data.total));
          setQuoteReady(true);
        } catch { setQuoteReady(false); }
      } else {
        setQuoteReady(false);
      }

      const { data: profile } = await d1Request<{ data: PersonalDetails }>('/api/me/personal-details');
      setPayPhone(profile?.phone || '');
      setCountry(profile?.country_iso || 'CM');
      setRegion(profile?.region || '');
      setCity(profile?.city || '');

      const { data: countryData } = await d1Request<{ data: Array<Omit<CheckoutCountry, 'code'> & { country_code: string }> }>('/api/countries');
      const normalizedCountries: CheckoutCountry[] = (countryData || []).map(row => ({ ...row, code: row.country_code }));
      setCountries(normalizedCountries);
      const cRow = normalizedCountries.find(x => x.code === (profile?.country_iso || 'CM'));
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

  const amount = serverAmount ?? (item?._kind === 'service'
    ? Number(pkg?.price || item?.starting_price || 0)
    : (item?.price_is_range ? Number(item?.price_min || 0) : Number(item?.price || 0)));

  const feePctAmount = serverPlatformFee;
  const total = serverTotal ?? amount;

  // ⚠️ Renamed from 'confirm' to 'handleConfirmOrder' to avoid clashing with window.confirm
  const handleConfirmOrder = async () => {
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
        if (method !== 'wallet') throw new Error('Freelance escrow currently supports wallet payment only.');
        if (requirements.trim().length < 5) throw new Error('Please describe the work required (at least 5 characters).');
        if (milestones.length === 0 || milestones.some(m => !m.title.trim() || !Number.isSafeInteger(m.amount) || m.amount <= 0) ||
            milestones.reduce((sum, m) => sum + m.amount, 0) !== amount) {
          throw new Error('Milestone amounts must be positive and add up exactly to the service price.');
        }
        const proposedDeadline = new Date(Date.now() + Math.max(1, Number((item as any).delivery_days) || 7) * 86400000);
        const response = await supabaseWorkerRequest<{ data: { order_id?: string; id?: string; ok?: boolean; error?: string } }>('/api/v1/checkout/service-orders', {
          method: 'POST',
          body: JSON.stringify({
            seller_id: item.seller_id, service_id: item.id, package_id: packageId || null,
            amount, requirements: requirements.trim(), due_at: proposedDeadline.toISOString(),
            payment_method: 'wallet',
            milestones: milestones.map(m => ({ title: m.title.trim(), amount: m.amount, due_at: proposedDeadline.toISOString() })),
          }),
        });
        const orderId = response.data.order_id || response.data.id;
        if (!orderId) throw new Error(response.data.error || 'Service order was not created.');
        navigate(`/service-order/${orderId}`);
      } else {
        const response = await supabaseWorkerRequest<{ data: { id: string } }>('/api/v1/checkout/orders', {
          method: 'POST',
          body: JSON.stringify({
            listing_id: item.id,
            idempotency_key: checkoutIdempotencyKey.current || (checkoutIdempotencyKey.current = crypto.randomUUID()),
            payment_method: method,
            payment_phone: method === 'momo' ? payPhone : null,
            shipping_country: country,
            shipping_region: region,
            shipping_city: city,
            shipping_address: address.trim() || null,
          }),
        });
        navigate(`/order/${response.data.id}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Payment failed';
      if (/insufficient/i.test(message)) setErr('Insufficient wallet balance. Top up first.');
      else if (/idempotency|duplicate/i.test(message)) setErr('This checkout was already submitted. Refresh your orders before retrying.');
      else if (/marketplace_mobile_money_checkout_unavailable/i.test(message)) setErr('Mobile Money marketplace checkout is not available yet. Use your wallet or top up first.');
      else if (/service_quote_unavailable/i.test(message)) setErr('The service price could not be verified. Please refresh and try again.');
      else if (/provider_rejected/i.test(message)) setErr('The payment provider rejected the request. Check the payment details and try again.');
      else if (/uncertain|timeout|network/i.test(message)) setErr('Payment status is uncertain. Check your orders before retrying to avoid duplicate payment.');
      else setErr(message);
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
        <div className="px-3 mb-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Requirements for the seller</p>
          <textarea
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            rows={4}
            placeholder="What should the freelancer know about your project?"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[12px] resize-none"
          />
          </div>
          <div className="bg-white dark:bg-darkcard rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Milestone funding</p>
              <button type="button" onClick={() => setMilestones(rows => [...rows, { title: '', amount: 0 }])}
                className="text-[10px] font-bold text-accent">+ Add milestone</button>
            </div>
            {milestones.map((m, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input value={m.title} onChange={e => setMilestones(rows => rows.map((row,i) => i === index ? { ...row, title: e.target.value } : row))}
                  placeholder={`Milestone ${index + 1}`} className="min-w-0 flex-1 p-2 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
                <input type="number" min="1" value={m.amount || ''} onChange={e => setMilestones(rows => rows.map((row,i) => i === index ? { ...row, amount: Number(e.target.value) } : row))}
                  placeholder="XAF" className="w-24 p-2 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs" />
                {milestones.length > 1 && <button type="button" onClick={() => setMilestones(rows => rows.filter((_,i) => i !== index))} className="text-red-500 text-xs">×</button>}
              </div>
            ))}
            <p className="text-[10px] text-gray-500">Allocated: {milestones.reduce((sum,m) => sum + (Number(m.amount)||0),0).toLocaleString()} / {amount.toLocaleString()} XAF</p>
          </div>
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

        {item._kind === 'listing' && <button
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
        </button>}

        {item._kind === 'listing' && method === 'momo' && (
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
            <span className="text-gray-500">Platform fee</span>
            <span className="font-bold text-navy dark:text-white">{feePctAmount.toLocaleString()} XAF</span>
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
            Your payment is held in escrow. For physical goods, release requires your confirmation or verified delivery plus the inspection window. For freelance services, the seller confirms the deadline; missed deadlines refund the remaining escrow, and accepted milestones are paid individually.
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
            onClick={handleConfirmOrder}
            disabled={processing || !quoteReady}
            className="w-full bg-accent text-white font-bold py-3 rounded-xl text-[13px] disabled:opacity-50 cursor-pointer"
          >
            {processing ? 'Processing…' : !quoteReady ? 'Checkout quote unavailable' : `Pay ${total.toLocaleString()} XAF`}
          </button>
        </div>
      </div>
    </div>
  );
          }
