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

import type { Priority } from "@/types";

interface TaskFormProps {
  onSubmit: (data: {
    title: string;
    priority: Priority;
    estimatedMin: number;
    notes: string;
    link: string;
  }) => void;
  defaultPriority?: Priority;
}

export function TaskForm({
  onSubmit,
  defaultPriority = "medium",
}: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [estimated, setEstimated] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      priority,
      estimatedMin: Math.max(0, Number(estimated) || 0),
      notes: notes.trim(),
      link: link.trim(),
    });
    setTitle("");
    setEstimated("");
    setNotes("");
    setLink("");
    setPriority(defaultPriority);
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger id="task-priority">
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
        <Label htmlFor="task-link">Reference Link</Label>
        <Input
          id="task-link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://canvas.example.com/..."
        />
      </div>
      <div>
        <Button type="submit">Add Task</Button>
      </div>
    </form>
  );
}
