import type {
  SchoolingPageData,
  SchoolingSession,
  SchoolingEntryDetail,
} from "../../types.js";

function formatSession(session: SchoolingSession, index: number): string[] {
  const lines: string[] = [];
  const title = session.subjectName || session.rawText || `Entry ${index + 1}`;
  const idPrefix = session.entryId ? `[${session.entryId}] ` : "";
  lines.push(`  ${index + 1}. ${idPrefix}${title}`);

  if (session.date) lines.push(`     Date: ${session.date}`);
  if (session.time) lines.push(`     Time: ${session.time}`);
  if (session.location) lines.push(`     Location: ${session.location}`);
  if (session.status) lines.push(`     Status: ${session.status}`);
  if (session.sessionNumber)
    lines.push(`     Session: ${session.sessionNumber}`);
  if (session.notes) lines.push(`     Notes: ${session.notes}`);
  if (session.entryId) {
    lines.push(`     Detail: nlobby schooling show ${session.entryId}`);
  } else if (session.detailUrl) {
    lines.push(`     URL: ${session.detailUrl}`);
  }

  return lines;
}

export function formatSchooling(data: SchoolingPageData): string {
  const lines: string[] = [];

  lines.push(`Secure host: ${data.secureHost}`);
  lines.push(`Target: ${data.targetUrl}`);
  lines.push(`Final URL: ${data.finalUrl}`);
  lines.push("");

  if (data.summary) {
    lines.push("── Summary ──");
    if (data.summary.necessaryCount != null) {
      lines.push(`  Required: ${data.summary.necessaryCount}`);
    }
    if (data.summary.attendanceCount != null) {
      lines.push(`  Attended: ${data.summary.attendanceCount}`);
    }
    if (data.summary.entryCount != null) {
      lines.push(`  Registered: ${data.summary.entryCount}`);
    }
    if (data.summary.remainingCount != null) {
      lines.push(`  Remaining: ${data.summary.remainingCount}`);
    }
    lines.push("");
  }

  if (data.sessions.length === 0) {
    lines.push("No schooling entries found on the page.");
    return lines.join("\n");
  }

  lines.push(`── Schooling (${data.sessions.length}) ──`);
  data.sessions.forEach((session, index) => {
    lines.push(...formatSession(session, index));
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export function formatSchoolingDetail(detail: SchoolingEntryDetail): string {
  const lines: string[] = [];

  lines.push(`Entry ID: ${detail.entryId}`);
  if (detail.title) lines.push(`Title: ${detail.title}`);
  if (detail.status) lines.push(`Status: ${detail.status}`);
  lines.push(`URL: ${detail.detailUrl}`);
  lines.push("");

  if (detail.fields.length > 0) {
    lines.push("── Application details ──");
    for (const field of detail.fields) {
      lines.push(`  ${field.label}: ${field.value}`);
    }
    lines.push("");
  }

  if (detail.description) {
    lines.push("── Description ──");
    const preview =
      detail.description.length > 500
        ? `${detail.description.slice(0, 500)}...`
        : detail.description;
    lines.push(`  ${preview}`);
    lines.push("");
  }

  if (detail.attachments && detail.attachments.length > 0) {
    lines.push("── Attachments ──");
    for (const attachment of detail.attachments) {
      lines.push(`  [${attachment.fileId}] ${attachment.fileName}`);
    }
    lines.push("");
  }

  if (detail.scheduleRows && detail.scheduleRows.length > 0) {
    lines.push("── Schedule ──");
    for (const row of detail.scheduleRows) {
      lines.push(`  ${row.cells.join(" | ")}`);
    }
  }

  return lines.join("\n").trimEnd();
}
