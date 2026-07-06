import { catchError, jsonResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const accountModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_account_info",
        description:
          "Extract account information by parsing Next.js flight data from a rendered page",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getAccountInfoFromScript());
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_student_card_screenshot",
        description:
          "Capture a screenshot of the student ID card by following the secure portal redirect flow",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          const result = await ctx.api.getStudentCardScreenshot();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message:
                      "Student card screenshot captured successfully. Image data attached as base64.",
                    filePath: result.path,
                    studentNo: result.studentNo,
                    secureHost: result.secureHost,
                    callbackUrl: result.callbackUrl,
                    finalUrl: result.finalUrl,
                    elementSize: result.elementSize,
                  },
                  null,
                  2,
                ),
              },
              {
                type: "image",
                mimeType: "image/png",
                data: result.base64,
              },
            ],
          };
        } catch (error) {
          return catchError(error, "Error capturing student card screenshot");
        }
      },
    },
    {
      definition: {
        name: "update_last_access",
        description: "Update the last access timestamp for the current user",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult({ success: await ctx.api.updateLastAccess() });
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
