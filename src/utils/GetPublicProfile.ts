import { supabase } from '../lib/supabase';
import { PublicProfile } from '../types/PublicProfile';

export async function getPublicProfile(
  userId: string
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as PublicProfile;
}