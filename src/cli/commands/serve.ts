import { Command } from "commander";

export function buildServeCommand(): Command {
  const serve = new Command("serve")
    .alias("mcp")
    .description("Start the MCP server (stdio transport)")
    .action(async () => {
      const { logger } = await import("../../logger.js");
      logger.forceProductionMode();
      const { NLobbyMCPServer } = await import("../../mcp/server.js");
      const server = new NLobbyMCPServer();
      await server.start();
    });

  return serve;
}
