import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import {
  formatSchooling,
  formatSchoolingDetail,
} from "../formatters/schooling.js";

export function buildSchoolingCommand(api: NLobbyApi): Command {
  const schooling = new Command("schooling").description(
    "Schooling schedule and application details from the secure student portal",
  );

  schooling
    .command("list", { isDefault: true })
    .description("List schooling entries")
    .option("--json", "Output raw JSON")
    .option("--html", "Output raw #main HTML from the schooling list page")
    .action(async (opts: { json?: boolean; html?: boolean }) => {
      try {
        if (opts.html) {
          const html = await api.getSchoolingPageHtml();
          console.log(html);
          return;
        }

        const data = await api.getSchooling();
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(formatSchooling(data));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  schooling
    .command("show <entryId>")
    .description(
      "Show schooling application details (申し込み内容) by entry ID",
    )
    .option("--json", "Output raw JSON")
    .option("--html", "Output raw #main HTML from the detail page")
    .action(
      async (entryId: string, opts: { json?: boolean; html?: boolean }) => {
        try {
          if (opts.html) {
            const html = await api.getSchoolingDetailPageHtml(entryId);
            console.log(html);
            return;
          }

          const detail = await api.getSchoolingDetail(entryId);
          if (opts.json) {
            console.log(JSON.stringify(detail, null, 2));
          } else {
            console.log(formatSchoolingDetail(detail));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  return schooling;
}
