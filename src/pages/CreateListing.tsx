import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Image as ImageIcon, X, MapPin, FileText, Check
} from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import Select from '../components/Select';
import {
  Field, ToggleRow, BottomSheet, ListingCategoryPicker, ListingAvailabilityPicker
} from '../components/CreateListingParts';

type Category = {
  id: string;
  slug: string;
  display_name: string;
  icon: string | null;
  listing_type: string;
  section: string;
  display_order: number;
};

type Availability = 'single' | 'in_stock';

export default function CreateListing() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [availability, setAvailability] = useState<Availability>('single');

  const [priceSingle, setPriceSingle] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [usePriceRange, setUsePriceRange] = useState(false);

  // Location
  const [countries, setCountries] = useState<any[]>([]);
  const [countryIso, setCountryIso] = useState('CM');
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('');

  const [offerShipping, setOfferShipping] = useState(false);
  const [hideFromFriends, setHideFromFriends] = useState(false);

  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [docs, setDocs] = useState<File[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);

  useEffect(() => {
    const load = async () => {
      const u = await getCachedUser();
      setUser(u);

      const [catsRes, countryRes] = await Promise.all([
        supabase
          .from('listing_categories')
          .select('id, slug, display_name, icon, listing_type, section, display_order')
          .eq('is_active', true)
          .order('section', { ascending: true })
          .order('display_order', { ascending: true }),
        supabase
          .from('supported_countries')
          .select('code, name, phone_prefix, flag_emoji, regions, cities')
          .in('code', ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'])
          .order('name'),
      ]);

      if (catsRes.data) setCategories(catsRes.data as Category[]);
      const countryData = countryRes.data || [];
      setCountries(countryData);

      const iso = u?.country_iso || 'CM';
      setCountryIso(iso);

      const countryRow = countryData.find((x: any) => x.code === iso);
      const rList: string[] = Array.isArray(countryRow?.regions) ? countryRow.regions : [];
      setRegions(rList);

      const initialRegion = u?.region || rList[0] || '';
      setRegion(initialRegion);

      const cList: string[] = (countryRow?.cities || {})[initialRegion] || [];
      setCities(cList);
      setCity(u?.city || cList[0] || '');
    };
    load();
  }, []);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === countryIso);
    const rList: string[] = Array.isArray(c?.regions) ? c.regions : [];
    setRegions(rList);
    if (!rList.includes(region)) setRegion(rList[0] || '');
  }, [countryIso, countries]);

  useEffect(() => {
    if (countries.length === 0) return;
    const c = countries.find(x => x.code === countryIso);
    const cList: string[] = (c?.cities || {})[region] || [];
    setCities(cList);
    if (!cList.includes(city)) setCity(cList[0] || '');
  }, [region, countries, countryIso]);

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
    if (!selectedCategory) return setErrorMsg('Please select a category.');
    if (!region || !city) return setErrorMsg('Please select the region and city.');

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
        category: selectedCategory.slug,
        category_id: selectedCategory.id,
        description: description.trim() || null,
        listing_type: selectedCategory.listing_type,
        delivery_required: offerShipping,
        availability: availability === 'in_stock' ? 'in_stock' : 'single',
        images: imageUrls.length > 0 ? imageUrls : null,
        documents: docUrls.length > 0 ? docUrls : null,
        location_city: `${region} - ${city}`,
        location_region: region,
        location_country: countryIso,
        currency_code: 'XAF',
        moderation_status: 'approved',
        is_active: true,
        hide_from_friends: hideFromFriends,
      };

      if (usePriceRange) {
        payload.price_is_range = true;
        payload.price_min = Number(priceMin);
        payload.price_max = priceMax ? Number(priceMax) : Number(priceMin);
        payload.price = Number(priceMin);
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

  // Group categories by section (hide 'services')
  const sections = categories
    .filter(c => c.section !== 'services')
    .reduce<Record<string, Category[]>>((acc, c) => {
      (acc[c.section] = acc[c.section] || []).push(c);
      return acc;
    }, {});

  return (
    <div className="pb-32">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 dark:border-darkline bg-white dark:bg-darkcard sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-navy dark:text-white cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[15px] font-bold text-navy dark:text-white">New listing</h1>
        <button
          onClick={handlePublish}
          disabled={loading}
          className="text-accent text-[13px] font-bold disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        <Field
          label="Category"
          value={selectedCategory?.display_name || 'Select'}
          onClick={() => setShowCategories(true)}
          accent={!!selectedCategory}
        />

        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">What are you selling?</p>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Generator 5KVA Petrol"
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard text-[13px]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Price (XAF)</p>
            <button
              onClick={() => setUsePriceRange(v => !v)}
              className="text-[10px] font-bold text-accent cursor-pointer"
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

        <div className="space-y-2">
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
            <MapPin size={12} /> Location
          </p>
          {regions.length > 0 && (
            <Select
              value={region}
              onChange={setRegion}
              options={regions.map(r => ({ value: r, label: r }))}
              placeholder="Choose region"
            />
          )}
          {cities.length > 0 && (
            <Select
              value={city}
              onChange={setCity}
              options={cities.map(c => ({ value: c, label: c }))}
              placeholder="Choose city"
            />
          )}
        </div>

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

        <Field
          label="Availability"
          value={availability === 'single' ? 'List as Single Item' : 'List as In Stock'}
          onClick={() => setShowAvailability(true)}
        />

        <ToggleRow label="Offer shipping" value={offerShipping} onChange={setOfferShipping} />
        <ToggleRow label="Hide from friends" value={hideFromFriends} onChange={setHideFromFriends} />

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
                  className="absolute top-1 right-1 w-6 h-6 bg-black/70 text-white rounded-full flex items-center justify-center cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="aspect-square border-2 border-dashed border-gray-300 dark:border-darkline rounded-lg flex flex-col items-center justify-center text-gray-400 cursor-pointer"
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

        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
            <FileText size={12} /> Documents (PDF, DOC, PPT, XLS) — optional
          </p>
          <button
            onClick={() => docRef.current?.click()}
            className="w-full p-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-darkline text-[12px] text-gray-500 flex items-center justify-center gap-2 cursor-pointer"
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
                    className="text-red-500 cursor-pointer"
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

      {showCategories && (
        <ListingCategoryPicker
          sections={sections}
          selectedId={selectedCategory?.id}
          onSelect={c => { setSelectedCategory(c); setShowCategories(false); }}
          onClose={() => setShowCategories(false)}
        />
      )}

      {showAvailability && (
        <ListingAvailabilityPicker
          value={availability}
          onChange={v => { setAvailability(v); setShowAvailability(false); }}
          onClose={() => setShowAvailability(false)}
        />
      )}
    </div>
  );
}
