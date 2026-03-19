import type { NLobbyAnnouncement, NLobbyNewsDetail } from "../../types.js";

export function formatNews(items: NLobbyAnnouncement[]): string {
  if (items.length === 0) {
    return "No news found.";
  }

  const lines: string[] = [];
  for (const item of items) {
    const date = new Date(item.publishedAt).toLocaleDateString("ja-JP");
    const unread = item.isUnread ? " [UNREAD]" : "";
    const important = item.isImportant ? " [!]" : "";
    lines.push(`[${item.id}] ${date}${important}${unread}`);
    lines.push(`  ${item.title}`);
    if (item.menuName) {
      lines.push(`  Category: ${item.menuName}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatNewsDetail(detail: NLobbyNewsDetail): string {
  const lines: string[] = [];
  const date = new Date(detail.publishedAt).toLocaleDateString("ja-JP");

  lines.push(`Title: ${detail.title}`);
  lines.push(`Date: ${date}`);
  lines.push(`Category: ${detail.menuName.join(", ")}`);
  if (detail.isImportant) lines.push("Important: Yes");
  lines.push(`URL: ${detail.url}`);
  lines.push("");
  lines.push("─".repeat(50));
  lines.push("");

  if (detail.description) {
    lines.push(detail.description);
  } else {
    // Strip HTML tags for plain text display
    const plainText = detail.content
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    lines.push(plainText);
  }

  if (detail.attachments && detail.attachments.length > 0) {
    lines.push("");
    lines.push("Attachments:");
    for (const att of detail.attachments) {
      lines.push(`  - ${att.fileName}: ${att.href}`);
    }
  }

  return lines.join("\n");
}
