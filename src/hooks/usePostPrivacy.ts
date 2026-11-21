import { useEffect, useState } from 'react';
import { d1Request } from '../lib/d1Api';
import { getCachedUser } from '../lib/cache';
import type { PostPrivacy } from '../components/PrivacySelector';

const KEY = 'cenpaya_default_post_privacy';

export function usePostPrivacy() {
  const [privacy, setPrivacyState] = useState<PostPrivacy>(
    () => (localStorage.getItem(KEY) as PostPrivacy) || 'public'
  );

  useEffect(() => {
    d1Request<{ data?: { default_post_visibility?: PostPrivacy } }>('/api/me/privacy')
      .then(result => {
        const value = result.data?.default_post_visibility;
        if (value) { setPrivacyState(value); localStorage.setItem(KEY, value); }
      })
      .catch(() => { /* Use the locally stored preference until D1 settings are available. */ });
  }, []);

  const setPrivacy = async (p: PostPrivacy) => {
    setPrivacyState(p);
    localStorage.setItem(KEY, p);
    try { await d1Request('/api/me/privacy', { method: 'PATCH', body: JSON.stringify({ default_post_visibility: p }) }); }
    catch { /* The local preference remains available while the D1 route is being added. */ }
  };

  return { privacy, setPrivacy };
      }
