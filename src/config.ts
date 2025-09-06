import { config } from "dotenv";

config();

function getPlatformUserAgent(): string {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
    case "win32":
      return "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
    case "linux":
    default:
      return "Mozilla/5.0 (X11; CrOS x86_64 10066.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
  }
}

export const CONFIG = {
  nlobby: {
    baseUrl: process.env.NLOBBY_BASE_URL || "https://nlobby.nnn.ed.jp",
  },
  mcp: {
    serverName: process.env.MCP_SERVER_NAME || "nlobby-mcp",
    serverVersion: process.env.MCP_SERVER_VERSION || "1.0.0",
  },
  userAgent: process.env.USER_AGENT || getPlatformUserAgent(),
} as const;
