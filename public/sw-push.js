const NOTIFICATION_ICON = "/team-mm-logo.png";

self.addEventListener("push", (event) => {
  let payload = {
    title: "\uC0AC\uB0B4 \uCC57",
    body: "\uC0C8 \uBA54\uC2DC\uC9C0\uAC00 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4.",
    url: "/messenger",
    tag: "erp-team-chat",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // ignore malformed payload
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "\uC0AC\uB0B4 \uCC57", {
      body: payload.body || "",
      tag: payload.tag || "erp-team-chat",
      renotify: true,
      data: { url: payload.url || "/messenger" },
      icon: payload.icon || NOTIFICATION_ICON,
      badge: payload.badge || NOTIFICATION_ICON,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || "/messenger");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
