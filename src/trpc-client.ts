import { HttpClient, HttpClientError } from "./http-client.js";
import { CONFIG } from "./config.js";
import { NextAuthHandler } from "./auth/nextauth.js";
import { logger } from "./logger.js";

export interface TRPCRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface TRPCResponse<T = unknown> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type TRPCBatchRequest = Array<TRPCRequest>;
export type TRPCBatchResponse = Array<TRPCResponse>;
export interface TRPCCallOptions {
  postOnly?: boolean;
}

export class TRPCClient {
  private httpClient: HttpClient;
  private nextAuth: NextAuthHandler;
  private requestId: number = 1;
  private allCookies: string = "";

  constructor(nextAuth: NextAuthHandler) {
    this.nextAuth = nextAuth;
    this.httpClient = new HttpClient({
      baseURL: `${CONFIG.nlobby.baseUrl}/api/trpc`,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": CONFIG.userAgent,
        Accept: "application/json",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  setAllCookies(cookies: string): void {
    if (!cookies || cookies.trim() === "") {
      logger.warn("[WARNING] Empty cookies provided to tRPC client");
      this.allCookies = "";
      return;
    }

    this.allCookies = cookies;
    logger.info("[SUCCESS] tRPC client cookies updated");
    logger.info(`[SIZE] tRPC cookie string length: ${cookies.length}`);

    // Verify cookies are properly set
    if (this.allCookies === cookies) {
      logger.info("[SUCCESS] tRPC cookie verification successful");
    } else {
      logger.error("[ERROR] tRPC cookie verification failed");
    }
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use((config) => {
      // Priority: Use all cookies if available, otherwise fall back to NextAuth cookies
      let cookieHeader: string | undefined;

      if (this.allCookies && this.allCookies.trim() !== "") {
        cookieHeader = this.allCookies;
        logger.debug("[COOKIE] Using all cookies for tRPC request");
      } else {
        // Fallback to NextAuth.js cookies only
        const nextAuthCookieHeader = this.nextAuth.getCookieHeader();
        if (nextAuthCookieHeader && nextAuthCookieHeader.trim() !== "") {
          cookieHeader = nextAuthCookieHeader;
          logger.debug("[COOKIE] Using NextAuth cookies for tRPC request");
        } else {
          logger.warn("[WARNING] No cookies available for tRPC request");
        }
      }

      // Set cookie header if we have cookies
      if (cookieHeader) {
        config.headers["Cookie"] = cookieHeader;
      }

      // Add Authorization header with NextAuth session token
      const sessionToken = this.nextAuth.getSessionToken();
      if (sessionToken) {
        config.headers["Authorization"] = `Bearer ${sessionToken}`;
        logger.debug("Added Authorization header with session token");
      } else {
        logger.warn(
          "[WARNING] No session token available for Authorization header",
        );
      }

      // Add CSRF token to headers if available
      const csrfToken = this.nextAuth.getCookies().csrfToken;
      if (csrfToken) {
        config.headers["X-CSRF-Token"] = csrfToken;
        logger.debug("Added CSRF token to tRPC request");
      }

      // Log request details for debugging
      logger.debug("[REQUEST] tRPC request details:", {
        url: config.url,
        method: config.method?.toUpperCase(),
        hasCookies: !!cookieHeader,
        hasCSRF: !!csrfToken,
        hasAuth: !!sessionToken,
        cookieSource: this.allCookies ? "allCookies" : "nextAuth",
      });

      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug("[SUCCESS] tRPC response received:", {
          status: response.status,
          statusText: response.statusText,
          hasData: !!response.data,
        });
        return response;
      },
      async (error): Promise<never> => {
        const err = error instanceof HttpClientError ? error : null;
        logger.error("[ERROR] tRPC request failed:", {
          status: err?.response?.status,
          statusText: err?.response?.statusText,
          message: error instanceof Error ? error.message : "Unknown error",
          url: err?.config?.url,
        });

        if (err?.response?.status === 401) {
          logger.error(
            "[BLOCKED] Authentication failed - NextAuth session may be expired",
          );
          throw new Error(
            "Authentication expired. Please re-authenticate with NextAuth cookies.",
          );
        } else if (err?.response?.status === 403) {
          logger.error("[BLOCKED] Access forbidden - insufficient permissions");
          throw new Error(
            "Access forbidden. Check your permissions or re-authenticate.",
          );
        } else if (err?.response?.status === 404) {
          logger.error("[BLOCKED] tRPC endpoint not found");
          throw new Error("tRPC endpoint not found. The API may have changed.");
        }

        return Promise.reject(error) as never;
      },
    );
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  async call<T = unknown>(
    method: string,
    params?: unknown,
    options: TRPCCallOptions = {},
  ): Promise<T> {
    try {
      logger.info(
        `[REQUEST] tRPC call: ${method}`,
        params ? `with params: ${JSON.stringify(params)}` : "without params",
      );

      // Log request headers for debugging
      const cookieHeader = this.allCookies || this.nextAuth.getCookieHeader();
      logger.debug(
        `[COOKIE] Request cookies: ${cookieHeader ? "present" : "missing"}`,
      );

      const doPost = async (): Promise<T> => {
        // Try POST approach (tRPC body input)
        const postUrl = `/${method}`;
        logger.debug(`[URL] tRPC POST URL: ${postUrl}`);
        const postBody = params === undefined ? undefined : params;

        const postResponse = await this.httpClient.post<TRPCResponse<T>>(
          postUrl,
          postBody,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        logger.debug(
          `[SUCCESS] tRPC ${method} POST response status: ${postResponse.status}`,
        );

        if (postResponse.data.error) {
          logger.error(
            `[ERROR] tRPC ${method} POST returned error:`,
            postResponse.data.error,
          );
          throw new Error(
            `tRPC Error [${postResponse.data.error.code}]: ${postResponse.data.error.message}`,
          );
        }

        logger.debug(`[SUCCESS] tRPC ${method} POST succeeded`);
        return postResponse.data.result as T;
      };

      if (options.postOnly) {
        logger.debug("POST-only mode enabled; skipping GET approach");
        return await doPost();
      }

      // Try GET approach first (query-based tRPC)
      logger.debug("Trying GET approach...");
      try {
        const url = this.buildTRPCUrl(method, params);
        logger.debug(`[URL] tRPC GET URL: ${url}`);

        const getResponse = await this.httpClient.get<TRPCResponse<T>>(url);
        logger.debug(
          `[SUCCESS] tRPC ${method} GET response status: ${getResponse.status}`,
        );

        if (getResponse.data.error) {
          logger.error(
            `[ERROR] tRPC ${method} GET returned error:`,
            getResponse.data.error,
          );
          throw new Error(
            `tRPC Error [${getResponse.data.error.code}]: ${getResponse.data.error.message}`,
          );
        }

        logger.debug(`[SUCCESS] tRPC ${method} GET succeeded`);
        return getResponse.data.result as T;
      } catch (getError) {
        logger.debug(`[WARNING] GET approach failed, trying POST approach...`);
        logger.debug(
          `[DEBUG] GET error details:`,
          getError instanceof Error ? getError.message : "Unknown error",
        );
        return await doPost();
      }
    } catch (error) {
      logger.error(`[ERROR] tRPC call failed for ${method}:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Enhanced error logging
      if (error instanceof HttpClientError) {
        logger.error(`[DEBUG] tRPC ${method} fetch error details:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          headers: error.response?.headers,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout,
          cookies: error.config?.headers?.Cookie ? "present" : "missing",
        });

        // Check for specific error types
        if (error.response?.status === 401) {
          logger.error(
            "[BLOCKED] tRPC 401 Unauthorized - session may be expired or invalid",
          );
        } else if (error.response?.status === 403) {
          logger.error(
            "[BLOCKED] tRPC 403 Forbidden - insufficient permissions",
          );
        } else if (error.response?.status === 404) {
          logger.error("[BLOCKED] tRPC 404 Not Found - endpoint may not exist");
        } else if (error.response?.status && error.response.status >= 500) {
          logger.error("[BLOCKED] tRPC Server Error - N Lobby backend issue");
        }

        if (error.code === "ECONNREFUSED") {
          logger.error(
            "[NETWORK] Network Error: Connection refused - N Lobby may be down",
          );
        } else if (error.code === "ETIMEDOUT") {
          logger.error(
            "[TIMEOUT] Network Error: Request timeout - slow network or server overload",
          );
        } else if (error.code === "ENOTFOUND") {
          logger.error(
            "[NETWORK] Network Error: DNS lookup failed - check internet connection",
          );
        }
      }

      throw error;
    }
  }

  private buildTRPCUrl(method: string, params?: unknown): string {
    // tRPC URL format: /api/trpc/method.name?input={"param":"value"}
    // The baseURL already includes /api/trpc, so we just need the method name
    const methodUrl = method;

    if (params === undefined) {
      return `/${methodUrl}`;
    }

    const input = JSON.stringify(params);
    const queryString = new URLSearchParams({
      input: input,
    }).toString();

    return `/${methodUrl}?${queryString}`;
  }

  // Specific methods for N Lobby API endpoints
  async getUnreadNewsCount(): Promise<number> {
    return this.call<number>("news.getUnreadNewsCount");
  }

  async getNotificationMessages(): Promise<unknown[]> {
    return this.call<unknown[]>("notification.getMessages");
  }

  async updateLastAccess(): Promise<void> {
    return this.call<void>("user.updateLastAccess", undefined, {
      postOnly: true,
    });
  }

  async findMainNavigations(): Promise<unknown[]> {
    return this.call<unknown[]>("menu.findMainNavigations", {});
  }

  async readInterestsWithIcon(): Promise<unknown[]> {
    return this.call<unknown[]>("interest.readInterestsWithIcon");
  }

  async readInterests(): Promise<unknown[]> {
    return this.call<unknown[]>("interest.readInterests");
  }

  async readWeights(): Promise<unknown[]> {
    return this.call<unknown[]>("interest.readWeights");
  }

  async getLobbyCalendarEvents(from: string, to: string): Promise<unknown[]> {
    return this.call<unknown[]>("calendar.getLobbyCalendarEvents", {
      from,
      to,
    });
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    logger.info("Running tRPC health check...");

    // Try multiple endpoints to verify connection
    const healthCheckMethods = [
      { name: "updateLastAccess", method: () => this.updateLastAccess() },
      { name: "getUnreadNewsCount", method: () => this.getUnreadNewsCount() },
      { name: "findMainNavigations", method: () => this.findMainNavigations() },
    ];

    for (const { name, method } of healthCheckMethods) {
      try {
        logger.debug(`Trying tRPC method: ${name}`);
        await method();
        logger.info(`[SUCCESS] tRPC health check passed with method: ${name}`);
        return true;
      } catch (error) {
        logger.debug(
          `[ERROR] tRPC method ${name} failed:`,
          error instanceof Error ? error.message : "Unknown error",
        );
        continue;
      }
    }

    logger.error("[ERROR] All tRPC health check methods failed");
    return false;
  }
}
