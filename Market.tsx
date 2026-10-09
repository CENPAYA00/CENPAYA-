import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { MarketplaceItem } from '../types/MarketplaceItem';
import { searchMarketplaceListings } from '../utils/searchMarketplace';

export default function Market() {
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch initial listings when the screen loads
  useEffect(() => {
    loadListings('');
  }, []);

  // Load listings (with or without a search term)
  const loadListings = async (term: string) => {
    setLoading(true);
    try {
      const results = await searchMarketplaceListings(supabase, term, 0);
      setListings(results as MarketplaceItem[]);
    } catch (error) {
      console.error('Search error:', error);
    }
    setLoading(false);
  };

  // Handle search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings(searchText);
  };

  return (
    <div className="p-4 bg-offwhite min-h-screen pb-20">
      <h1 className="text-2xl font-bold text-navy mb-4">Market</h1>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <input
          type="text"
          placeholder="Search for products..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-full p-3 border rounded-xl bg-white"
        />
      </form>

      {loading && <div className="text-center text-gray-500">Loading...</div>}

      {!loading && listings.length === 0 && (
        <div className="text-center text-gray-500">No listings found.</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {listings.map((item) => (
          <div
            key={item.id}
            onClick={() => navigate(`/listing/${item.id}`)}
            className="bg-white p-3 rounded-xl shadow-sm cursor-pointer"
          >
            <div className="h-32 bg-gray-200 rounded-lg mb-2 overflow-hidden">
              {item.images?.[0] && (
                <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <p className="font-bold text-navy truncate">{item.title}</p>
            <p className="text-gold font-bold">{item.price} XAF</p>
          </div>
        ))}
      </div>
    </div>
  );
}