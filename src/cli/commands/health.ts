import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatHealth } from "../formatters/health.js";

export function buildHealthCommand(api: NLobbyApi): Command {
  const health = new Command("health").description(
    "API connectivity and debugging tools",
  );

  health
    .command("check", { isDefault: true })
    .description("Check N Lobby API connectivity and authentication (default)")
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

  health
    .command("debug")
    .description("Debug N Lobby connection with detailed information")
    .option("--endpoint <path>", "Endpoint to test", "/news")
    .action(async (opts: { endpoint: string }) => {
      try {
        const result = await api.debugConnection(opts.endpoint);
        console.log(result);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  health
    .command("page")
    .description("Test page content retrieval and show sample content")
    .option("--endpoint <path>", "Endpoint to test", "/news")
    .option("--length <n>", "Number of characters to show", "1000")
    .action(async (opts: { endpoint: string; length: string }) => {
      try {
        const content = await api.testPageContent(
          opts.endpoint,
          parseInt(opts.length, 10),
        );
        console.log(`Sample content from ${opts.endpoint}:\n\n${content}`);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  health
    .command("trpc <method>")
    .description("Test a specific tRPC endpoint (e.g. news.getUnreadNewsCount)")
    .option("--params <json>", "JSON string of parameters")
    .option("--json", "Output raw JSON result")
    .action(
      async (method: string, opts: { params?: string; json?: boolean }) => {
        try {
          const params = opts.params ? JSON.parse(opts.params) : {};
          const result = await api.testTrpcEndpoint(method, params);
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(
              `Result of ${method} with params ${JSON.stringify(params)}:\n\n${JSON.stringify(result, null, 2)}`,
            );
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  health
    .command("verify")
    .description(
      "Verify authentication status and cookie synchronization across all clients",
    )
    .action(async () => {
      try {
        const status = api.getCookieStatus();
        console.log(status);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return health;
}
