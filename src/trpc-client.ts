import axios, { AxiosInstance } from "axios";
import { CONFIG } from "./config.js";
import { NextAuthHandler } from "./nextauth.js";

export interface TRPCRequest {
  id: number;
  method: string;
  params?: any;
}

export interface TRPCResponse<T = any> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface TRPCBatchRequest extends Array<TRPCRequest> {}
export interface TRPCBatchResponse extends Array<TRPCResponse> {}

export class TRPCClient {
  private httpClient: AxiosInstance;
  private nextAuth: NextAuthHandler;
  private requestId: number = 1;
  private allCookies: string = "";

  constructor(nextAuth: NextAuthHandler) {
    this.nextAuth = nextAuth;
    this.httpClient = axios.create({
      baseURL: `${CONFIG.nlobby.baseUrl}/api/trpc`,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "NLobby-MCP-Server/1.0.0",
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
      console.warn("[WARNING] Empty cookies provided to tRPC client");
      this.allCookies = "";
      return;
    }

    this.allCookies = cookies;
    console.log("[SUCCESS] tRPC client cookies updated");
    console.log(`[SIZE] tRPC cookie string length: ${cookies.length}`);

    // Verify cookies are properly set
    if (this.allCookies === cookies) {
      console.log("[SUCCESS] tRPC cookie verification successful");
    } else {
      console.error("[ERROR] tRPC cookie verification failed");
    }
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use((config) => {
      // Priority: Use all cookies if available, otherwise fall back to NextAuth cookies
      let cookieHeader: string | undefined;

      if (this.allCookies && this.allCookies.trim() !== "") {
        cookieHeader = this.allCookies;
        console.log("[COOKIE] Using all cookies for tRPC request");
      } else {
        // Fallback to NextAuth.js cookies only
        const nextAuthCookieHeader = this.nextAuth.getCookieHeader();
        if (nextAuthCookieHeader && nextAuthCookieHeader.trim() !== "") {
          cookieHeader = nextAuthCookieHeader;
          console.log("[COOKIE] Using NextAuth cookies for tRPC request");
        } else {
          console.warn("[WARNING] No cookies available for tRPC request");
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
        console.log("Added Authorization header with session token");
      } else {
        console.warn(
          "[WARNING] No session token available for Authorization header",
        );
      }

      // Add CSRF token to headers if available
      const csrfToken = this.nextAuth.getCookies().csrfToken;
      if (csrfToken) {
        config.headers["X-CSRF-Token"] = csrfToken;
        console.log("Added CSRF token to tRPC request");
      }

      // Log request details for debugging
      console.log("[REQUEST] tRPC request details:", {
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
        console.log("[SUCCESS] tRPC response received:", {
          status: response.status,
          statusText: response.statusText,
          hasData: !!response.data,
        });
        return response;
      },
      async (error) => {
        console.error("[ERROR] tRPC request failed:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          url: error.config?.url,
        });

        if (error.response?.status === 401) {
          console.error(
            "[BLOCKED] Authentication failed - NextAuth session may be expired",
          );
          throw new Error(
            "Authentication expired. Please re-authenticate with NextAuth cookies.",
          );
        } else if (error.response?.status === 403) {
          console.error(
            "[BLOCKED] Access forbidden - insufficient permissions",
          );
          throw new Error(
            "Access forbidden. Check your permissions or re-authenticate.",
          );
        } else if (error.response?.status === 404) {
          console.error("[BLOCKED] tRPC endpoint not found");
          throw new Error("tRPC endpoint not found. The API may have changed.");
        }

        return Promise.reject(error);
      },
    );
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  async call<T = any>(method: string, params?: any): Promise<T> {
    const request: TRPCRequest = {
      id: this.getNextRequestId(),
      method,
      params,
    };

    try {
      console.log(
        `[REQUEST] tRPC call: ${method}`,
        params ? `with params: ${JSON.stringify(params)}` : "without params",
      );

      // Log request headers for debugging
      const cookieHeader = this.allCookies || this.nextAuth.getCookieHeader();
      console.log(
        `[COOKIE] Request cookies: ${cookieHeader ? "present" : "missing"}`,
      );

      // Try GET approach first (query-based tRPC)
      console.log("🔄 Trying GET approach...");
      try {
        const url = this.buildTRPCUrl(method, params);
        console.log(`[URL] tRPC GET URL: ${url}`);

        const getResponse = await this.httpClient.get<TRPCResponse<T>>(url);
        console.log(
          `[SUCCESS] tRPC ${method} GET response status: ${getResponse.status}`,
        );

        if (getResponse.data.error) {
          console.error(
            `[ERROR] tRPC ${method} GET returned error:`,
            getResponse.data.error,
          );
          throw new Error(
            `tRPC Error [${getResponse.data.error.code}]: ${getResponse.data.error.message}`,
          );
        }

        console.log(`[SUCCESS] tRPC ${method} GET succeeded`);
        return getResponse.data.result as T;
      } catch (getError) {
        console.log(`[WARNING] GET approach failed, trying POST approach...`);
        console.log(
          `[DEBUG] GET error details:`,
          getError instanceof Error ? getError.message : "Unknown error",
        );

        // Try POST approach (JSON-RPC style)
        const postUrl = method;
        console.log(`[URL] tRPC POST URL: ${postUrl}`);

        const postResponse = await this.httpClient.post<TRPCResponse<T>>(
          postUrl,
          request,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        console.log(
          `[SUCCESS] tRPC ${method} POST response status: ${postResponse.status}`,
        );

        if (postResponse.data.error) {
          console.error(
            `[ERROR] tRPC ${method} POST returned error:`,
            postResponse.data.error,
          );
          throw new Error(
            `tRPC Error [${postResponse.data.error.code}]: ${postResponse.data.error.message}`,
          );
        }

        console.log(`[SUCCESS] tRPC ${method} POST succeeded`);
        return postResponse.data.result as T;
      }
    } catch (error) {
      console.error(`[ERROR] tRPC call failed for ${method}:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Enhanced axios error logging
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        console.error(`[DEBUG] tRPC ${method} Axios error details:`, {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          headers: axiosError.response?.headers,
          data: axiosError.response?.data,
          url: axiosError.config?.url,
          method: axiosError.config?.method,
          timeout: axiosError.config?.timeout,
          cookies: axiosError.config?.headers?.Cookie ? "present" : "missing",
        });

        // Check for specific error types
        if (axiosError.response?.status === 401) {
          console.error(
            "[BLOCKED] tRPC 401 Unauthorized - session may be expired or invalid",
          );
        } else if (axiosError.response?.status === 403) {
          console.error(
            "[BLOCKED] tRPC 403 Forbidden - insufficient permissions",
          );
        } else if (axiosError.response?.status === 404) {
          console.error(
            "[BLOCKED] tRPC 404 Not Found - endpoint may not exist",
          );
        } else if (axiosError.response?.status >= 500) {
          console.error("[BLOCKED] tRPC Server Error - N Lobby backend issue");
        }
      } else if (error && typeof error === "object" && "code" in error) {
        const networkError = error as any;
        if (networkError.code === "ECONNREFUSED") {
          console.error(
            "[NETWORK] Network Error: Connection refused - N Lobby may be down",
          );
        } else if (networkError.code === "ETIMEDOUT") {
          console.error(
            "[TIMEOUT] Network Error: Request timeout - slow network or server overload",
          );
        } else if (networkError.code === "ENOTFOUND") {
          console.error(
            "[NETWORK] Network Error: DNS lookup failed - check internet connection",
          );
        }
      }

      throw error;
    }
  }

  private buildTRPCUrl(method: string, params?: any): string {
    // tRPC URL format: /api/trpc/method.name?input={"param":"value"}
    // The baseURL already includes /api/trpc, so we just need the method name
    const methodUrl = method;

    // Always include input parameter, even if empty
    const input = params ? JSON.stringify(params) : JSON.stringify({});
    const queryString = new URLSearchParams({
      input: input,
    }).toString();

    return `${methodUrl}?${queryString}`;
  }

  // Specific methods for N Lobby API endpoints
  async getUnreadNewsCount(): Promise<number> {
    return this.call<number>("news.getUnreadNewsCount");
  }

  async getNotificationMessages(): Promise<any[]> {
    return this.call<any[]>("notification.getMessages");
  }

  async updateLastAccess(): Promise<void> {
    return this.call<void>("user.updateLastAccess");
  }

  async findMainNavigations(): Promise<any[]> {
    return this.call<any[]>("menu.findMainNavigations", {});
  }

  async readInterestsWithIcon(): Promise<any[]> {
    return this.call<any[]>("interest.readInterestsWithIcon");
  }

  async readInterests(): Promise<any[]> {
    return this.call<any[]>("interest.readInterests");
  }

  async readWeights(): Promise<any[]> {
    return this.call<any[]>("interest.readWeights");
  }

  async getLobbyCalendarEvents(from: string, to: string): Promise<any[]> {
    return this.call<any[]>("calendar.getLobbyCalendarEvents", {
      from,
      to,
    });
  }

  // Additional methods for news and announcements
  async getNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.find", params);
  }

  async getNewsList(params?: any): Promise<any[]> {
    return this.call<any[]>("news.findMany", params);
  }

  async getNewsDetail(id: string): Promise<any> {
    return this.call<any>("news.findUnique", { where: { id } });
  }

  // New methods based on working endpoints
  async getNewsAll(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getAll", params);
  }

  async getNewsList2(params?: any): Promise<any[]> {
    return this.call<any[]>("news.list", params);
  }

  async queryNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.query", params);
  }

  async getRecentNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getRecent", params);
  }

  async getPublishedNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getPublished", params);
  }

  async getActiveNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getActive", params);
  }

  async getNewsWithPagination(params?: any): Promise<any[]> {
    return this.call<any[]>(
      "news.findWithPagination",
      params || { take: 20, skip: 0 },
    );
  }

  // Additional endpoints based on working news.getUnreadNewsCount pattern
  async getNewsListData(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getListData", params);
  }

  async getNewsItems(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getItems", params);
  }

  async getNewsContent(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getContent", params);
  }

  async browseNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.browse", params);
  }

  async searchNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.search", params);
  }

  async getNewsFeed(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getFeed", params);
  }

  async getNewsPage(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getPage", params);
  }

  async getNewsData(params?: any): Promise<any[]> {
    return this.call<any[]>("news.getData", params);
  }

  // Try with common database-style methods
  async findAllNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.findAll", params);
  }

  async selectNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.select", params);
  }

  async listNews(params?: any): Promise<any[]> {
    return this.call<any[]>("news.list", params);
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    console.log("Running tRPC health check...");

    // Try multiple endpoints to verify connection
    const healthCheckMethods = [
      { name: "updateLastAccess", method: () => this.updateLastAccess() },
      { name: "getUnreadNewsCount", method: () => this.getUnreadNewsCount() },
      { name: "findMainNavigations", method: () => this.findMainNavigations() },
    ];

    for (const { name, method } of healthCheckMethods) {
      try {
        console.log(`Trying tRPC method: ${name}`);
        await method();
        console.log(`[SUCCESS] tRPC health check passed with method: ${name}`);
        return true;
      } catch (error) {
        console.log(
          `[ERROR] tRPC method ${name} failed:`,
          error instanceof Error ? error.message : "Unknown error",
        );
        continue;
      }
    }

    console.error("[ERROR] All tRPC health check methods failed");
    return false;
  }
}
