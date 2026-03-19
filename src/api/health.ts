import type { ApiContext } from "./context.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type { AxiosError } from "../types.js";

export async function healthCheck(ctx: ApiContext): Promise<boolean> {
  logger.info("[INFO] Running N Lobby API health check...");

  const healthCheckTests = [
    {
      name: "tRPC lightweight endpoint",
      test: async () => {
        try {
          const result = await ctx.trpcClient.getUnreadNewsCount();
          return typeof result === "number" && result >= 0;
        } catch {
          return false;
        }
      },
    },
    {
      name: "tRPC batch health check",
      test: async () => {
        try {
          const trpcHealthy = await ctx.trpcClient.healthCheck();
          return trpcHealthy;
        } catch {
          return false;
        }
      },
    },
    {
      name: "HTML news page access",
      test: async () => {
        try {
          const response = await ctx.httpClient.get("/news", {
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            withCredentials: true,
            timeout: 8000,
          });

          if (response.status === 200 && typeof response.data === "string") {
            const content = response.data.toLowerCase();
            const hasLoginIndicators =
              content.includes("ログイン") ||
              content.includes("login") ||
              content.includes("sign-in");
            const hasNewsContent =
              content.includes("news") ||
              content.includes("お知らせ") ||
              content.includes("nlobby");

            return !hasLoginIndicators && hasNewsContent;
          }
          return false;
        } catch {
          return false;
        }
      },
    },
    {
      name: "Basic server connectivity",
      test: async () => {
        try {
          const pingResponse = await ctx.httpClient.get("/", {
            timeout: 5000,
            withCredentials: true,
          });
          return pingResponse.status === 200;
        } catch {
          return false;
        }
      },
    },
  ];

  for (let i = 0; i < healthCheckTests.length; i++) {
    const test = healthCheckTests[i];
    logger.info(`[STEP${i + 1}] Testing ${test.name}...`);

    try {
      const result = await test.test();
      if (result) {
        logger.info(`[SUCCESS] ${test.name} passed`);

        if (i < 3) {
          logger.info(
            "[SUCCESS] Health check passed - authentication and connectivity verified",
          );
          return true;
        }

        logger.info("[WARNING] Health check passed with limited functionality");
        return true;
      } else {
        logger.info(`[ERROR] ${test.name} failed`);
      }
    } catch (error) {
      logger.info(
        `[ERROR] ${test.name} failed with error:`,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  logger.info("[ERROR] All health check methods failed");
  return false;
}

export async function debugConnection(
  ctx: ApiContext,
  endpoint: string = "/news",
): Promise<string> {
  const debugReport: string[] = [];

  debugReport.push("[INFO] N Lobby Connection Debug Report");
  debugReport.push("=".repeat(50));
  debugReport.push("");

  debugReport.push("[STATUS] Authentication Status:");
  debugReport.push(ctx.getCookieStatus());
  debugReport.push("");

  debugReport.push(`[NETWORK] Testing Basic Connectivity to ${endpoint}:`);
  try {
    const startTime = Date.now();
    const response = await ctx.httpClient.get(endpoint, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": CONFIG.userAgent,
      },
      withCredentials: true,
      timeout: 10000,
    });
    const endTime = Date.now();

    debugReport.push(`[SUCCESS] Response received (${endTime - startTime}ms)`);
    debugReport.push(
      `[STATUS] Status: ${response.status} ${response.statusText}`,
    );
    debugReport.push(
      `[SIZE] Content Length: ${response.data?.length || "unknown"}`,
    );

    if (typeof response.data === "string") {
      const data = response.data.toLowerCase();
      debugReport.push("");
      debugReport.push("[INFO] Content Analysis:");

      if (
        data.includes("ログイン") ||
        data.includes("login") ||
        data.includes("sign-in")
      ) {
        debugReport.push(
          "[WARNING] Contains login keywords - may need authentication",
        );
      }

      if (data.includes("unauthorized") || data.includes("access denied")) {
        debugReport.push("[BLOCKED] Access denied detected");
      }

      if (
        data.includes("news") ||
        data.includes("announcement") ||
        data.includes("お知らせ")
      ) {
        debugReport.push("[SUCCESS] Contains news/announcement content");
      }
    }
  } catch (error) {
    debugReport.push("[ERROR] Basic connectivity failed");
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as AxiosError;
      debugReport.push(
        `[STATUS] Error Status: ${axiosError.response?.status || "unknown"}`,
      );
    } else {
      debugReport.push(
        `[DATA] Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  debugReport.push("");
  debugReport.push("[NETWORK] Network Information:");
  debugReport.push(`[URL] Base URL: ${ctx.httpClient.defaults.baseURL}`);
  debugReport.push(`[TIMEOUT] Timeout: ${ctx.httpClient.defaults.timeout}ms`);

  debugReport.push("");
  debugReport.push("=".repeat(50));
  debugReport.push("[TARGET] Recommendations:");

  const hasHttpCookies = !!ctx.httpClient.defaults.headers.Cookie;
  const hasNextAuthCookies = ctx.nextAuth.isAuthenticated();

  if (!hasHttpCookies && !hasNextAuthCookies) {
    debugReport.push("1. Run interactive_login to authenticate");
  } else if (hasHttpCookies && hasNextAuthCookies) {
    debugReport.push("1. Authentication looks good - issue may be server-side");
    debugReport.push("2. Try different endpoints or wait and retry");
  }

  return debugReport.join("\n");
}

export async function testPageContent(
  ctx: ApiContext,
  endpoint: string = "/news",
  maxLength: number = 1000,
): Promise<string> {
  try {
    logger.info(`[INFO] Testing page content for ${endpoint}...`);

    const response = await ctx.httpClient.get(endpoint, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        "User-Agent": CONFIG.userAgent,
      },
      withCredentials: true,
      timeout: 10000,
    });

    if (typeof response.data === "string") {
      const content = response.data;
      const sample = content.substring(0, maxLength);

      const analysis = [];
      analysis.push(`Status: ${response.status} ${response.statusText}`);
      analysis.push(`Content Length: ${content.length} characters`);
      analysis.push(
        `Content Type: ${response.headers["content-type"] || "unknown"}`,
      );
      analysis.push("");

      const lowerContent = content.toLowerCase();
      if (lowerContent.includes("ログイン") || lowerContent.includes("login")) {
        analysis.push(
          "[WARNING] Page contains login keywords - may not be authenticated",
        );
      } else if (
        lowerContent.includes("news") ||
        lowerContent.includes("お知らせ")
      ) {
        analysis.push("[SUCCESS] Page appears to contain news content");
      }

      analysis.push("");
      analysis.push("[DATA] Content Sample:");
      analysis.push("-".repeat(50));

      const result = analysis.join("\n") + "\n" + sample;

      if (content.length > maxLength) {
        return (
          result + `\n\n... (${content.length - maxLength} more characters)`
        );
      }

      return result;
    } else {
      return `Non-string response received: ${typeof response.data}`;
    }
  } catch (error) {
    logger.error(`[ERROR] Failed to test page content for ${endpoint}:`, error);

    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as AxiosError;
      return `Error ${axiosError.response?.status || "unknown"}: ${axiosError.message || "Unknown error"}`;
    }

    return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function testTrpcEndpoint(
  ctx: ApiContext,
  method: string,
  params?: unknown,
): Promise<unknown> {
  try {
    logger.info(`[INFO] Testing tRPC endpoint: ${method}`);

    const result = await ctx.trpcClient.call(method, params);

    logger.info(`[SUCCESS] tRPC endpoint ${method} succeeded`);

    return {
      success: true,
      method,
      params,
      result,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`[ERROR] tRPC endpoint ${method} failed:`, error);

    const errorInfo: Record<string, unknown> = {
      success: false,
      method,
      params,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };

    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as AxiosError;
      errorInfo.status = axiosError.response?.status;
      errorInfo.statusText = axiosError.response?.statusText;
      errorInfo.responseData = axiosError.response?.data;
    }

    return errorInfo;
  }
}
