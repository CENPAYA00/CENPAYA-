import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Image as ImageIcon, X, MapPin, FileText, ChevronRight, Check
} from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';

const CATEGORIES = [
  'Vehicles', 'Rentals', 'Women\'s clothing & shoes', 'Men\'s clothing & shoes',
  'Furniture', 'Electronics & computers', 'Antiques & Collectibles', 'Appliances',
  'Arts & Crafts', 'Auto parts', 'Baby & kids', 'Bags & Luggage', 'Bicycles',
  'Books, Movies & Music', 'Garage Sale', 'Garden', 'Health & beauty',
  'Home sales', 'Household', 'Jewelry & Accessories', 'Miscellaneous',
  'Mobile phones', 'Musical Instruments', 'Pet Supplies', 'Sports & Outdoors',
  'Tools', 'Toys & Games', 'Video Games',
];

const LISTING_TYPES = [
  { key: 'physical', label: 'Physical Item' },
  { key: 'service',  label: 'Service' },
  { key: 'digital',  label: 'Digital Product' },
];

type Availability = 'single' | 'in_stock';

export default function CreateListing() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [listingType, setListingType] = useState('physical');
  const [availability, setAvailability] = useState<Availability>('single');

  const [priceSingle, setPriceSingle] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [usePriceRange, setUsePriceRange] = useState(false);

  const [location, setLocation] = useState('');
  const [offerShipping, setOfferShipping] = useState(false);
  const [hideFromFriends, setHideFromFriends] = useState(false);

  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [docs, setDocs] = useState<File[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCachedUser().then(u => { if (mounted) setUser(u); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => { previews.forEach(p => URL.revokeObjectURL(p)); };
  }, [previews]);

  const handleImagePick = (files: FileList) => {
    const arr = Array.from(files);
    const next = [...images, ...arr].slice(0, 10);
    setImages(next);
    setPreviews(next.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map(f => URL.createObjectURL(f)));
  };

  const handleDocPick = (files: FileList) => {
    const arr = Array.from(files);
    setDocs([...docs, ...arr].slice(0, 5));
  };

  const handlePublish = async () => {
    setErrorMsg('');
    if (!title.trim() || title.trim().length < 3) return setErrorMsg('Title must be at least 3 characters.');
    if (!category) return setErrorMsg('Please select a category.');

    const finalPrice = usePriceRange ? null : Number(priceSingle);
    if (!usePriceRange && (!finalPrice || finalPrice <= 0)) {
      return setErrorMsg('Enter a valid price, or enable price range.');
    }
    if (usePriceRange && (!priceMin || Number(priceMin) <= 0)) {
      return setErrorMsg('Enter a valid minimum price.');
    }

    const me = user || await getCachedUser();
    if (!me) return setErrorMsg('You must be logged in.');

    setLoading(true);
    try {
      // Upload images with compression
      const imageUrls: string[] = [];
      for (const img of images) {
        const compressed = await compressImage(img);
        const ext = compressed.name.split('.').pop();
        const path = `listings/${me.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(path, compressed);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }

      // Upload documents (no compression)
      const docUrls: string[] = [];
      for (const d of docs) {
        const ext = d.name.split('.').pop();
        const path = `listing-docs/${me.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(path, d);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
        docUrls.push(urlData.publicUrl);
      }

      const payload: any = {
        seller_id: me.id,
        title: title.trim(),
        category,
        description: description.trim() || null,
        listing_type: listingType,
        delivery_required: offerShipping,
        availability: availability === 'in_stock' ? 'in_stock' : 'single',
        images: imageUrls.length > 0 ? imageUrls : null,
        documents: docUrls.length > 0 ? docUrls : null,
        location_city: location.trim() || me.location_city || null,
        location_country: me.country_iso || 'CM',
        currency_code: 'XAF',
        moderation_status: 'approved',
        is_active: true,
        hide_from_friends: hideFromFriends,
      };

      if (usePriceRange) {
        payload.price_is_range = true;
        payload.price_min = Number(priceMin);
        payload.price_max = priceMax ? Number(priceMax) : Number(priceMin);
        payload.price = Number(priceMin); // fallback for display
      } else {
        payload.price_is_range = false;
        payload.price = finalPrice;
        payload.price_min = finalPrice;
        payload.price_max = finalPrice;
      }

      const { data, error } = await supabase
        .from('listings')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      alert('Listing published!');
      navigate(`/listing/${data.id}`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not publish listing.');
    }
    setLoading(false);
  };

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 dark:border-darkline bg-white dark:bg-darkcard sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[15px] font-bold text-navy dark:text-white">New listing</h1>
        <button
          onClick={handlePublish}
          disabled={loading}
          className="text-accent text-[13px] font-bold disabled:opacity-50"
        >
          {loading ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">

        {/* Category picker */}
        <Field
          label="Category"
          value={category || 'Select'}
          onClick={() => setShowCategories(true)}
          accent={!!category}
        />

        {/* Title */}
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">What are you selling?</p>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Generator 5KVA Petrol"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
          />
        </div>

        {/* Price */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Price (XAF)</p>
            <button
              onClick={() => setUsePriceRange(v => !v)}
              className="text-[10px] font-bold text-accent"
            >
              {usePriceRange ? 'Use single price' : 'Use price range'}
            </button>
          </div>
          {!usePriceRange ? (
            <input
              type="number"
              value={priceSingle}
              onChange={e => setPriceSingle(e.target.value)}
              placeholder="e.g. 280000"
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
            />
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                placeholder="Min"
                className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
              />
              <input
                type="number"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                placeholder="Max"
                className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
              />
            </div>
          )}
        </div>

        {/* Location */}
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
            <MapPin size={12} /> Location
          </p>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={user?.location_city || 'Yaoundé'}
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
          />
        </div>

        {/* Description */}
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Description</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="Add details about condition, size, etc."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px] resize-none"
          />
        </div>

        {/* Listing type */}
        <Field
          label="Listing type"
          value={LISTING_TYPES.find(t => t.key === listingType)?.label || ''}
          onClick={() => setShowTypes(true)}
        />

        {/* Availability */}
        <Field
          label="Availability"
          value={availability === 'single' ? 'List as Single Item' : 'List as In Stock'}
          onClick={() => setShowAvailability(true)}
        />

        {/* Offer shipping */}
        <ToggleRow
          label="Offer shipping"
          value={offerShipping}
          onChange={setOfferShipping}
        />

        {/* Hide from friends */}
        <ToggleRow
          label="Hide from friends"
          value={hideFromFriends}
          onChange={setHideFromFriends}
        />

        {/* Photos */}
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2">
            Photos ({images.length}/10)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square">
                <img src={src} alt="" className="w-full h-full object-cover rounded-lg" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/70 text-white rounded-full flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="aspect-square border-2 border-dashed border-gray-300 dark:border-darkline rounded-lg flex flex-col items-center justify-center text-gray-400"
              >
                <ImageIcon size={22} />
                <span className="text-[9px] mt-1 font-bold">Add photo</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleImagePick(e.target.files)}
          />
        </div>

        {/* Documents */}
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
            <FileText size={12} /> Documents (PDF, DOC, PPT, XLS) — optional
          </p>
          <button
            onClick={() => docRef.current?.click()}
            className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-darkline text-[12px] text-gray-500 flex items-center justify-center gap-2"
          >
            <FileText size={14} /> Add document
          </button>
          {docs.length > 0 && (
            <div className="mt-2 space-y-1">
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
                  <FileText size={12} className="text-accent" />
                  <span className="flex-1 text-[11px] truncate text-navy dark:text-white">{d.name}</span>
                  <button
                    onClick={() => setDocs(docs.filter((_, x) => x !== i))}
                    className="text-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={docRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleDocPick(e.target.files)}
          />
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-3 rounded-xl">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Category sheet */}
      {showCategories && (
        <BottomSheet title="Change Category" onClose={() => setShowCategories(false)}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => { setCategory(c); setShowCategories(false); }}
              className="w-full px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-darkline text-left"
            >
              <span className="flex-1 text-[13px] text-navy dark:text-white">{c}</span>
              {category === c && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </BottomSheet>
      )}

      {/* Type sheet */}
      {showTypes && (
        <BottomSheet title="Listing type" onClose={() => setShowTypes(false)}>
          {LISTING_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => { setListingType(t.key); setShowTypes(false); }}
              className="w-full px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-darkline text-left"
            >
              <span className="flex-1 text-[13px] text-navy dark:text-white">{t.label}</span>
              {listingType === t.key && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </BottomSheet>
      )}

      {/* Availability sheet */}
      {showAvailability && (
        <BottomSheet title="Choose availability" onClose={() => setShowAvailability(false)}>
          <button
            onClick={() => { setAvailability('single'); setShowAvailability(false); }}
            className="w-full px-4 py-3 flex items-start gap-3 border-b border-gray-100 dark:border-darkline text-left"
          >
            <div className="flex-1">
              <p className="text-[13px] font-bold text-navy dark:text-white">List as Single Item</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                If you're selling one item, show "Only one" on your listing.
              </p>
            </div>
            {availability === 'single' && <Check size={16} className="text-accent mt-1" />}
          </button>
          <button
            onClick={() => { setAvailability('in_stock'); setShowAvailability(false); }}
            className="w-full px-4 py-3 flex items-start gap-3 text-left"
          >
            <div className="flex-1">
              <p className="text-[13px] font-bold text-navy dark:text-white">List as In Stock</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                If you're selling more than one item, show "In Stock" on your listing.
              </p>
            </div>
            {availability === 'in_stock' && <Check size={16} className="text-accent mt-1" />}
          </button>
        </BottomSheet>
      )}
    </div>
  );
}

function Field({
  label, value, onClick, accent,
}: { label: string; value: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-left"
    >
      <div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-[13px] font-bold ${accent ? 'text-accent' : 'text-navy dark:text-white'}`}>
          {value}
        </p>
      </div>
      <ChevronRight size={16} className="text-gray-400" />
    </button>
  );
}

function ToggleRow({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard">
      <p className="text-[12px] text-navy dark:text-white">{label}</p>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-gray-300 dark:bg-darkline'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}

function BottomSheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-h-[80vh] bg-white dark:bg-darkcard rounded-t-2xl overflow-y-auto animate-slide-up"
      >
        <div className="sticky top-0 bg-white dark:bg-darkcard p-3 flex items-center gap-3 border-b border-gray-100 dark:border-darkline">
          <button onClick={onClose}><ArrowLeft size={18} /></button>
          <p className="flex-1 text-center text-[13px] font-bold text-navy dark:text-white">{title}</p>
          <div className="w-[18px]" />
        </div>
        {children}
      </div>
    </div>
  );
    }
