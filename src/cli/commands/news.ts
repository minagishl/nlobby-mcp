import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatNews, formatNewsDetail } from "../formatters/news.js";

export function buildNewsCommand(api: NLobbyApi): Command {
  const news = new Command("news").description("N Lobby news");

  // Default action: list news
  news
    .command("list", { isDefault: true })
    .description("List news")
    .option("--limit <n>", "Number of items to show", "10")
    .option("--category <cat>", "Filter by category")
    .option(
      "--sort <order>",
      "Sort order: newest|oldest|title-asc|title-desc",
      "newest",
    )
    .option("--unread", "Show only unread items")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        limit: string;
        category?: string;
        sort: string;
        unread?: boolean;
        json?: boolean;
      }) => {
        try {
          let items = await api.getNews();

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
                  new Date(a.publishedAt).getTime() -
                  new Date(b.publishedAt).getTime(),
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
                  new Date(b.publishedAt).getTime() -
                  new Date(a.publishedAt).getTime(),
              );
          }

          const limit = parseInt(opts.limit, 10);
          items = items.slice(0, limit);

          if (opts.json) {
            console.log(JSON.stringify(items, null, 2));
          } else {
            console.log(formatNews(items));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  news
    .command("show <id>")
    .description("Show news detail")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const detail = await api.getNewsDetail(id);
        if (opts.json) {
          console.log(JSON.stringify(detail, null, 2));
        } else {
          console.log(formatNewsDetail(detail));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  news
    .command("read <id>")
    .description("Mark news as read")
    .action(async (id: string) => {
      try {
        await api.markNewsAsRead(id);
        console.log(`[OK] Marked ${id} as read.`);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return news;
}
