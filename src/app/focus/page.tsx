"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { initDb, getSettings, patchSettings, addPomodoroLog } from "@/lib/db";
import { toDateKey } from "@/lib/dates";
import { fileToDataUrl, playDataUrl, stopAudio } from "@/lib/audio";

import type { AppSettings, PomodoroPhase, AlarmType } from "@/types";

function formatClock(seconds: number): string {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function FocusPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [phase, setPhase] = useState<PomodoroPhase>("IDLE");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [sessionCount, setSessionCount] = useState(0);
  const [running, setRunning] = useState(false);

  const [workMin, setWorkMin] = useState(25);
  const [shortBreakMin, setShortBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState(4);

  const [alarmType, setAlarmType] = useState<AlarmType>("file");
  const [alarmVolume, setAlarmVolume] = useState(0.8);
  const [alarmFade, setAlarmFade] = useState(false);
  const [alarmYoutubeUrl, setAlarmYoutubeUrl] = useState("");
  const [alarmStatus, setAlarmStatus] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const youtubeRef = useRef<HTMLIFrameElement | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const phaseRef = useRef(phase);
  const sessionRef = useRef(sessionCount);
  const runningRef = useRef(running);

  phaseRef.current = phase;
  sessionRef.current = sessionCount;
  runningRef.current = running;

  useEffect(() => {
    async function init() {
      await initDb();
      const s = await getSettings();
      setSettings(s);
      settingsRef.current = s;
      setWorkMin(s.workMin || 25);
      setShortBreakMin(s.shortBreakMin || 5);
      setLongBreakMin(s.longBreakMin || 15);
      setSessionsBeforeLong(s.sessionsBeforeLong || 4);
      setSecondsLeft((s.workMin || 25) * 60);
      setAlarmType(s.alarmType || "file");
      setAlarmVolume(s.alarmVolume ?? 0.8);
      setAlarmFade(s.alarmFade || false);
      setAlarmYoutubeUrl(s.alarmUrl || "");
      setReady(true);
    }
    init();
  }, []);

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopYoutube = useCallback(() => {
    if (youtubeRef.current) {
      youtubeRef.current.remove();
      youtubeRef.current = null;
    }
  }, []);

  async function onPhaseComplete() {
    const s = settingsRef.current!;
    const currentPhase = phaseRef.current;
    const currentSession = sessionRef.current;

    if (currentPhase === "WORK") {
      const nextSession = currentSession + 1;
      setSessionCount(nextSession);
      sessionRef.current = nextSession;
      await addPomodoroLog({
        date: toDateKey(),
        duration: s.workMin,
        type: "work",
        completed: true,
      });
      const longDue =
        nextSession > 0 && nextSession % s.sessionsBeforeLong === 0;
      const nextPhase: PomodoroPhase = longDue ? "LONG_BREAK" : "BREAK";
      setPhase(nextPhase);
      phaseRef.current = nextPhase;
      setSecondsLeft((longDue ? s.longBreakMin : s.shortBreakMin) * 60);
    } else {
      await addPomodoroLog({
        date: toDateKey(),
        duration:
          currentPhase === "LONG_BREAK" ? s.longBreakMin : s.shortBreakMin,
        type: currentPhase === "LONG_BREAK" ? "long_break" : "break",
        completed: true,
      });
      setPhase("WORK");
      phaseRef.current = "WORK";
      setSecondsLeft(s.workMin * 60);
    }

    if (s.alarmType === "youtube" && s.alarmUrl) {
      const videoId = s.alarmUrl.split("v=")[1]?.split("&")[0];
      if (videoId) {
        stopYoutube();
        const frame = document.createElement("iframe");
        frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        frame.className = "invisible absolute";
        frame.setAttribute("aria-hidden", "true");
        document.body.append(frame);
        youtubeRef.current = frame;
      }
    } else if (s.alarmType === "file" && s.alarmFile) {
      await playDataUrl(s.alarmFile, s.alarmVolume, s.alarmFade);
    }
  }

  function start() {
    if (timerRef.current) return;
    setRunning(true);
    runningRef.current = true;
    if (phaseRef.current === "IDLE") {
      setPhase("WORK");
      phaseRef.current = "WORK";
      setSecondsLeft(workMin * 60);
    }
    stopAudio();

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopTicker();
          onPhaseComplete().then(() => {
            if (runningRef.current && phaseRef.current !== "IDLE") {
              timerRef.current = setInterval(() => {
                setSecondsLeft((p) => {
                  if (p <= 1) {
                    stopTicker();
                    onPhaseComplete().then(() => {
                      if (runningRef.current) start();
                    });
                    return 0;
                  }
                  return p - 1;
                });
              }, 1000);
            }
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function pause() {
    setRunning(false);
    runningRef.current = false;
    stopTicker();
  }

  function reset() {
    setRunning(false);
    runningRef.current = false;
    stopTicker();
    stopAudio();
    stopYoutube();
    setPhase("IDLE");
    phaseRef.current = "IDLE";
    setSecondsLeft(workMin * 60);
  }

  async function savePomoSettings() {
    const next = await patchSettings({
      workMin: Math.max(1, workMin),
      shortBreakMin: Math.max(1, shortBreakMin),
      longBreakMin: Math.max(1, longBreakMin),
      sessionsBeforeLong: Math.max(1, sessionsBeforeLong),
    });
    setSettings(next);
    settingsRef.current = next;
    if (phaseRef.current === "IDLE") {
      setSecondsLeft(next.workMin * 60);
    }
  }

  async function saveAlarmSettings(e: React.FormEvent) {
    e.preventDefault();
    const s = settingsRef.current!;
    const next = await patchSettings({
      alarmType,
      alarmFile: s.alarmFile,
      alarmUrl: alarmYoutubeUrl.trim(),
      alarmVolume,
      alarmFade,
    });
    setSettings(next);
    settingsRef.current = next;
    setAlarmStatus("Alarm saved locally.");
  }

  async function handleAlarmFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const next = await patchSettings({ alarmFile: dataUrl });
    setSettings(next);
    settingsRef.current = next;
  }

  async function previewAlarm() {
    const s = settingsRef.current!;
    if (alarmType === "youtube") {
      const videoId = alarmYoutubeUrl.split("v=")[1]?.split("&")[0];
      if (!videoId) {
        setAlarmStatus("Add a valid YouTube URL first.");
        return;
      }
      stopYoutube();
      const frame = document.createElement("iframe");
      frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      frame.className = "invisible absolute";
      frame.setAttribute("aria-hidden", "true");
      document.body.append(frame);
      youtubeRef.current = frame;
      setAlarmStatus("YouTube preview playing…");
      return;
    }
    if (!s.alarmFile) {
      setAlarmStatus("Add and save an audio file first.");
      return;
    }
    await playDataUrl(s.alarmFile, alarmVolume, alarmFade);
    setAlarmStatus("Preview playing…");
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
      <div className="flex items-end justify-between">
        <div>
          <h1>Focus Mode</h1>
          <p className="text-muted-foreground">
            Go deep. Come back. Repeat.
          </p>
        </div>
      </div>

      <Card className="bg-gradient-to-b from-white/[0.02] to-transparent shadow-[var(--shadow-soft)]">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
            {showSettings ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSettings(false)}
              >
                ← Back
              </Button>
            ) : (
              <span />
            )}
            {!showSettings && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowSettings(true)}
                aria-label="Timer settings"
              >
                ⚙
              </Button>
            )}
          </div>

          {!showSettings ? (
            <div className="grid justify-items-center gap-4 py-4 text-center">
              <Badge variant="outline" className="mono text-sm tracking-widest">
                {phase}
              </Badge>
              <p
                className="mono font-medium leading-none"
                style={{
                  fontSize: "clamp(4.2rem, 14vw, 8rem)",
                  letterSpacing: "-0.03em",
                  textShadow: "0 0 24px hsl(var(--primary) / 0.28)",
                }}
                aria-live="polite"
              >
                {formatClock(secondsLeft)}
              </p>
              <p className="mono text-muted-foreground">
                Session {sessionCount} of {sessionsBeforeLong}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  className="min-w-28 text-base"
                  onClick={running ? pause : start}
                  aria-pressed={running}
                >
                  {running ? "Pause" : "Start"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-w-28 text-base"
                  onClick={reset}
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <div>
                <h2 className="mb-2">Pomodoro</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pomo-work">Work (Minutes)</Label>
                    <Input
                      id="pomo-work"
                      type="number"
                      min={5}
                      value={workMin}
                      onChange={(e) => setWorkMin(Number(e.target.value) || 25)}
                      onBlur={savePomoSettings}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pomo-short">Short Break</Label>
                    <Input
                      id="pomo-short"
                      type="number"
                      min={1}
                      value={shortBreakMin}
                      onChange={(e) =>
                        setShortBreakMin(Number(e.target.value) || 5)
                      }
                      onBlur={savePomoSettings}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pomo-long">Long Break</Label>
                    <Input
                      id="pomo-long"
                      type="number"
                      min={1}
                      value={longBreakMin}
                      onChange={(e) =>
                        setLongBreakMin(Number(e.target.value) || 15)
                      }
                      onBlur={savePomoSettings}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pomo-sessions">Sessions Before Long</Label>
                    <Input
                      id="pomo-sessions"
                      type="number"
                      min={1}
                      value={sessionsBeforeLong}
                      onChange={(e) =>
                        setSessionsBeforeLong(Number(e.target.value) || 4)
                      }
                      onBlur={savePomoSettings}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <form onSubmit={saveAlarmSettings} className="grid gap-3">
                <h2>Alarm</h2>
                <div className="grid gap-1.5">
                  <Label htmlFor="alarm-file">
                    Upload Audio (mp3, wav, ogg)
                  </Label>
                  <Input
                    id="alarm-file"
                    type="file"
                    accept=".mp3,.wav,.ogg,audio/*"
                    onChange={handleAlarmFile}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="alarm-type">Alarm Type</Label>
                  <Select
                    value={alarmType}
                    onValueChange={(v) => setAlarmType(v as AlarmType)}
                  >
                    <SelectTrigger id="alarm-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="file">File</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="alarm-youtube">YouTube URL</Label>
                  <Input
                    id="alarm-youtube"
                    type="url"
                    value={alarmYoutubeUrl}
                    onChange={(e) => setAlarmYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Volume: {Math.round(alarmVolume * 100)}%</Label>
                  <Slider
                    value={[alarmVolume]}
                    onValueChange={([v]) => setAlarmVolume(v)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="alarm-fade"
                    checked={alarmFade}
                    onCheckedChange={(v) => setAlarmFade(v === true)}
                  />
                  <Label htmlFor="alarm-fade">Fade in over 8 seconds</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Save Alarm</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={previewAlarm}
                  >
                    Preview
                  </Button>
                </div>
                {alarmStatus && (
                  <p className="mono text-sm text-muted-foreground">
                    {alarmStatus}
                  </p>
                )}
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
