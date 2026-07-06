import { textResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const healthModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "health_check",
        description: "Check if N Lobby API connection is working",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        const isHealthy = await ctx.api.healthCheck();
        return textResult(
          `N Lobby API connection: ${isHealthy ? "healthy" : "failed"}`,
        );
      },
    },
    {
      definition: {
        name: "debug_connection",
        description: "Debug N Lobby connection with detailed information",
        inputSchema: {
          type: "object",
          properties: {
            endpoint: {
              type: "string",
              description: "Endpoint to test (default: /news)",
              default: "/news",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        const { endpoint } = (args ?? {}) as { endpoint?: string };
        return textResult(await ctx.api.debugConnection(endpoint || "/news"));
      },
    },
    {
      definition: {
        name: "test_page_content",
        description: "Test page content retrieval and show sample content",
        inputSchema: {
          type: "object",
          properties: {
            endpoint: {
              type: "string",
              description: "Endpoint to test (default: /news)",
              default: "/news",
            },
            length: {
              type: "number",
              description: "Number of characters to show (default: 1000)",
              default: 1000,
            },
          },
        },
      },
      handler: async (ctx, args) => {
        const { endpoint, length } = (args ?? {}) as {
          endpoint?: string;
          length?: number;
        };
        const testEndpoint = endpoint || "/news";
        const sampleContent = await ctx.api.testPageContent(
          testEndpoint,
          length || 1000,
        );
        return textResult(
          `Sample content from ${testEndpoint}:\n\n${sampleContent}`,
        );
      },
    },
    {
      definition: {
        name: "test_trpc_endpoint",
        description: "Test specific tRPC endpoint with detailed response",
        inputSchema: {
          type: "object",
          properties: {
            method: {
              type: "string",
              description:
                "tRPC method to test (e.g., news.getUnreadNewsCount, user.updateLastAccess)",
              default: "user.updateLastAccess",
            },
            params: {
              type: "string",
              description: "JSON string of parameters (optional)",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        const { method, params } = (args ?? {}) as {
          method?: string;
          params?: string;
        };
        const trpcMethod = method || "user.updateLastAccess";

        try {
          const parsedParams = params ? JSON.parse(params) : {};
          const result = await ctx.api.testTrpcEndpoint(
            trpcMethod,
            parsedParams,
          );
          return textResult(
            `Result of ${trpcMethod} with params ${JSON.stringify(parsedParams)}:\n\n${JSON.stringify(result, null, 2)}`,
          );
        } catch (error) {
          return textResult(
            `Error testing tRPC endpoint ${trpcMethod}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    },
  ],
};
