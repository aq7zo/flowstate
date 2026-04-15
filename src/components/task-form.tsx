"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Priority, CustomTag } from "@/types";

interface TaskFormProps {
  onSubmit: (data: {
    title: string;
    priority: Priority;
    tag: string | null;
    estimatedMin: number;
    notes: string;
    links: string[];
  }) => void;
  defaultPriority?: Priority;
  customTags?: CustomTag[];
}

export function TaskForm({
  onSubmit,
  defaultPriority = "none",
  customTags = [],
}: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [tag, setTag] = useState<string>("none");
  const [estimated, setEstimated] = useState("");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState<string[]>([""]);

  function handleLinkChange(index: number, value: string) {
    setLinks((prev) => {
      const next = [...prev];
      next[index] = value;
      if (index === next.length - 1 && value.length > 0) {
        next.push("");
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      priority,
      tag: tag === "none" ? null : tag,
      estimatedMin: Math.max(0, Number(estimated) || 0),
      notes: notes.trim(),
      links: links.map((l) => l.trim()).filter(Boolean),
    });
    setTitle("");
    setEstimated("");
    setNotes("");
    setLinks([""]);
    setPriority(defaultPriority);
    setTag("none");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3" aria-label="Create task">
      <div className="grid gap-1.5">
        <Label htmlFor="task-title">Task Title</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          autoComplete="off"
          placeholder="Write lab report..."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id="task-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-tag">Tag</Label>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger id="task-tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tag</SelectItem>
              {customTags.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-estimated">Estimated Minutes</Label>
          <Input
            id="task-estimated"
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="45"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea
          id="task-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Add context for this task..."
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Reference Links</Label>
        {links.map((link, i) => (
          <Input
            key={i}
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => handleLinkChange(i, e.target.value)}
            placeholder={
              i === 0
                ? "https://canvas.example.com/..."
                : "Add another link..."
            }
          />
        ))}
      </div>
      <div>
        <Button type="submit">Add Task</Button>
      </div>
    </form>
  );
}
