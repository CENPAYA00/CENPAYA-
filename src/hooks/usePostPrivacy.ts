import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedUser } from '../lib/cache';
import type { PostPrivacy } from '../components/PrivacySelector';

const KEY = 'cenpaya_default_post_privacy';

export function usePostPrivacy() {
  const [privacy, setPrivacyState] = useState<PostPrivacy>(
    () => (localStorage.getItem(KEY) as PostPrivacy) || 'public'
  );

  useEffect(() => {
    (async () => {
      const me = await getCachedUser();
      if (!me) return;
      const { data } = await supabase
        .from('users')
        .select('default_post_privacy')
        .eq('id', me.id)
        .maybeSingle();
      if (data?.default_post_privacy) {
        setPrivacyState(data.default_post_privacy);
        localStorage.setItem(KEY, data.default_post_privacy);
      }
    })();
  }, []);

  const setPrivacy = async (p: PostPrivacy) => {
    setPrivacyState(p);
    localStorage.setItem(KEY, p);
    const me = await getCachedUser();
    if (me) {
      try {
        await supabase.from('users').update({ default_post_privacy: p }).eq('id', me.id);
      } catch { /* ignore if column doesn't exist */ }
    }
  };

  return { privacy, setPrivacy };
      }
