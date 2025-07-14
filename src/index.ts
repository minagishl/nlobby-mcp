#!/usr/bin/env node

import { NLobbyMCPServer } from "./server.js";

async function main() {
  const server = new NLobbyMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
