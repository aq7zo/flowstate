"use client";

import { useState, useEffect, useRef } from "react";

import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  initDb,
  getSettings,
  patchSettings,
  replaceCalendarEventsBySource,
  exportSnapshot,
  importSnapshot,
  clearAllData,
} from "@/lib/db";
import { toDateKey } from "@/lib/dates";

import type { AppSettings, Priority, CustomTag } from "@/types";

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
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
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(token: string): Promise<string> {
  if (!token) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey("flowstate-local-key");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );
  const bytes = new Uint8Array(encrypted);
  const payload = new Uint8Array(iv.length + bytes.length);
  payload.set(iv, 0);
  payload.set(bytes, iv.length);
  return btoa(String.fromCharCode(...payload));
}

function parseIcsDate(input: string): string {
  const value = input.replace("T", "");
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ready, setReady] = useState(false);

  const [defaultPriority, setDefaultPriority] = useState<Priority>("medium");
  const [carryThreshold, setCarryThreshold] = useState("1");
  const [dailyQuota, setDailyQuota] = useState("8");
  const [tomorrowPromptTime, setTomorrowPromptTime] = useState("20:30");
  const [tomorrowPromptEnabled, setTomorrowPromptEnabled] = useState(false);

  const [weatherCity, setWeatherCity] = useState("");
  const [weatherLat, setWeatherLat] = useState("");
  const [weatherLon, setWeatherLon] = useState("");

  const [canvasDomain, setCanvasDomain] = useState("");
  const [canvasToken, setCanvasToken] = useState("");
  const [unicalUrl, setUnicalUrl] = useState("");
  const [integrationStatus, setIntegrationStatus] = useState("");

  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#3dd9c5");
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreview, setImportPreview] = useState("");
  const [exportStatus, setExportStatus] = useState("");

  const pendingPayload = useRef<Record<string, unknown> | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function init() {
      await initDb();
      const s = await getSettings();
      setSettings(s);
      setDefaultPriority(s.defaultPriority || "medium");
      setCarryThreshold(String(s.carryOverThreshold || 1));
      setDailyQuota(String((s.dailyQuota || 480) / 60));
      setTomorrowPromptTime(s.tomorrowPromptTime || "20:30");
      setTomorrowPromptEnabled(Boolean(s.tomorrowPromptEnabled));
      setWeatherCity(s.weatherCity || "");
      setWeatherLat(s.weatherLat != null ? String(s.weatherLat) : "");
      setWeatherLon(s.weatherLon != null ? String(s.weatherLon) : "");
      setCanvasDomain(s.canvasDomain || "");
      setUnicalUrl(s.uniCalendarUrl || "");
      setCustomTags(s.customTags || []);
      setReady(true);
    }
    init();
  }, []);

  async function save() {
    const next = await patchSettings({
      defaultPriority,
      carryOverThreshold: Math.max(1, Number(carryThreshold) || 1),
      dailyQuota: Math.max(60, Math.round((Number(dailyQuota) || 8) * 60)),
      tomorrowPromptTime: tomorrowPromptTime || "20:30",
      tomorrowPromptEnabled,
      weatherCity: weatherCity.trim(),
      weatherLat: weatherLat ? Number(weatherLat) : null,
      weatherLon: weatherLon ? Number(weatherLon) : null,
    });
    setSettings(next);
  }

  async function saveCanvasCredentials() {
    const encrypted = await encryptToken(canvasToken.trim());
    await patchSettings({
      canvasDomain: canvasDomain.trim(),
      canvasTokenEncrypted: encrypted,
      uniCalendarUrl: unicalUrl.trim(),
    });
    setCanvasToken("");
    setIntegrationStatus("Canvas credentials saved securely.");
  }

  async function syncCanvas() {
    const s = await getSettings();
    if (!s.canvasDomain || !s.canvasTokenEncrypted) {
      setIntegrationStatus("Add Canvas credentials first.");
      return;
    }
    const events = [
      {
        date: toDateKey(),
        source: "canvas",
        type: "assignment",
        title: "Canvas sync placeholder",
        dueAt: new Date().toISOString(),
        url: s.canvasDomain,
      },
    ];
    await replaceCalendarEventsBySource("canvas", events);
    setIntegrationStatus("Canvas sync complete.");
  }

  async function syncUniCalendar() {
    const feedUrl = unicalUrl.trim();
    if (!feedUrl) {
      setIntegrationStatus("Enter a UniCalendar feed URL.");
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
      await replaceCalendarEventsBySource(
        "unical",
        events as { date: string; source: string; type: string; title: string }[]
      );
      await patchSettings({ uniCalendarUrl: feedUrl });
      setIntegrationStatus(
        `UniCalendar sync complete (${events.length} events).`
      );
    } catch {
      setIntegrationStatus("UniCalendar sync failed.");
    }
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const next = [...customTags, { name, color: tagColor }];
    await patchSettings({ customTags: next });
    setCustomTags(next);
    setTagName("");
  }

  async function removeTag(index: number) {
    const next = customTags.filter((_, i) => i !== index);
    await patchSettings({ customTags: next });
    setCustomTags(next);
  }

  async function handleExport() {
    try {
      const payload = await exportSnapshot();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      a.href = url;
      a.download = `flowstate-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus("Backup exported successfully.");
    } catch {
      setExportStatus("Export failed. Reload and try again.");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      pendingPayload.current = payload;
      const tasks = payload.tasks?.length || 0;
      const templates = payload.templates?.length || 0;
      const logs = payload.pomodoroLogs?.length || 0;
      setImportPreview(
        `This will import ${tasks} tasks, ${templates} templates, and ${logs} Pomodoro sessions.`
      );
      setImportPreviewOpen(true);
    } catch {
      setExportStatus("Invalid JSON backup file.");
    }
  }

  async function runImport(mode: "merge" | "replace") {
    if (!pendingPayload.current) return;
    await importSnapshot(pendingPayload.current as never, mode);
    setImportPreviewOpen(false);
    setExportStatus(`Backup imported with ${mode} mode.`);
    pendingPayload.current = null;
    toast.success(`Import complete (${mode})`);
  }

  async function handleClearAll() {
    if (!window.confirm("Clear all app data? This cannot be undone.")) return;
    await clearAllData();
    setExportStatus("All local data cleared.");
    toast.info("All data cleared.");
  }

  if (!ready) {
    return (
      <section className="grid gap-4">
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1>Settings</h1>
        <p className="text-muted-foreground">
          Manage local data and preferences.
        </p>
      </div>

      {/* General */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="s-priority">Default Task Priority</Label>
              <Select
                value={defaultPriority}
                onValueChange={(v) => {
                  setDefaultPriority(v as Priority);
                  setTimeout(save, 0);
                }}
              >
                <SelectTrigger id="s-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-carry">Carry-over Prompt Threshold</Label>
              <Input
                id="s-carry"
                type="number"
                min={1}
                value={carryThreshold}
                onChange={(e) => setCarryThreshold(e.target.value)}
                onBlur={save}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-quota">Daily Hour Quota</Label>
              <Input
                id="s-quota"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={dailyQuota}
                onChange={(e) => setDailyQuota(e.target.value)}
                onBlur={save}
                placeholder="8"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-tomorrow-time">
                Tomorrow Planning Prompt Time
              </Label>
              <Input
                id="s-tomorrow-time"
                type="time"
                value={tomorrowPromptTime}
                onChange={(e) => setTomorrowPromptTime(e.target.value)}
                onBlur={save}
              />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <Checkbox
                id="s-tomorrow-enabled"
                checked={tomorrowPromptEnabled}
                onCheckedChange={(v) => {
                  setTomorrowPromptEnabled(v === true);
                  setTimeout(save, 0);
                }}
              />
              <Label htmlFor="s-tomorrow-enabled">
                Enable &ldquo;Tomorrow Starts Tonight&rdquo; popup
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weather */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2.5 text-sm text-muted-foreground">
            Set your location to display live weather on the dashboard. Uses
            the free MET Norway API.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-city">City Name</Label>
              <Input
                id="s-city"
                value={weatherCity}
                onChange={(e) => setWeatherCity(e.target.value)}
                onBlur={save}
                placeholder="Oslo"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-lat">Latitude</Label>
              <Input
                id="s-lat"
                type="number"
                step="any"
                value={weatherLat}
                onChange={(e) => setWeatherLat(e.target.value)}
                onBlur={save}
                placeholder="59.91"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-lon">Longitude</Label>
              <Input
                id="s-lon"
                type="number"
                step="any"
                value={weatherLon}
                onChange={(e) => setWeatherLon(e.target.value)}
                onBlur={save}
                placeholder="10.75"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="s-canvas-domain">Canvas Domain</Label>
            <Input
              id="s-canvas-domain"
              type="url"
              value={canvasDomain}
              onChange={(e) => setCanvasDomain(e.target.value)}
              placeholder="https://canvas.example.edu"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-canvas-token">Canvas Access Token</Label>
            <Input
              id="s-canvas-token"
              type="password"
              value={canvasToken}
              onChange={(e) => setCanvasToken(e.target.value)}
              placeholder="Paste personal access token…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-unical">UniCalendar Feed URL</Label>
            <Input
              id="s-unical"
              type="url"
              value={unicalUrl}
              onChange={(e) => setUnicalUrl(e.target.value)}
              placeholder="https://calendar-feed.ics"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="secondary"
              onClick={saveCanvasCredentials}
            >
              Save Canvas Credentials
            </Button>
            <Button type="button" onClick={syncCanvas}>
              Sync Canvas
            </Button>
            <Button type="button" variant="ghost" onClick={syncUniCalendar}>
              Sync UniCalendar
            </Button>
          </div>
          {integrationStatus && (
            <p className="mono text-sm text-muted-foreground">
              {integrationStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Custom Tags */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>Custom Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addTag} className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="s-tag-name">Tag Name</Label>
              <Input
                id="s-tag-name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                maxLength={30}
                placeholder="School"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-tag-color">Color</Label>
              <Input
                id="s-tag-color"
                type="color"
                value={tagColor}
                onChange={(e) => setTagColor(e.target.value)}
                className="h-10 w-10 cursor-pointer p-0.5"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit">Add Tag</Button>
            </div>
          </form>
          {customTags.length > 0 && (
            <ul className="grid list-none gap-2 p-0">
              {customTags.map((tag, i) => (
                <li
                  key={`${tag.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border bg-muted p-2.5"
                  style={{ borderLeftWidth: 3, borderLeftColor: tag.color }}
                >
                  <p className="flex-1">{tag.name}</p>
                  <Badge variant="outline" className="mono">
                    {tag.color}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeTag(i)}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Data */}
      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle>Data</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" onClick={handleExport}>
              Export Backup (JSON)
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => importFileRef.current?.click()}
            >
              Import Backup
            </Button>
            <Button type="button" variant="ghost" onClick={handleClearAll}>
              Clear All Data
            </Button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          {exportStatus && (
            <p className="mono text-sm text-muted-foreground">
              {exportStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import Preview Dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Backup</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{importPreview}</p>
          <DialogFooter className="flex-wrap gap-1.5">
            <Button type="button" onClick={() => runImport("merge")}>
              Merge
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runImport("replace")}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setImportPreviewOpen(false);
                pendingPayload.current = null;
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
