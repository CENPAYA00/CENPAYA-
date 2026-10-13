import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, User as UserIcon, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ReportSheet from '../components/ReportSheet';

export default function SettingsReport() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [reportUser, setReportUser] = useState<any>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('public_profiles')
      .select('id, username')
      .ilike('username', `%${q.trim()}%`)
      .limit(20);
    setResults(data || []);
    setSearching(false);
  };

  return (
    <div className="px-3 py-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="text-brand"><ArrowLeft size={18} /></button>
        <h1 className="text-base font-bold text-navy dark:text-white">Report an account</h1>
      </div>

      <p className="text-[11px] text-gray-500 mb-3">
        Search for a user by their username to report them.
      </p>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search username..."
          className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-darkline rounded-xl bg-white dark:bg-darkcard text-[12px]"
        />
      </div>

      {searching && <p className="text-center text-[10px] text-gray-400 py-4">Searching...</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-center text-[10px] text-gray-400 py-4">No users found.</p>
      )}

      {results.map(u => (
        <button
          key={u.id}
          onClick={() => setReportUser(u)}
          className="w-full bg-white dark:bg-darkcard rounded-xl shadow-sm mb-2 p-3 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent">
            <UserIcon size={16} />
          </div>
          <p className="flex-1 text-left text-[12px] font-bold text-navy dark:text-white">@{u.username}</p>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
      ))}

      {reportUser && (
        <ReportSheet
          targetType="user"
          targetId={reportUser.id}
          onClose={() => setReportUser(null)}
          onSubmitted={() => {
            setTimeout(() => navigate('/settings'), 2000);
          }}
        />
      )}
    </div>
  );
          }
