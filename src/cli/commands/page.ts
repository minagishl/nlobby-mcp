import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";

export function buildPageCommand(api: NLobbyApi): Command {
  const page = new Command("page")
    .description("Fetch authenticated N Lobby page content by path")
    .argument("<path>", "Page path (e.g. /news, /required-course)")
    .option("--length <n>", "Max characters to show", "2000")
    .option("--json", "Output raw JSON with metadata")
    .action(
      async (pagePath: string, opts: { length: string; json?: boolean }) => {
        try {
          const endpoint = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
          const maxLength = parseInt(opts.length, 10) || 2000;
          const sample = await api.testPageContent(endpoint, maxLength);

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  path: endpoint,
                  length: sample.length,
                  content: sample,
                },
                null,
                2,
              ),
            );
          } else {
            console.log(`Path: ${endpoint}`);
            console.log(`Length: ${sample.length} chars (max ${maxLength})`);
            console.log("---");
            console.log(sample);
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  return page;
}
