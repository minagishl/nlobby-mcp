import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import type { NewsTab } from "../../api/news.js";
import { formatNews, formatNewsDetail } from "../formatters/news.js";

async function listNews(
  api: NLobbyApi,
  opts: {
    limit: string;
    category?: string;
    sort: string;
    unread?: boolean;
    tab?: NewsTab;
    json?: boolean;
  },
): Promise<void> {
  let items = await api.getNews({ tab: opts.tab });

  if (opts.unread) {
    items = items.filter((i) => i.isUnread);
  }

  if (opts.category) {
    const cat = opts.category.toLowerCase();
    items = items.filter(
      (i) =>
        i.category.toLowerCase().includes(cat) ||
        (i.menuName ?? "").toLowerCase().includes(cat),
    );
  }

  switch (opts.sort) {
    case "oldest":
      items.sort(
        (a, b) =>
          new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
      );
      break;
    case "title-asc":
      items.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "title-desc":
      items.sort((a, b) => b.title.localeCompare(a.title));
      break;
    default:
      items.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  const limit = parseInt(opts.limit, 10);
  items = items.slice(0, limit);

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
  } else {
    console.log(formatNews(items));
  }
}

export function buildNewsCommand(api: NLobbyApi): Command {
  const news = new Command("news").description("N Lobby news");

  const listOptions = (command: Command): void => {
    command
      .option("--limit <n>", "Number of items to show", "10")
      .option("--category <cat>", "Filter by category")
      .option(
        "--sort <order>",
        "Sort order: newest|oldest|title-asc|title-desc",
        "newest",
      )
      .option("--unread", "Show only unread items")
      .option("--json", "Output raw JSON");
  };

  // Default action: list news
  const list = news
    .command("list", { isDefault: true })
    .description("List news")
    .option("--tab <tab>", "News tab: all|mentor (default: all)", "all");

  listOptions(list);

  list.action(
    async (opts: {
      limit: string;
      category?: string;
      sort: string;
      unread?: boolean;
      tab: string;
      json?: boolean;
    }) => {
      try {
        const tab = opts.tab === "mentor" ? "mentor" : "all";
        await listNews(api, { ...opts, tab });
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    },
  );

  const mentor = news
    .command("mentor")
    .description("List mentor news (same as /news?tab=mentor)");

  listOptions(mentor);

  mentor.action(
    async (opts: {
      limit: string;
      category?: string;
      sort: string;
      unread?: boolean;
      json?: boolean;
    }) => {
      try {
        await listNews(api, { ...opts, tab: "mentor" });
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    },
  );

  news
    .command("show <id>")
    .description("Show news detail")
    .option("--mark-read", "Mark the article as read after viewing")
    .option("--json", "Output raw JSON")
    .action(
      async (id: string, opts: { markRead?: boolean; json?: boolean }) => {
        try {
          const detail = await api.getNewsDetail(id);

          if (opts.markRead) {
            try {
              await api.markNewsAsRead(id);
            } catch (markErr) {
              console.error(
                "[WARN]",
                markErr instanceof Error ? markErr.message : markErr,
              );
            }
          }

          if (opts.json) {
            console.log(JSON.stringify(detail, null, 2));
          } else {
            console.log(formatNewsDetail(detail));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  news
    .command("read <ids...>")
    .description("Mark one or more news articles as read")
    .action(async (ids: string[]) => {
      const errors: { id: string; error: string }[] = [];
      const success: string[] = [];
      for (const id of ids) {
        try {
          await api.markNewsAsRead(id);
          success.push(id);
        } catch (err) {
          errors.push({
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (success.length > 0) {
        console.log(`[OK] Marked as read: ${success.join(", ")}`);
      }
      if (errors.length > 0) {
        for (const e of errors) {
          console.error(`[FAIL] ${e.id}: ${e.error}`);
        }
        process.exit(1);
      }
    });

  news
    .command("unread-info")
    .description("Show unread news count and flags")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const info = await api.getUnreadNewsInfo();
        if (opts.json) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log(
            `Unread: ${info.totalCount} (important: ${info.hasImportantNews}, mentor: ${info.byMentorNewsCount})`,
          );
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  news
    .command("download <id>")
    .description("Download attachment from a news detail")
    .option(
      "--index <n>",
      "Attachment index to download (1-based, default: 1)",
      "1",
    )
    .option("--output-dir <dir>", "Directory to save downloaded file", ".")
    .action(async (id: string, opts: { index: string; outputDir: string }) => {
      try {
        const index = Math.max(1, parseInt(opts.index, 10) || 1) - 1;
        const savedPath = await api.downloadNewsAttachment(
          id,
          index,
          opts.outputDir,
        );
        console.log(`[OK] Downloaded attachment to: ${savedPath}`);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return news;
}
