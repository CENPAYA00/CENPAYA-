import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type ActivityRow = {
  id: string;
  action: string;
  meta: any;
  created_at: string;
};

export function useActivityLog(limit = 100) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('activity_log')
      .select('id, action, meta, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    setItems((data || []) as ActivityRow[]);
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, refresh: load };
          }
