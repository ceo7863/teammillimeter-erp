import { apiRequest, getAuthToken, isApiModeEnabled } from "./erpApi";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function fetchTeamChatPushPublicKey() {
  if (!isApiModeEnabled()) return { publicKey: "", enabled: false };
  return apiRequest<{ publicKey: string; enabled: boolean }>("/team-chat/push/vapid-public-key");
}

export async function subscribeTeamChatPush() {
  if (!isApiModeEnabled() || typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!getAuthToken()) return false;

  const { publicKey, enabled } = await fetchTeamChatPushPublicKey();
  if (!enabled || !publicKey) return false;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  await apiRequest("/team-chat/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
  return true;
}

export async function unsubscribeTeamChatPush() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  if (isApiModeEnabled()) {
    await apiRequest("/team-chat/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
  }
}
