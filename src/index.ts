#!/usr/bin/env node

import { NLobbyMCPServer } from "./server.js";
import { logger } from "./logger.js";

async function main() {
  const server = new NLobbyMCPServer();
  await server.start();
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
