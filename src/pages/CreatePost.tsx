import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getCachedUser, setCached } from '../lib/cache';
import {
  ArrowLeft, Image as ImageIcon, X, Palette,
  Music, UserPlus, MapPin, Smile
} from 'lucide-react';

// ---------- Color swatches ----------
type Swatch = {
  id: string;
  label: string;
  swatchClass: string;
  bgClass: string;
  textClass: string;
};

const SWATCHES: Swatch[] = [
  { id: 'default', label: 'Default', swatchClass: 'bg-white border border-gray-300', bgClass: 'bg-white', textClass: 'text-gray-900' },
  { id: 'red',     label: 'Red',     swatchClass: 'bg-red-600',    bgClass: 'bg-red-600',    textClass: 'text-white' },
  { id: 'blue',    label: 'Blue',    swatchClass: 'bg-blue-700',   bgClass: 'bg-blue-700',   textClass: 'text-white' },
  { id: 'navy',    label: 'Navy',    swatchClass: 'bg-[#0A1128]',  bgClass: 'bg-[#0A1128]',  textClass: 'text-white' },
  { id: 'green',   label: 'Green',   swatchClass: 'bg-green-700',  bgClass: 'bg-green-700',  textClass: 'text-white' },
  { id: 'purple',  label: 'Purple',  swatchClass: 'bg-purple-700', bgClass: 'bg-purple-700', textClass: 'text-white' },
  { id: 'pink',    label: 'Pink',    swatchClass: 'bg-pink-600',   bgClass: 'bg-pink-600',   textClass: 'text-white' },
  { id: 'black',   label: 'Black',   swatchClass: 'bg-black',      bgClass: 'bg-black',      textClass: 'text-white' },
  { id: 'sunset',  label: 'Sunset',  swatchClass: 'bg-gradient-to-r from-orange-500 to-pink-600', bgClass: 'bg-gradient-to-r from-orange-500 to-pink-600', textClass: 'text-white' },
  { id: 'ocean',   label: 'Ocean',   swatchClass: 'bg-gradient-to-r from-blue-600 to-cyan-500',   bgClass: 'bg-gradient-to-r from-blue-600 to-cyan-500',   textClass: 'text-white' },
  { id: 'forest',  label: 'Forest',  swatchClass: 'bg-gradient-to-r from-green-700 to-emerald-500', bgClass: 'bg-gradient-to-r from-green-700 to-emerald-500', textClass: 'text-white' },
];

const LONG_TEXT_LIMIT = 150;
const ABSOLUTE_CHAR_LIMIT = 1000;

