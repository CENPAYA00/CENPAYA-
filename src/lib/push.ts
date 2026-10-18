import { supabase } from './supabase';

const urlB64 = (s: string): Uint8Array => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function enablePush(me: string): Promise<"granted" | "denied" | "unsupported"> {
  const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!VAPID) {
    console.warn('Missing VITE_VAPID_PUBLIC_KEY');
    return "unsupported";
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }

  if ((await Notification.requestPermission()) !== "granted") {
    return "denied";
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const sub = (await reg.pushManager.getSubscription()) ?? 
    (await reg.pushManager.subscribe({ 
      userVisibleOnly: true, 
      applicationServerKey: urlB64(VAPID) as BufferSource 
    }));

  const j = sub.toJSON();
  await supabase.from("push_subscriptions").upsert({ 
    user_id: me, 
    endpoint: j.endpoint, 
    p256dh: j.keys?.p256dh, 
    auth: j.keys?.auth 
  }, { onConflict: "endpoint" });

  return "granted";
}
