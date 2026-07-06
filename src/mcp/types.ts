import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { NLobbyApi } from "../api/index.js";
import type { BrowserAuth } from "../auth/browser.js";
import type { CredentialManager } from "../auth/credentials.js";

export interface MCPContext {
  api: NLobbyApi;
  browserAuth: BrowserAuth;
  credentialManager: CredentialManager;
}

export type ToolHandlerResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; mimeType: string; data: string }
  >;
};

export interface MCPTool {
  definition: Tool;
  handler: (
    ctx: MCPContext,
    args: Record<string, unknown> | undefined,
  ) => Promise<ToolHandlerResult>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (ctx: MCPContext) => Promise<string>;
}

export interface MCPModule {
  tools?: MCPTool[];
  resources?: MCPResource[];
}
