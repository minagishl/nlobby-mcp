import type {
  DesignatedSchoolEntry,
  DesignatedSchoolPageData,
} from "../../types.js";

function formatEntry(entry: DesignatedSchoolEntry, index: number): string[] {
  const lines: string[] = [];
  lines.push(`  ${index + 1}. [${entry.code}] ${entry.schoolName}`);
  if (entry.course) lines.push(`     Course: ${entry.course}`);
  if (entry.schoolType || entry.prefecture) {
    lines.push(
      `     Type: ${[entry.schoolType, entry.prefecture].filter(Boolean).join(" | ")}`,
    );
  }
  if (entry.quota) lines.push(`     ${entry.quota}`);
  if (entry.applicationType) lines.push(`     ${entry.applicationType}`);
  if (entry.selectionDeadline) {
    lines.push(`     校内選考〆切: ${entry.selectionDeadline}`);
  }
  if (entry.applicationStartDate || entry.applicationDeadline) {
    lines.push(
      `     出願: ${entry.applicationStartDate ?? "?"} ~ ${entry.applicationDeadline ?? "?"}`,
    );
  }
  if (entry.note) lines.push(`     Note: ${entry.note}`);
  if (entry.pdfUrl) lines.push(`     PDF: ${entry.pdfUrl}`);
  return lines;
}

export function formatDesignatedSchool(data: DesignatedSchoolPageData): string {
  const lines: string[] = [];

  lines.push(`Secure host: ${data.secureHost}`);
  lines.push(`Target: ${data.targetUrl}`);
  lines.push(`Final URL: ${data.finalUrl}`);
  lines.push("");

  if (
    data.intro &&
    (data.intro.title ||
      data.intro.sections.length > 0 ||
      data.intro.documents.length > 0)
  ) {
    lines.push(`── ${data.intro.title ?? "指定校情報のご案内"} ──`);
    for (const section of data.intro.sections) {
      lines.push(`  ${section.heading}`);
      const preview =
        section.content.length > 200
          ? `${section.content.slice(0, 200)}...`
          : section.content;
      lines.push(`    ${preview}`);
    }
    if (data.intro.updates.length > 0) {
      lines.push("  Updates:");
      for (const update of data.intro.updates) {
        lines.push(`    - ${update}`);
      }
    }
    if (data.intro.documents.length > 0) {
      lines.push("  Documents:");
      for (const document of data.intro.documents) {
        const status = document.disabled ? " (unavailable)" : "";
        lines.push(`    - ${document.title}${status}`);
      }
    }
    lines.push("");
  }

  const countLabel =
    data.totalCount != null
      ? `${data.entries.length} shown / ${data.totalCount} total`
      : `${data.entries.length}`;
  const pageLabel =
    data.currentPage != null && data.totalPages != null
      ? ` (page ${data.currentPage}/${data.totalPages})`
      : "";
  lines.push(`── Designated schools (${countLabel})${pageLabel} ──`);

  if (data.entries.length === 0) {
    lines.push("No designated school entries found.");
    return lines.join("\n");
  }

  data.entries.forEach((entry, index) => {
    lines.push(...formatEntry(entry, index));
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
