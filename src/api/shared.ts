import type { ApiContext } from "./context.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type { AxiosError } from "../types.js";

export async function fetchRenderedHtml(
  ctx: ApiContext,
  url: string,
): Promise<string> {
  try {
    logger.info("[NETWORK] Fetching HTML using HTTP client (proven method)...");
    logger.debug(`[URL] URL: ${CONFIG.nlobby.baseUrl + url}`);
    logger.info(
      "[COOKIE] Cookies:",
      ctx.httpClient.defaults.headers.Cookie ? "present" : "missing",
    );

    const response = await ctx.httpClient.get(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
        "User-Agent": CONFIG.userAgent,
      },
      withCredentials: true,
    });

    logger.info(
      `[SUCCESS] HTTP response: ${response.status} ${response.statusText}`,
    );
    logger.info(`[DATA] Content length: ${response.data?.length || "unknown"}`);
    logger.info(
      `[DATA] Content type: ${response.headers["content-type"] || "unknown"}`,
    );

    if (typeof response.data === "string") {
      const html = response.data;

      const lowerContent = html.toLowerCase();
      if (lowerContent.includes("ログイン") || lowerContent.includes("login")) {
        logger.warn(
          "[WARNING] WARNING: Page contains login keywords - authentication may have failed",
        );
      } else if (
        lowerContent.includes("news") ||
        lowerContent.includes("お知らせ")
      ) {
        logger.info("[SUCCESS] Page appears to contain news content");
      }

      if (
        lowerContent.includes("unauthorized") ||
        lowerContent.includes("access denied")
      ) {
        throw new Error("Access denied - authentication failed");
      }

      logger.info(
        `[TARGET] HTML retrieved successfully: ${html.length} characters`,
      );
      return html;
    } else {
      throw new Error(`Non-string response received: ${typeof response.data}`);
    }
  } catch (error) {
    logger.error(
      "[ERROR] HTTP fetch error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as AxiosError;
      logger.debug("[DEBUG] HTTP Error Details:", {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        url: axiosError.config?.url,
        hasData: Boolean(axiosError.response?.data),
      });
    }

    throw error;
  }
}
