import type { NLobbyLearningResource } from "../../types.js";

function typeLabel(type: NLobbyLearningResource["type"]): string {
  switch (type) {
    case "document":
      return "Document";
    case "video":
      return "Video";
    case "assignment":
      return "Assignment";
    case "quiz":
      return "Quiz";
    default:
      return type;
  }
}

export function formatLearningResources(
  resources: NLobbyLearningResource[],
): string {
  if (resources.length === 0) {
    return "No learning resources found.";
  }

  const lines: string[] = [];
  for (const resource of resources) {
    lines.push(`[${resource.id}] ${resource.title}`);
    lines.push(`  Subject: ${resource.subject}`);
    lines.push(`  Type: ${typeLabel(resource.type)}`);
    if (resource.grade) {
      lines.push(`  Grade: ${resource.grade}`);
    }
    lines.push(
      `  Published: ${new Date(resource.publishedAt).toLocaleDateString("ja-JP")}`,
    );
    if (resource.description) {
      lines.push(`  ${resource.description}`);
    }
    lines.push(`  URL: ${resource.url}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
