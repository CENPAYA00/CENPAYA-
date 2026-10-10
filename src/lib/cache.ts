import { supabase } from './supabase';

let cachedUser: any = null;
let userLastFetch = 0;
const USER_CACHE_MS = 5 * 60 * 1000;

export async function getCachedUser() {
  const now = Date.now();
  if (cachedUser && now - userLastFetch < USER_CACHE_MS) return cachedUser;
  const { data: { user } } = await supabase.auth.getUser();
  cachedUser = user;
  userLastFetch = now;
  return user;
}

type CacheEntry = { data: any; timestamp: number };
const dataCache: Record<string, CacheEntry> = {};
const DATA_CACHE_MS = 60 * 1000;

export function getCached<T = any>(key: string): T | null {
  const entry = dataCache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DATA_CACHE_MS) {
    delete dataCache[key];
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: any) {
  dataCache[key] = { data, timestamp: Date.now() };
}

export function clearCache() {
  cachedUser = null;
  userLastFetch = 0;
  Object.keys(dataCache).forEach(k => delete dataCache[k]);
}
