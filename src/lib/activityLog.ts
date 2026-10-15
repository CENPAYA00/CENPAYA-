import { supabase } from './supabase';
import type { ActivityActionKey } from '../constants/activityActions';

export async function logActivity(action: ActivityActionKey, meta: Record<string, any> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('activity_log').insert({
      user_id: user.id,
      action,
      meta,
    });
  } catch (e) {
    console.warn('logActivity failed', e);
  }
      }
