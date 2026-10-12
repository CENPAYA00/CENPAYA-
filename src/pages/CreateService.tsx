import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Upload } from 'lucide-react';
import { getCachedUser } from '../lib/cache';
import { compressImage } from '../utils/compressImage';
import { useI18n } from '../contexts/i18n';

const CATEGORIES = ['Design', 'Development', 'Writing', 'Marketing', 'Video', 'Music', 'Business', 'Tutoring'];

export default function CreateService() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Design');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = (f: File) => {
    setThumbnail(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!title.trim() || title.trim().length < 3) return setErrorMsg('Title must be at least 3 characters.');
    if (!description.trim()) return setErrorMsg('Description is required.');
    if (!price || Number(price) <= 0) return setErrorMsg('Enter a valid price.');

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

      const { data: service, error } = await supabase
        .from('services')
        .insert({
          seller_id: user.id,
          title: title.trim(),
          category,
          description: description.trim(),
          thumbnail_url: thumbUrl,
          starting_price: Number(price),
          delivery_days: Number(deliveryDays) || 0,
          is_active: true,
          moderation_status: 'approved',
        })
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
          placeholder="I will design a professional logo..."
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
          rows={4}
          placeholder="What will you deliver?"
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
      </div>

      <div className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm mb-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1">{t('starting_price')} (XAF)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="5000"
              className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg text-xs bg-gray-50 dark:bg-darkbg"
            />
          </div>
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
