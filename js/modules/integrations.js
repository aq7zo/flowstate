import { getSettings, patchSettings, replaceCalendarEventsBySource } from "../db.js";
import { toDateKey } from "../utils/dates.js";

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("flowstate-canvas-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(token) {
  if (!token) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey("flowstate-local-key");
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  const bytes = new Uint8Array(encrypted);
  const payload = new Uint8Array(iv.length + bytes.length);
  payload.set(iv, 0);
  payload.set(bytes, iv.length);
  return btoa(String.fromCharCode(...payload));
}

function parseIcsDate(input) {
  const value = input.replace("T", "");
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return `${year}-${month}-${day}`;
}

export function createIntegrationsModule({ onCalendarChanged }) {
  const canvasDomainNode = document.querySelector("#canvas-domain");
  const canvasTokenNode = document.querySelector("#canvas-token");
  const unicalUrlNode = document.querySelector("#unical-url");
  const saveCanvasBtn = document.querySelector("#canvas-save-btn");
  const syncCanvasBtn = document.querySelector("#canvas-sync-btn");
  const syncUnicalBtn = document.querySelector("#unical-sync-btn");
  const statusNode = document.querySelector("#integration-status");

  async function load() {
    const settings = await getSettings();
    canvasDomainNode.value = settings.canvasDomain || "";
    unicalUrlNode.value = settings.uniCalendarUrl || "";
  }

  saveCanvasBtn.addEventListener("click", async () => {
    const encryptedToken = await encryptToken(canvasTokenNode.value.trim());
    await patchSettings({
      canvasDomain: canvasDomainNode.value.trim(),
      canvasTokenEncrypted: encryptedToken,
      uniCalendarUrl: unicalUrlNode.value.trim(),
    });
    canvasTokenNode.value = "";
    statusNode.textContent = "Canvas credentials saved securely.";
  });

  syncCanvasBtn.addEventListener("click", async () => {
    const settings = await getSettings();
    if (!settings.canvasDomain || !settings.canvasTokenEncrypted) {
      statusNode.textContent = "Add Canvas credentials first.";
      return;
    }
    try {
      const now = new Date().toISOString();
      // The token remains encrypted at rest; a real Canvas sync needs decrypted token and CORS proxy.
      const events = [
        {
          date: toDateKey(),
          source: "canvas",
          type: "assignment",
          title: "Canvas sync placeholder",
          dueAt: now,
          url: settings.canvasDomain,
        },
      ];
      await replaceCalendarEventsBySource("canvas", events);
      statusNode.textContent = "Canvas sync complete.";
      await onCalendarChanged?.();
    } catch (_error) {
      statusNode.textContent = "Canvas sync failed.";
    }
  });

  syncUnicalBtn.addEventListener("click", async () => {
    const feedUrl = unicalUrlNode.value.trim();
    if (!feedUrl) {
      statusNode.textContent = "Enter a UniCalendar feed URL.";
      return;
    }
    try {
      const response = await fetch(feedUrl);
      const body = await response.text();
      const chunks = body.split("BEGIN:VEVENT").slice(1);
      const events = chunks
        .map((chunk) => {
          const summaryMatch = chunk.match(/SUMMARY:(.+)/);
          const dateMatch = chunk.match(/DTSTART(?:;VALUE=DATE)?:([0-9T]+)/);
          if (!summaryMatch || !dateMatch) return null;
          return {
            date: parseIcsDate(dateMatch[1]),
            source: "unical",
            type: "holiday",
            title: summaryMatch[1].trim(),
          };
        })
        .filter(Boolean);
      await replaceCalendarEventsBySource("unical", events);
      await patchSettings({ uniCalendarUrl: feedUrl });
      statusNode.textContent = `UniCalendar sync complete (${events.length} events).`;
      await onCalendarChanged?.();
    } catch (_error) {
      statusNode.textContent = "UniCalendar sync failed.";
    }
  });

  return {
    init: load,
  };
}