export default function CreatePost() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [swatchId, setSwatchId] = useState<string>('default');
  const [privacy, setPrivacy] = useState<'public' | 'friends'>('public');
  const [showColorBar, setShowColorBar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!user) {
    getCachedUser().then(u => setUser(u));
  }

  const hasImages = images.length > 0;
  const isLongText = content.length > LONG_TEXT_LIMIT;
  const colorAllowed = !hasImages && !isLongText;
  const effectiveSwatch: Swatch = colorAllowed
    ? (SWATCHES.find(s => s.id === swatchId) || SWATCHES[0])
    : SWATCHES[0];

  const handleSwatchTap = (id: string) => {
    if (!colorAllowed) return;
    setSwatchId(id);
  };

  const handleFilePick = (files: FileList) => {
    const arr = Array.from(files);
    const newImages = [...images, ...arr].slice(0, 10);
    setImages(newImages);
    setPreviews(newImages.map(f => URL.createObjectURL(f)));
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
    if (!content.trim() && images.length === 0) return setErrorMsg('Write something or add a photo.');
    if (content.length > ABSOLUTE_CHAR_LIMIT) return setErrorMsg(`Max ${ABSOLUTE_CHAR_LIMIT} characters.`);

    const currentUser = user || await getCachedUser();
    if (!currentUser) return setErrorMsg('You must be logged in.');

    setLoading(true);

    try {
      const imageUrls: string[] = [];
      for (const img of images) {
        const ext = img.name.split('.').pop();
        const filePath = `posts/${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('listings').upload(filePath, img);
        if (upErr) throw new Error('Upload failed: ' + upErr.message);
        const { data: urlData } = supabase.storage.from('listings').getPublicUrl(filePath);
        imageUrls.push(urlData.publicUrl);
      }

      let postType: 'text' | 'colored' | 'image' = 'text';
      if (imageUrls.length > 0) postType = 'image';
      else if (effectiveSwatch.id !== 'default') postType = 'colored';

      const { error } = await supabase.from('posts').insert({
        user_id: currentUser.id,
        content: content.trim() || null,
        image_url: imageUrls.length > 0 ? imageUrls.join(',') : null,
        post_type: postType,
        bg_color: postType === 'colored' ? effectiveSwatch.id : null,
        moderation_status: 'approved',
        likes_count: 0,
        comments_count: 0,
      });

      if (error) throw error;

      setCached('home_posts', null);
      navigate('/home');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy">Create Post</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 p-3">
          <div className="w-9 h-9 bg-accent/15 rounded-full flex items-center justify-center text-accent font-bold text-sm">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-bold text-navy">@{user?.username || 'You'}</p>
            <button
              onClick={() => setPrivacy(p => p === 'public' ? 'friends' : 'public')}
              className="text-[9px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full mt-0.5"
            >
              {privacy === 'public' ? '🌍 Public' : '👥 Friends'} ▾
            </button>
          </div>
        </div>

        <div className={`${effectiveSwatch.bgClass} transition-colors duration-200`}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value.slice(0, ABSOLUTE_CHAR_LIMIT))}
            placeholder="What's on your mind?"
            rows={5}
            className={`w-full p-4 text-sm resize-none focus:outline-none bg-transparent ${
              effectiveSwatch.textClass
            } ${
              effectiveSwatch.id !== 'default'
                ? 'text-center font-bold text-lg placeholder-white/70'
                : 'text-gray-800'
            }`}
          />

          {previews.length > 0 && (
            <div className="p-2 bg-white">
              <div className={`grid gap-1 ${previews.length === 1 ? 'grid-cols-1' : previews.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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

        {colorAllowed && showColorBar && (
          <div className="border-t border-gray-100 bg-white">
            <div className="flex gap-2 px-3 py-3 overflow-x-auto">
              {SWATCHES.map(swatch => {
                const isActive = swatch.id === swatchId;
                return (
                  <button
                    key={swatch.id}
                    onClick={() => handleSwatchTap(swatch.id)}
                    aria-label={swatch.label}
                    className={`w-10 h-10 rounded-full shrink-0 transition-all ${swatch.swatchClass} ${
                      isActive ? 'ring-2 ring-accent ring-offset-2 ring-offset-white scale-105' : 'active:scale-95'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 px-3 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            <AttachButton
              icon={<ImageIcon size={14} />}
              label="Photos"
              onClick={() => fileRef.current?.click()}
            />
            <AttachButton icon={<Music size={14} />} label="Music" />
            <AttachButton icon={<UserPlus size={14} />} label="Tag" />
            <AttachButton icon={<MapPin size={14} />} label="Location" />
            <AttachButton icon={<Smile size={14} />} label="Feeling" />
            {colorAllowed && (
              <AttachButton
                icon={<Palette size={14} />}
                label="Background"
                onClick={() => setShowColorBar(v => !v)}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[9px] text-gray-400">
            {isLongText ? 'Colors disabled for long text' : 'Colors available'}
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
        className="w-full bg-accent text-white font-bold py-3 rounded-xl text-xs mt-3 disabled:opacity-50 active:scale-[0.98] transition-transform uppercase tracking-wide"
      >
        {loading ? 'Posting...' : 'Post'}
      </button>
    </div>
  );
}

function AttachButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 rounded-lg shrink-0"
    >
      {icon} {label}
    </button>
  );
         }
