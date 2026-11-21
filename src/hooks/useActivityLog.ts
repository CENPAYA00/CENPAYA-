import { useEffect, useState, useCallback } from 'react';
import { d1Request } from '../lib/d1Api';

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
    try {
      const result = await d1Request<{ data: ActivityRow[] }>(`/api/activity?limit=${limit}`);
      setItems(result.data || []);
    } catch (error) { console.warn('Could not load activity history', error); }
    finally { setLoading(false); }
  }, [limit]);
  useEffect(() => { void load(); }, [load]);
  return { items, loading, refresh: load };
}
