import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function CreateListing() {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Login first");

    let imageUrl = null;
    if (image) {
      const filePath = `${user.id}/${Date.now()}_${image.name}`;
      const { error: upError } = await supabase.storage.from('listings').upload(filePath, image);
      if (!upError) {
        const { data } = supabase.storage.from('listings').getPublicUrl(filePath);
        imageUrl = data.publicUrl;
      }
    }

    const { error } = await supabase.from('listings').insert({
      title, price: parseFloat(price), images: [imageUrl], seller_id: user.id, category_id: '...' 
    });

    if (error) alert(error.message);
    else { alert("Listing created!"); navigate('/market'); }
    setLoading(false);
  };

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Sell an Item</h1>
      <div className="bg-white p-4 rounded-2xl shadow-sm">
        <input type="text" placeholder="Item Name" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 border rounded-xl mb-3" />
        <input type="number" placeholder="Price (XAF)" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-3 border rounded-xl mb-3" />
        <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} className="w-full p-3 border rounded-xl mb-3 bg-gray-50" />
        <button onClick={handleCreate} disabled={loading} className="w-full bg-navy text-white py-3 rounded-xl font-bold">{loading ? 'Posting...' : 'Post Listing'}</button>
      </div>
    </div>
  );
}