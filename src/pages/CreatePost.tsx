import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getCachedUser, setCached } from '../lib/cache';
import { ArrowLeft, Image as ImageIcon, X, Palette, Smile } from 'lucide-react';
import { compressImage } from '../utils/compressImage';
import { BACKGROUNDS, getBackground } from '../lib/postBackgrounds';
import { useI18n } from '../contexts/i18n';

const LONG_TEXT_LIMIT = 150;
const ABSOLUTE_CHAR_LIMIT = 1000;

export default function CreatePost() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [user, setUser] = useState<any>(null);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [swatchId, setSwatchId] = useState<string>('default');
  const [showColorBar, setShowColorBar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    getCachedUser().then(u => { if (mounted) setUser(u); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => { previews.forEach(p => URL.revokeObjectURL(p)); };
  }, [previews]);

  const hasImages = images.length > 0;
  const isLongText = content.length > LONG_TEXT_LIMIT;
  const colorAllowed = !hasImages && !isLongText;
  const bg = colorAllowed ? getBackground(swatchId) : BACKGROUNDS[0];

  const isColorActive = bg.id !== 'default';
  const isImageTheme = !!bg.image;

  const handleFilePick = (files: FileList) => {
    const arr = Array.from(files);
    const next = [...images, ...arr].slice(0, 10);
    setImages(next);
    setPreviews(next.map(f => URL.createObjectURL(f)));
    setSwatchId('default');
    setShowColorBar(false);
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map(f => URL.createObjectURL(f)));
  };

  const handlePost = async () => {
    setErrorMsg('');
    if (!content.trim() && images.length === 0) {
      setSwatchId('default');
      return setErrorMsg('Write something or add a photo.');
    }
    const me = user || await getCachedUser();
    if (!me) return setErrorMsg('You must be logged in.');

    setLoading(true);
    try {
      const urls: string[] = [];
      for (const img of images) {
        const compressed = await compressImage(img);
        const ext = compressed.name.split('.').pop();
        const path = `posts/${me.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(path, compressed);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }

      let postType: 'text' | 'colored' | 'image' = 'text';
      if (urls.length > 0) postType = 'image';
      else if (isColorActive) postType = 'colored';

      const { error } = await supabase.from('posts').insert({
        user_id: me.id,
        content: content.trim() || null,
        image_url: urls.length > 0 ? urls.join(',') : null,
        post_type: postType,
        bg_color: postType === 'colored' ? bg.id : null,
        moderation_status: 'approved',
        likes_count: 0,
        comments_count: 0,
        shares_count: 0,
      });
      if (error) throw error;

      setCached('home_posts', null);
      navigate('/home');
    } catch (e: any) {
      setErrorMsg(e.message);
    }
    setLoading(false);
  };

  // When a color is chosen, immediately focus the textarea
  const pickColor = (id: string) => {
    setSwatchId(id);
    setTimeout(() => textRef.current?.focus(), 50);
  };

  // Compute background style: use inline styles for gradients and images,
  // because Tailwind arbitrary classes don't always win over the dark override.
  const containerStyle: React.CSSProperties = (() => {
    if (!isColorActive || !colorAllowed) return {};
    if (bg.id === 'purple-magenta') return { backgroundImage: 'linear-gradient(135deg, #7F00FF, #E100FF)' };
    if (bg.id === 'sunset')         return { backgroundImage: 'linear-gradient(45deg, #FF416C, #FF4B2B)' };
    if (bg.id === 'cyan-blue')      return { backgroundImage: 'linear-gradient(180deg, #00B4DB, #0083B0)' };
    if (bg.id === 'pink')           return { backgroundColor: '#E40046' };
    if (bg.id === 'charcoal')       return { backgroundColor: '#1C1E21' };
    if (bg.id === 'blue')           return { backgroundColor: '#1877F2' };
    if (bg.id === 'maroon')         return { backgroundColor: '#6B1426' };
    if (bg.image)                   return { backgroundImage: `url(${bg.image})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    return {};
  })();

  const textColor =
    isColorActive || isImageTheme ? 'text-white' : 'text-gray-800 dark:text-gray-100';

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">{t('create_post')}</h1>
      </div>

      <div className="bg-white dark:bg-darkcard rounded-2xl shadow-sm overflow-hidden">

        {/* Author row */}
        <div className="flex items-center gap-2 p-3">
          <div className="w-9 h-9 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-sm">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-bold text-navy dark:text-white">@{user?.username || 'You'}</p>
            <p className="text-[9px] text-gray-500">Public ▾</p>
          </div>
        </div>

        {/* Colored / plain textarea */}
        <div
          style={containerStyle}
          className={`transition-colors duration-200 ${
            !isColorActive ? 'bg-white dark:bg-darkcard' : ''
          }`}
        >
          <textarea
            ref={textRef}
            value={content}
            onChange={e => setContent(e.target.value.slice(0, ABSOLUTE_CHAR_LIMIT))}
            placeholder={t('whats_on_your_mind')}
            rows={5}
            className={`w-full p-4 text-sm resize-none focus:outline-none bg-transparent ${textColor} ${
              isColorActive ? 'text-center font-bold text-lg placeholder-white/70' : ''
            }`}
          />

          {previews.length > 0 && (
            <div className="p-2 bg-white dark:bg-darkcard">
              <div className={`grid gap-1 ${
                previews.length === 1 ? 'grid-cols-1'
                  : previews.length === 2 ? 'grid-cols-2'
                  : 'grid-cols-3'
              }`}>
                {previews.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="w-full h-24 object-cover rounded-lg" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Color bar — Facebook style: shows when typing short text, no images */}
        {colorAllowed && showColorBar && (
          <div className="border-t border-gray-100 dark:border-darkline bg-white dark:bg-darkcard">
            <div className="flex gap-2 px-3 py-3 overflow-x-auto scrollbar-hide">
              {BACKGROUNDS.map(sw => {
                const active = sw.id === swatchId;
                const style: React.CSSProperties = (() => {
                  if (sw.id === 'default')       return { backgroundColor: '#FFFFFF' };
                  if (sw.id === 'pink')          return { backgroundColor: '#E40046' };
                  if (sw.id === 'charcoal')      return { backgroundColor: '#1C1E21' };
                  if (sw.id === 'blue')          return { backgroundColor: '#1877F2' };
                  if (sw.id === 'maroon')        return { backgroundColor: '#6B1426' };
                  if (sw.id === 'purple-magenta') return { backgroundImage: 'linear-gradient(135deg, #7F00FF, #E100FF)' };
                  if (sw.id === 'sunset')        return { backgroundImage: 'linear-gradient(45deg, #FF416C, #FF4B2B)' };
                  if (sw.id === 'cyan-blue')     return { backgroundImage: 'linear-gradient(180deg, #00B4DB, #0083B0)' };
                  if (sw.image)                  return { backgroundImage: `url(${sw.image})`, backgroundSize: 'cover', backgroundPosition: 'center' };
                  return {};
                })();
                return (
                  <button
                    key={sw.id}
                    onClick={() => pickColor(sw.id)}
                    aria-label={sw.label}
                    style={style}
                    className={`w-10 h-10 rounded-full shrink-0 border border-white/20 ${
                      active
                        ? 'ring-2 ring-accent ring-offset-2 ring-offset-white dark:ring-offset-darkcard scale-105'
                        : 'active:scale-95'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="border-t border-gray-100 dark:border-darkline px-3 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 rounded-lg shrink-0"
          >
            <ImageIcon size={14} /> {t('add_photos')}
          </button>
          <button className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 rounded-lg shrink-0">
            <Smile size={14} /> {t('feeling')}
          </button>
          {colorAllowed && (
            <button
              onClick={() => setShowColorBar(v => !v)}
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 rounded-lg shrink-0"
            >
              <Palette size={14} /> {t('background')}
            </button>
          )}
        </div>

        {/* Counter */}
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[9px] text-gray-400">
            {isLongText ? t('colors_disabled') : t('colors_available')}
          </p>
          <p className="text-[9px] text-gray-400">{content.length}/{ABSOLUTE_CHAR_LIMIT}</p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFilePick(e.target.files)}
      />

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] p-2 rounded-lg mt-3">
          {errorMsg}
        </div>
      )}

      <button
        onClick={handlePost}
        disabled={loading || (!content.trim() && images.length === 0)}
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-xs mt-3 disabled:opacity-50 uppercase tracking-wide"
      >
        {loading ? t('posting') : t('post')}
      </button>
    </div>
  );
    }
