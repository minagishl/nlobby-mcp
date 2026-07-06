import { catchError, jsonResult, textResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const schoolingModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_schooling",
        description:
          "Fetch schooling schedule from the secure student portal (/mypage/schooling/top)",
        inputSchema: {
          type: "object",
          properties: {
            html_only: {
              type: "boolean",
              description:
                "Return raw #main HTML instead of parsed schooling data (optional, default: false)",
              default: false,
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { html_only = false } = (args ?? {}) as { html_only?: boolean };
          if (html_only) {
            return textResult(await ctx.api.getSchoolingPageHtml());
          }
          return jsonResult(await ctx.api.getSchooling());
        } catch (error) {
          return catchError(error, "Error fetching schooling page");
        }
      },
    },
    {
      definition: {
        name: "get_schooling_detail",
        description:
          "Fetch schooling application details (申し込み内容) by entry ID from the secure portal",
        inputSchema: {
          type: "object",
          properties: {
            entry_id: {
              type: "string",
              description: "Schooling entry ID (entryId query parameter)",
            },
            html_only: {
              type: "boolean",
              description:
                "Return raw #main HTML instead of parsed detail data (optional, default: false)",
              default: false,
            },
          },
          required: ["entry_id"],
        },
      },
      handler: async (ctx, args) => {
        try {
          const { entry_id, html_only = false } = (args ?? {}) as {
            entry_id: string;
            html_only?: boolean;
          };

          if (html_only) {
            return textResult(
              await ctx.api.getSchoolingDetailPageHtml(entry_id),
            );
          }
          return jsonResult(await ctx.api.getSchoolingDetail(entry_id));
        } catch (error) {
          return catchError(error, "Error fetching schooling detail");
        }
      },
    },
  ],
};
