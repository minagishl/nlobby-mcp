import { textResult } from "../helpers.js";
import type { MCPContext, MCPModule } from "../types.js";

function getAuthenticationRecommendations(ctx: MCPContext): string {
  const authStatus = ctx.api.getCookieStatus();
  const recommendations: string[] = [];

  if (
    authStatus.includes("[ERROR] no cookies") &&
    authStatus.includes("[ERROR] not authenticated")
  ) {
    recommendations.push(
      "1. Run interactive_login to authenticate with N Lobby",
    );
    recommendations.push(
      "2. Make sure to complete the login process in the browser window",
    );
    recommendations.push(
      '3. Wait for the "Login successful" message before proceeding',
    );
  } else if (authStatus.includes("[ERROR] not synchronized")) {
    recommendations.push("1. Cookie synchronization issue detected");
    recommendations.push(
      "2. Try running interactive_login again to refresh all cookies",
    );
  } else if (
    authStatus.includes("[SUCCESS] authenticated") &&
    authStatus.includes("[SUCCESS] synchronized")
  ) {
    recommendations.push("1. Authentication appears to be working correctly");
    recommendations.push(
      "2. If endpoints are still failing, the issue may be server-side",
    );
    recommendations.push("3. Try running health_check to verify connectivity");
  } else {
    recommendations.push(
      "1. Check the authentication status above for specific issues",
    );
    recommendations.push("2. Run health_check to verify overall system health");
  }

  return recommendations.join("\n");
}

export const authModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "set_cookies",
        description: "Set authentication cookies for N Lobby access",
        inputSchema: {
          type: "object",
          properties: {
            cookies: {
              type: "string",
              description: "Cookie string from authenticated N Lobby session",
            },
          },
          required: ["cookies"],
        },
      },
      handler: async (ctx, args) => {
        const { cookies } = (args ?? {}) as { cookies: string };
        ctx.api.setCookies(cookies);
        return textResult(
          "Authentication cookies have been set. You can now access real N Lobby data.",
        );
      },
    },
    {
      definition: {
        name: "check_cookies",
        description: "Check if authentication cookies are set",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        return textResult(`Cookie status: ${ctx.api.getCookieStatus()}`);
      },
    },
    {
      definition: {
        name: "verify_authentication",
        description:
          "Verify authentication status and cookie synchronization across all clients",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        const authStatus = ctx.api.getCookieStatus();
        return textResult(
          `[INFO] Authentication Verification Report\n\n${authStatus}\n\n[LOG] Recommendations:\n${getAuthenticationRecommendations(ctx)}`,
        );
      },
    },
    {
      definition: {
        name: "interactive_login",
        description:
          "Open browser for manual login to N Lobby (no credentials required)",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          await ctx.browserAuth.initializeBrowser();
          const extractedCookies = await ctx.browserAuth.interactiveLogin();
          ctx.api.setCookies(extractedCookies.allCookies);
          await ctx.browserAuth.close();

          return textResult(
            `[SUCCESS] Successfully logged in to N Lobby!\n\nExtracted cookies:\n- Session Token: ${extractedCookies.sessionToken ? "present" : "missing"}\n- CSRF Token: ${extractedCookies.csrfToken ? "present" : "missing"}\n- Callback URL: ${extractedCookies.callbackUrl || "not set"}\n\nYou can now access real N Lobby data using other tools.`,
          );
        } catch (error) {
          await ctx.browserAuth.close();
          return textResult(
            `[ERROR] Interactive login failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    },
    {
      definition: {
        name: "login_help",
        description: "Get help and troubleshooting tips for N Lobby login",
        inputSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              description:
                "Your email address (optional, for personalized help)",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        const { email } = (args ?? {}) as { email?: string };

        let helpMessage = `[LOGIN] N Lobby Login Help\n\n`;

        if (email) {
          const emailValidation = ctx.credentialManager.validateEmail(email);
          helpMessage += `[EMAIL] Email: ${email}\n`;
          helpMessage += `[USER] User Type: ${emailValidation.userType}\n`;
          helpMessage += `[SUCCESS] Valid: ${emailValidation.valid ? "Yes" : "No"}\n\n`;

          if (!emailValidation.valid) {
            helpMessage += `[ERROR] Issue: ${emailValidation.message}\n\n`;
          }

          helpMessage += ctx.credentialManager.getLoginGuidance(
            emailValidation.userType,
          );
        } else {
          helpMessage += ctx.credentialManager.getLoginGuidance("unknown");
        }

        helpMessage += `\n\n${ctx.credentialManager.getTroubleshootingTips()}`;

        const stats = ctx.credentialManager.getSessionStats();
        helpMessage += `\n\n[STATUS] Session Stats:\n- Active sessions: ${stats.total - stats.expired}\n- Expired sessions: ${stats.expired}`;

        return textResult(helpMessage);
      },
    },
  ],
};
