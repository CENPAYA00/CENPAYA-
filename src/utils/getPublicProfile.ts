import { d1Request } from '../lib/d1Api';
import { PublicProfile } from '../types/PublicProfile';

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  try {
    const result = await d1Request<{ data: PublicProfile }>(`/api/profiles/${encodeURIComponent(userId)}`);
    return result.data || null;
  } catch { return null; }
}
