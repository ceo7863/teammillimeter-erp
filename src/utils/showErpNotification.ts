import { ERP_NOTIFICATION_ICON } from "@/utils/erpNotificationIcon";

export type ErpNotificationOptions = NotificationOptions & {
  onClick?: () => void;
};

async function showViaServiceWorker(title: string, options: NotificationOptions): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration?.showNotification) return false;
    await registration.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

function showViaPageNotification(title: string, options: ErpNotificationOptions): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  const { onClick, ...notificationOptions } = options;
  try {
    const notification = new Notification(title, notificationOptions);
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}

/** Android PWA requires ServiceWorkerRegistration.showNotification(). */
export async function showErpNotification(title: string, options: ErpNotificationOptions = {}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const { onClick, ...rest } = options;
  const payload: NotificationOptions = {
    icon: ERP_NOTIFICATION_ICON,
    badge: ERP_NOTIFICATION_ICON,
    ...rest,
  };

  const viaSw = await showViaServiceWorker(title, {
    ...payload,
    data: {
      ...(typeof payload.data === "object" && payload.data != null ? payload.data : {}),
      action: onClick ? "openTeamChat" : (payload.data as { action?: string } | undefined)?.action,
    },
  });
  if (viaSw) return;

  showViaPageNotification(title, { ...payload, onClick });
}
