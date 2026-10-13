import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Upload, FileText, X } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useI18n } from '../contexts/i18n';

const CATEGORIES = ['Writing', 'Design', 'Business', 'Software', 'Translation'];

export default function CreateService() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const docRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Writing');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [docs, setDocs] = useState<File[]>([]);

  const [price, setPrice] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [usePriceRange, setUsePriceRange] = useState(false);

  const [deliveryDays, setDeliveryDays] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const me = await getCachedUser();
      if (mounted && me?.location_city) setLocation(me.location_city);
    })();
    return () => { mounted = false; };
  }, []);

  const handleFile = (f: File) => {
    setThumbnail(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!title.trim() || title.trim().length < 3) return setErrorMsg('Title must be at least 3 characters.');
    if (!description.trim()) return setErrorMsg('Description is required.');
    if (!location.trim()) return setErrorMsg('Please enter the location for this service.');

    if (!usePriceRange && (!price || Number(price) <= 0)) {
      return setErrorMsg('Enter a valid starting price.');
    }
    if (usePriceRange && (!priceMin || Number(priceMin) <= 0)) {
      return setErrorMsg('Enter a valid minimum price.');
    }

    setLoading(true);
    try {
      const user = await getCachedUser();
      if (!user) throw new Error('Not logged in');

      let thumbUrl: string | null = null;
      if (thumbnail) {
        const compressed = await compressImage(thumbnail);
        const ext = compressed.name.split('.').pop();
        const path = `services/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(path, compressed);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
        thumbUrl = urlData.publicUrl;
      }

      const docUrls: string[] = [];
      for (const d of docs) {
        const ext = d.name.split('.').pop();
        const path = `service-docs/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(path, d);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
        docUrls.push(urlData.publicUrl);
      }

      const finalPrice = usePriceRange ? Number(priceMin) : Number(price);
      const payload: any = {
        seller_id: user.id,
        title: title.trim(),
        category,
        description: description.trim(),
        thumbnail_url: thumbUrl,
        starting_price: finalPrice,
        delivery_days: Number(deliveryDays) || 3,
        is_active: true,
        moderation_status: 'approved',
        documents: docUrls.length > 0 ? docUrls : null,
        location_city: location.trim() || user.location_city || null,
        location_country: user.country_iso || 'CM',
      };

      if (usePriceRange) {
        payload.price_is_range = true;
        payload.price_min = Number(priceMin);
        payload.price_max = priceMax ? Number(priceMax) : Number(priceMin);
      } else {
        payload.price_is_range = false;
        payload.price_min = finalPrice;
        payload.price_max = finalPrice;
      }

      const { data: service, error } = await supabase
        .from('services')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      alert('Service published!');
      navigate(`/service/${service.id}`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not publish service.');
    }
    setLoading(false);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('create_service')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('service_title')}</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="I will write and format your ebook..."
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3"
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('category')}</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('service_description')}</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={5}
          placeholder="What will you deliver? Include formats, revisions, and anything the buyer should send you."
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3 resize-none"
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Thumbnail</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="w-full p-2 border border-gray-200 dark:border-darkline rounded-lg text-[10px] bg-gray-50 dark:bg-darkbg"
        />
        {preview && (
          <img src={preview} alt="" className="w-full h-40 object-cover rounded-lg mt-2" />
        )}

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mt-3 mb-1 flex items-center gap-1">
          <FileText size={11} /> Documents (PDF, DOC, PPT, XLS) — optional
        </label>
        <button
          onClick={() => docRef.current?.click()}
          className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-darkline text-[11px] text-gray-500 flex items-center justify-center gap-2"
        >
          <FileText size={13} /> Add document
        </button>
        {docs.length > 0 && (
          <div className="mt-2 space-y-1">
            {docs.map((d, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
                <FileText size={12} className="text-accent" />
                <span className="flex-1 text-[11px] truncate text-navy dark:text-white">{d.name}</span>
                <button onClick={() => setDocs(docs.filter((_, x) => x !== i))} className="text-red-500">
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
          onChange={e => e.target.files && setDocs([...docs, ...Array.from(e.target.files)].slice(0, 5))}
        />
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
            {t('starting_price')} (XAF)
          </label>
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
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="5000"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="number"
              value={priceMin}
              onChange={e => setPriceMin(e.target.value)}
              placeholder="Min"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
            <input
              type="number"
              value={priceMax}
              onChange={e => setPriceMax(e.target.value)}
              placeholder="Max"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('delivery_days')}</label>
            <input
              type="number"
              value={deliveryDays}
              onChange={e => setDeliveryDays(e.target.value)}
              placeholder="3"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Yaoundé"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
          {errorMsg}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-accent text-white font-bold py-3 rounded-lg text-xs flex items-center justify-center gap-1 disabled:opacity-50"
      >
        <Upload size={13} /> {loading ? t('processing') : t('publish_service')}
      </button>
    </div>
  );
      }
