import { config } from "dotenv";

config();

export const CONFIG = {
  nlobby: {
    baseUrl: process.env.NLOBBY_BASE_URL || "https://nlobby.nnn.ed.jp",
  },
  mcp: {
    serverName: process.env.MCP_SERVER_NAME || "nlobby-mcp",
    serverVersion: process.env.MCP_SERVER_VERSION || "1.0.0",
  },
} as const;
