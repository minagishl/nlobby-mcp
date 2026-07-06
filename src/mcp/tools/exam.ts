import { catchError, jsonResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const examModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "check_exam_day",
        description:
          "Check if the specified date (or today if omitted) is an exam day",
        inputSchema: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description:
                "Date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { date } = (args ?? {}) as { date?: string };
          const targetDate = date ? new Date(date) : undefined;
          const result = await ctx.api.isExamDay(targetDate);
          return jsonResult({
            date: targetDate
              ? targetDate.toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0],
            isExamDay: result,
          });
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "finish_exam_day_mode",
        description: "Finish exam day mode",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult({ success: await ctx.api.finishExamDayMode() });
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_exam_otp",
        description: "Get one-time password for exam",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getExamOneTimePassword());
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
