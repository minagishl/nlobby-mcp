import { catchError, jsonResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const navigationModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_navigation_menus",
        description: "Get main navigation menu list",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getMainNavigations());
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_notifications",
        description: "Get notification messages",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getNotificationMessages());
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_user_interests",
        description:
          "Get user interest tags (optionally with icon information)",
        inputSchema: {
          type: "object",
          properties: {
            with_icon: {
              type: "boolean",
              description:
                "Whether to include icon information (optional, default: false)",
              default: false,
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { with_icon = false } = (args ?? {}) as { with_icon?: boolean };
          return jsonResult(await ctx.api.getUserInterests(with_icon));
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_interest_weights",
        description: "Get interest weight scale definitions",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getInterestWeights());
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
