import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatHealth } from "../formatters/health.js";

export function buildHealthCommand(api: NLobbyApi): Command {
  const health = new Command("health")
    .description("Check N Lobby API connectivity and authentication")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const ok = await api.healthCheck();
        if (opts.json) {
          console.log(JSON.stringify({ ok }, null, 2));
        } else {
          console.log(formatHealth(ok));
        }
        if (!ok) process.exit(1);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return health;
}
