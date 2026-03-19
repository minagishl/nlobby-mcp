import type { NLobbyScheduleItem, GoogleCalendarEvent } from "../../types.js";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

export function formatSchedule(items: NLobbyScheduleItem[]): string {
  if (items.length === 0) {
    return "No schedule items found.";
  }

  const byDate = new Map<string, NLobbyScheduleItem[]>();
  for (const item of items) {
    const key = formatDate(new Date(item.startTime));
    const group = byDate.get(key) ?? [];
    group.push(item);
    byDate.set(key, group);
  }

  const lines: string[] = [];
  for (const [date, dayItems] of byDate) {
    lines.push(`── ${date} ──`);
    for (const item of dayItems) {
      const start = formatTime(new Date(item.startTime));
      const end = formatTime(new Date(item.endTime));
      lines.push(`  ${start}–${end}  ${item.title}`);
      if (item.location) lines.push(`    Location: ${item.location}`);
      if (item.description) lines.push(`    ${item.description}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatCalendarEvents(events: GoogleCalendarEvent[]): string {
  if (events.length === 0) {
    return "No calendar events found.";
  }

  const lines: string[] = [];
  for (const event of events) {
    const startRaw = event.start.dateTime ?? event.start.date ?? "";
    const endRaw = event.end.dateTime ?? event.end.date ?? "";
    const isAllDay = !event.start.dateTime;

    let timeStr: string;
    if (isAllDay) {
      timeStr = startRaw;
    } else {
      const start = new Date(startRaw);
      const end = new Date(endRaw);
      timeStr = `${formatDate(start)} ${formatTime(start)}–${formatTime(end)}`;
    }

    lines.push(`[${event.id}] ${event.summary}`);
    lines.push(`  ${timeStr}`);
    if (event.location) lines.push(`  Location: ${event.location}`);
    if (event.description) {
      const desc = event.description.replace(/<[^>]+>/g, "").trim();
      if (desc) lines.push(`  ${desc}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
