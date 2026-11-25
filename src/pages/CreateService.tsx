import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { d1Request, getD1ApiUrl, getD1Token } from '../lib/d1Api';
import { ArrowLeft, Upload, FileText, X, Image as ImageIcon, Zap } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useI18n } from '../contexts/i18n';
import Select from '../components/Select';

const CATEGORIES = [
  'Writing', 'Design', 'Business', 'Software', 'Translation',
  'Freelance Design', 'Web Development', 'App Development',
  'Graphic Design', 'Content Writing', 'Tutoring', 'Repairs',
  'Event Planning', 'Photography', 'Ebooks', 'Poems',
];

export default function CreateService() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Writing');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const [price, setPrice] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [usePriceRange, setUsePriceRange] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState('');
  const [loading, setLoading] = useState(false);
  const [boostAfterPublish, setBoostAfterPublish] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!title.trim() || title.trim().length < 3) return setErrorMsg('Title must be at least 3 characters.');
    if (!description.trim()) return setErrorMsg('Description is required.');

    if (!usePriceRange && (!price || Number(price) <= 0)) return setErrorMsg('Enter a valid starting price.');
    if (usePriceRange && (!priceMin || Number(priceMin) <= 0)) return setErrorMsg('Enter a valid minimum price.');

    setLoading(true);
    try {
      const user = await getCachedUser();
      if (!user) throw new Error('Not logged in');

      const uploadFile = async (file: File, folder: string) => {
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('folder', folder);
        const token = getD1Token();
        const response = await fetch(getD1ApiUrl('/api/market/media'), {
          method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.url) throw new Error(result.error || 'File upload failed');
        return result.url as string;
      };
      const imageUrls: string[] = [];
      for (const img of images) imageUrls.push(await uploadFile(await compressImage(img), 'services/images'));
      const docUrls: string[] = [];
      for (const doc of docs) docUrls.push(await uploadFile(doc, 'services/documents'));

      const finalPrice = usePriceRange ? Number(priceMin) : Number(price);
      const result = await d1Request<{ id: string }>('/api/market/listings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category_id: category,
          listing_type: 'service',
          country_code: user.country_code || user.country_iso || 'CM',
          price_type: usePriceRange ? 'negotiable' : 'fixed',
          price_amount: finalPrice,
          currency_code: 'XAF',
          delivery_days: Number(deliveryDays) || 3,
          images_json: imageUrls,
          documents_json: docUrls,
          price_is_range: usePriceRange,
          price_min: usePriceRange ? Number(priceMin) : finalPrice,
          price_max: usePriceRange ? (priceMax ? Number(priceMax) : Number(priceMin)) : finalPrice,
        }),
      });

      alert('Service published!');
      navigate(boostAfterPublish ? `/boosted?type=listing&id=${encodeURIComponent(result.id)}` : `/service/${result.id}`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not publish service.');
    }
    setLoading(false);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <label className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 dark:border-darkline bg-white dark:bg-darkcard p-3 cursor-pointer">
        <input type="checkbox" checked={boostAfterPublish} onChange={e => setBoostAfterPublish(e.target.checked)} className="accent-[#12935a]" />
        <span className="flex-1 text-[11px] font-semibold text-navy dark:text-white">Boost this freelance service after publishing</span>
        <Zap size={15} className="text-accent" />
      </label>
      <p className="text-[9px] text-gray-400 -mt-2 mb-3">Choose a boost plan and confirm any payment after publishing.</p>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand cursor-pointer"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('create_service')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('service_title')}</label>
        <input
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          placeholder="I will write and format your ebook..."
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3"
        />

        <div className="mb-3">
          <Select
            label={t('category')}
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map(c => ({ value: c, label: c }))}
            placeholder={t('choose_category')}
          />
        </div>

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('service_description')}</label>
        <textarea
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          rows={5}
          placeholder="What will you deliver? Include formats, revisions, and anything the buyer should send you."
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3 resize-none"
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
          <ImageIcon size={11} /> Images (up to 10)
        </label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square">
              <img src={src} alt="" className="w-full h-full object-cover rounded-lg" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center cursor-pointer"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {images.length < 10 && (
            <button
              onClick={() => imageRef.current?.click()}
              className="aspect-square border-2 border-dashed border-gray-300 dark:border-darkline rounded-lg flex flex-col items-center justify-center text-gray-400 cursor-pointer"
            >
              <ImageIcon size={20} />
              <span className="text-[9px] mt-1 font-bold">Add image</span>
            </button>
          )}
        </div>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files && handleImagePick(e.target.files)}
        />

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
          <FileText size={11} /> Documents (optional)
        </label>
        <button
          onClick={() => docRef.current?.click()}
          className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-darkline text-[11px] text-gray-500 flex items-center justify-center gap-2 cursor-pointer"
        >
          <FileText size={13} /> Add document
        </button>
        {docs.length > 0 && (
          <div className="mt-2 space-y-1">
            {docs.map((d, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-darkbg p-2 rounded-lg">
                <FileText size={12} className="text-accent" />
                <span className="flex-1 text-[11px] truncate text-navy dark:text-white">{d.name}</span>
                <button onClick={() => setDocs(docs.filter((_, x) => x !== i))} className="text-red-500 cursor-pointer">
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files && setDocs([...docs, ...Array.from(e.target.files)].slice(0, 5))}
        />
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
            {t('starting_price')} (XAF)
          </label>
          <button onClick={() => setUsePriceRange(v => !v)} className="text-[10px] font-bold text-accent cursor-pointer">
            {usePriceRange ? 'Use single price' : 'Use price range'}
          </button>
        </div>

        {!usePriceRange ? (
          <input
            type="number"
            value={price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
            placeholder="5000"
            className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg mb-3"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="number"
              value={priceMin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceMin(e.target.value)}
              placeholder="Min"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
            <input
              type="number"
              value={priceMax}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceMax(e.target.value)}
              placeholder="Max"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
          </div>
        )}

        <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('delivery_days')}</label>
        <input
          type="number"
          value={deliveryDays}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeliveryDays(e.target.value)}
          placeholder="3"
          className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
        />
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mb-3">
          {errorMsg}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-accent text-white font-bold py-3 rounded-lg text-xs flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
      >
        <Upload size={13} /> {loading ? t('processing') : t('publish_service')}
      </button>
    </div>
  );
    }
