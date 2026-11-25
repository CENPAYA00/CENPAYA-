// Push event handlers are imported into the Vite PWA-generated service worker.
// Keep this file free of a second service-worker registration or lifecycle handlers.
const NOTIFICATION_ICON = "/icons/image_76ec5c90%20(1)%20(1)%20(1).png";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const targetUrl = typeof payload.url === "string" && payload.url.startsWith("/")
    ? payload.url
    : "/";

  event.waitUntil(
    self.registration.showNotification(payload.title || "CenPaya", {
      body: payload.body || "",
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: targetUrl },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
