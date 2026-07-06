import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NLobbyApi } from "../api/index.js";
import { CONFIG } from "../config.js";
import { BrowserAuth } from "../auth/browser.js";
import { CredentialManager } from "../auth/credentials.js";
import { logger } from "../logger.js";
import { resourcesModule } from "./resources/index.js";
import {
  collectResources,
  collectTools,
  indexResourcesByUri,
  indexToolsByName,
} from "./registry.js";
import { toolModules } from "./tools/index.js";
import type { MCPContext } from "./types.js";

const mcpModules = [...toolModules, resourcesModule];

export class NLobbyMCPServer {
  private server: Server;
  private ctx: MCPContext;
  private toolsByName = indexToolsByName(collectTools(mcpModules));
  private resourcesByUri = indexResourcesByUri(collectResources(mcpModules));

  constructor() {
    this.server = new Server(
      {
        name: CONFIG.mcp.serverName,
        version: CONFIG.mcp.serverVersion,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      },
    );

    this.ctx = {
      api: new NLobbyApi(),
      browserAuth: new BrowserAuth(),
      credentialManager: new CredentialManager(),
    };

    this.setupHandlers();
  }

  private setupHandlers(): void {
    const tools = collectTools(mcpModules);
    const resources = collectResources(mcpModules);

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resources.map(({ uri, name, description, mimeType }) => ({
        uri,
        name,
        description,
        mimeType,
      })),
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;
        const handler = this.resourcesByUri.get(uri);

        if (!handler) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${uri}`,
          );
        }

        try {
          const text = await handler(this.ctx);
          return {
            contents: [{ uri, mimeType: "application/json", text }],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read resource: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((tool) => tool.definition),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const handler = this.toolsByName.get(name);

      if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await handler(this.ctx, args);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown prompt: ${request.params.name}`,
      );
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("N Lobby MCP Server started successfully");
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }
}
