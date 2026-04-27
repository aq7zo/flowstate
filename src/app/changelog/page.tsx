"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import {
  getTaskActivity,
  getReleaseNotes,
  initDb,
  seedReleaseNotes,
} from "@/lib/db";

import type { ReleaseNote, TaskActivityEvent } from "@/types";

const DEFAULT_RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-04-21",
    title: "Changelog introduced",
    content:
      "Added release notes and task activity streams so recent product and task changes are visible in one place.",
  },
];

export default function ChangelogPage() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"release" | "activity">("release");
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const [events, setEvents] = useState<TaskActivityEvent[]>([]);
  const [eventFilter, setEventFilter] = useState("all");

  useEffect(() => {
    async function load() {
      await initDb();
      await seedReleaseNotes(DEFAULT_RELEASE_NOTES);
      const [notes, history] = await Promise.all([
        getReleaseNotes(),
        getTaskActivity(600),
      ]);
      setReleaseNotes(notes);
      setEvents(history);
      setReady(true);
    }
    load();
  }, []);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    return events.filter((event) => event.type === eventFilter);
  }, [events, eventFilter]);

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
        <h1>Changelog</h1>
        <p className="text-muted-foreground">Release updates and task activity.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={tab === "release" ? "default" : "outline"}
          onClick={() => setTab("release")}
        >
          Release Notes
        </Button>
        <Button
          type="button"
          variant={tab === "activity" ? "default" : "outline"}
          onClick={() => setTab("activity")}
        >
          Task Activity
        </Button>
      </div>

      {tab === "release" ? (
        <Card>
          <CardHeader>
            <CardTitle>Release Notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {releaseNotes.map((entry) => (
              <article key={`${entry.date}-${entry.title}`} className="rounded-md border p-3">
                <p className="mono text-xs text-muted-foreground">{entry.date}</p>
                <h3 className="mt-1 text-base">{entry.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{entry.content}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>Task Activity</CardTitle>
            <Input
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value.trim() || "all")}
              placeholder="Filter by type: all, completed, deleted..."
            />
          </CardHeader>
          <CardContent className="grid gap-2">
            {filteredEvents.map((event) => (
              <article key={event.id} className="flex items-start justify-between rounded-md border p-2.5">
                <div>
                  <p>{event.title}</p>
                  <p className="mono text-xs text-muted-foreground">{event.date}</p>
                </div>
                <Badge variant="outline">{event.type}</Badge>
              </article>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
