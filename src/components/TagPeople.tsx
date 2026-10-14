import { useState } from 'react';
import { Search, X, AtSign, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Props = {
  selected: any[];
  onChange: (users: any[]) => void;
};

export default function TagPeople({ selected, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${q.trim()}%`)
      .limit(15);
    setResults(data || []);
    setSearching(false);
  };

  const add = (u: any) => {
    if (selected.some(s => s.id === u.id)) return;
    onChange([...selected, u]);
    setQuery('');
    setResults([]);
  };

  const remove = (id: string) => {
    onChange(selected.filter(s => s.id !== id));
  };

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
        <AtSign size={11} /> Tag people
      </p>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(u => (
            <div key={u.id} className="flex items-center gap-1.5 bg-accent/10 text-accent px-2 py-1 rounded-full">
              <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[9px] font-bold overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-5 h-5 object-cover" /> : u.username?.[0]?.toUpperCase()}
              </div>
              <span className="text-[10px] font-bold">@{u.username}</span>
              <button onClick={() => remove(u.id)}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          placeholder="Search people to tag"
          className="w-full pl-8 pr-3 py-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs"
        />
      </div>

      {searching && <p className="text-[9px] text-gray-400 mt-1">Searching...</p>}

      {results.length > 0 && (
        <div className="bg-white dark:bg-darkcard rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
          {results.map(u => {
            const already = selected.some(s => s.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => already ? remove(u.id) : add(u)}
                className="w-full flex items-center gap-2 p-2 border-b border-gray-100 dark:border-darkline last:border-b-0 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-accent text-[10px] font-bold overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-7 h-7 object-cover" /> : u.username?.[0]?.toUpperCase()}
                </div>
                <span className="flex-1 text-[11px] font-bold text-navy dark:text-white">@{u.username}</span>
                {already && <Check size={12} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
        }
