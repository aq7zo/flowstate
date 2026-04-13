export function notify(message) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Flowstate", { body: message });
  }
}
