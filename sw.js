self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const NOTIFICATION_ICON = "/icons/image_76ec5c90%20(1)%20(1)%20(1).png";

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }

  e.waitUntil(
    self.registration.showNotification(d.title || "CenPaya", {
      body: d.body || "",
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: d.tag,
      renotify: true,
      vibrate: [80, 40, 80],
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
