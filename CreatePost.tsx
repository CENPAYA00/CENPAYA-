import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function CreatePost() {
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handlePost = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Please log in.");

    let imageUrl = null;

    // Upload image to Supabase Storage (listings bucket)
    if (image) {
      const filePath = `${user.id}/posts/${Date.now()}_${image.name}`;
      const { error: uploadError } = await supabase.storage.from('listings').upload(filePath, image);
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('listings').getPublicUrl(filePath);
        imageUrl = publicUrl;
      }
    }

    // Insert into posts table. The DB trigger handles permissions.
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      content: content,
      post_type: image ? 'image' : 'text',
      image_url: imageUrl,
    });

    if (error) alert("Error posting: " + error.message);
    else {
      alert("Post created!");
      navigate('/home');
    }
    setLoading(false);
  };

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Create Post</h1>
      <div className="bg-white p-4 rounded-2xl shadow-sm">
        <textarea 
          placeholder="What's on your mind?" 
          value={content} onChange={(e) => setContent(e.target.value)}
          className="w-full p-3 border rounded-xl mb-3" rows={4} 
        />
        <input 
          type="file" accept="image/*" 
          onChange={(e) => setImage(e.target.files?.[0] || null)}
          className="w-full p-3 border rounded-xl mb-4 bg-gray-50" 
        />
        <button onClick={handlePost} disabled={loading} className="w-full bg-navy text-white font-bold py-3 rounded-xl">
          {loading ? 'Posting...' : 'Publish Post'}
        </button>
      </div>
    </div>
  );
}