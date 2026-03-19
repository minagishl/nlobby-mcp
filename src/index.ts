#!/usr/bin/env node

const args = process.argv.slice(2);
const explicitServe = args[0] === "serve" || args[0] === "mcp";
const legacyMcpMode = args.length === 0 && !process.stdin.isTTY;

async function main() {
  if (explicitServe || legacyMcpMode) {
    const { NLobbyMCPServer } = await import("./mcp/server.js");
    const server = new NLobbyMCPServer();
    await server.start();
  } else {
    const { runCli } = await import("./cli/index.js");
    await runCli();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
