import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { BrowserAuth } from "./browser-auth.js";
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { NextAuthHandler } from "./nextauth.js";
import { TRPCClient } from "./trpc-client.js";
import { CredentialManager } from "./credential-manager.js";
import {
  NLobbySession,
  NLobbyApiResponse,
  NLobbyAnnouncement,
  NLobbyNewsDetail,
  NLobbyScheduleItem,
  NLobbyLearningResource,
  NLobbyRequiredCourse,
  EducationData,
  CourseReport,
  CourseReportDetail,
  CalendarType,
  GoogleCalendarEvent,
  GoogleCalendarResponse,
  CalendarDateRange,
} from "./types.js";

export class NLobbyApi {
  private httpClient: AxiosInstance;
  private session: NLobbySession | null = null;
  private nextAuth: NextAuthHandler;
  private trpcClient: TRPCClient;
  private browserAuth: BrowserAuth;
  private credentialManager: CredentialManager;

  constructor() {
    this.nextAuth = new NextAuthHandler();
    this.trpcClient = new TRPCClient(this.nextAuth);
    this.browserAuth = new BrowserAuth();
    this.credentialManager = new CredentialManager();

    this.httpClient = axios.create({
      baseURL: CONFIG.nlobby.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": CONFIG.userAgent,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use((config) => {
      if (this.session) {
        config.headers["Authorization"] = `Bearer ${this.session.accessToken}`;
      }
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.session) {
          throw new Error("Authentication expired. Please re-authenticate.");
        }
        return Promise.reject(error);
      },
    );
  }

  setSession(session: NLobbySession): void {
    this.session = session;
  }

  async getNews(): Promise<NLobbyAnnouncement[]> {
    logger.info("[INFO] Starting getNews with HTTP client...");
    logger.info(
      "[STATUS] Current authentication status:",
      this.getCookieStatus(),
    );

    try {
      logger.info(
        "[INFO] Fetching news via HTTP client (same method as test_page_content)...",
      );

      const html = await this.fetchRenderedHtml("/news");
      const news = this.parseNewsFromHtml(html);

      if (news && news.length > 0) {
        logger.info(`[SUCCESS] Retrieved ${news.length} news items from HTML`);
        return news;
      } else {
        logger.info("[WARNING] HTML scraping returned no data");

        // Provide more detailed debugging information
        const debugInfo = `HTML scraping returned no data. Debug info:
- Authentication status: ${this.nextAuth.isAuthenticated() ? "authenticated" : "not authenticated"}
- HTTP cookies: ${this.httpClient.defaults.headers.Cookie ? "present" : "missing"}
- HTML length: ${html.length} characters
- Contains data grid: ${html.includes('role="row"')}
- Contains Next.js data: ${html.includes("__NEXT_DATA__")}
- Contains self.__next_f.push: ${html.includes("self.__next_f.push")}

Troubleshooting steps:
1. Run 'health_check' to verify connection
2. Run 'test_page_content /news' to check page content
3. Ensure you are properly authenticated using 'set_cookies'
4. Check if the site structure has changed`;

        throw new Error(debugInfo);
      }
    } catch (error) {
      logger.error("[ERROR] getNews failed:", error);

      if (error instanceof Error) {
        throw error; // Re-throw our detailed error
      }

      throw new Error(
        `Failed to fetch news with HTTP client: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getNewsDetail(newsId: string): Promise<NLobbyNewsDetail> {
    logger.info(`[INFO] Fetching news detail for ID: ${newsId}`);
    logger.info(
      "[STATUS] Current authentication status:",
      this.getCookieStatus(),
    );

    try {
      const newsUrl = `/news/${newsId}`;
      logger.info(`[INFO] Fetching news detail from: ${newsUrl}`);

      const html = await this.fetchRenderedHtml(newsUrl);
      logger.info(
        `[SUCCESS] Retrieved HTML for news ${newsId}: ${html.length} characters`,
      );

      const newsDetail = this.parseNewsDetailFromHtml(html, newsId);

      if (newsDetail) {
        logger.info(`[SUCCESS] Parsed news detail: ${newsDetail.title}`);
        return newsDetail;
      } else {
        throw new Error(
          `Failed to parse news detail from HTML for news ID: ${newsId}`,
        );
      }
    } catch (error) {
      logger.error(`[ERROR] getNewsDetail failed for ID ${newsId}:`, error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(
        `Failed to fetch news detail for ID ${newsId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private parseNewsDetailFromHtml(
    html: string,
    newsId: string,
  ): NLobbyNewsDetail | null {
    try {
      logger.info("[INFO] Starting news detail HTML parsing...");
      logger.debug(`[DATA] HTML length: ${html.length} characters`);

      // Extract data from Next.js self.__next_f.push() calls
      logger.info(
        "[STEP1] Extracting data from Next.js self.__next_f.push() calls...",
      );
      const nextFPushMatches = html.match(/self\.__next_f\.push\((\[.*?\])\)/g);

      if (!nextFPushMatches || nextFPushMatches.length === 0) {
        logger.info("[ERROR] No self.__next_f.push() calls found in HTML");
        return null;
      }

      logger.info(
        `[SUCCESS] Found ${nextFPushMatches.length} self.__next_f.push() calls`,
      );

      let newsData: any = null;
      let contentData: string = "";
      const contentReferences: Map<string, string> = new Map();

      // Parse all push calls to find news data and content references
      for (let i = 0; i < nextFPushMatches.length; i++) {
        const pushCall = nextFPushMatches[i];
        try {
          const jsonMatch = pushCall.match(/self\.__next_f\.push\((\[.*?\])\)/);
          if (!jsonMatch) continue;

          const pushData = JSON.parse(jsonMatch[1]);

          // Check for content references (e.g., "29:T738,")
          if (
            pushData.length >= 2 &&
            typeof pushData[1] === "string" &&
            pushData[1].match(/^\d+:T\d+,?$/)
          ) {
            const refKey = pushData[1].replace(/,$/, "");
            logger.info(`[INFO] Found content reference: ${refKey}`);

            // Look for the actual content in the next push call
            if (i + 1 < nextFPushMatches.length) {
              const nextPushCall = nextFPushMatches[i + 1];
              const nextJsonMatch = nextPushCall.match(
                /self\.__next_f\.push\((\[.*?\])\)/,
              );
              if (nextJsonMatch) {
                const nextPushData = JSON.parse(nextJsonMatch[1]);
                if (
                  nextPushData.length >= 2 &&
                  typeof nextPushData[1] === "string"
                ) {
                  contentReferences.set(refKey, nextPushData[1]);
                  logger.info(
                    `[SUCCESS] Found content for reference ${refKey}: ${nextPushData[1].length} characters`,
                  );
                }
              }
            }
            continue;
          }

          // Look for news data in the push call
          if (pushData.length >= 2 && typeof pushData[1] === "string") {
            const stringData = pushData[1];

            // Check if string starts with number and colon (e.g., "6:...")
            const prefixMatch = stringData.match(/^(\d+):(.*)/);
            if (prefixMatch) {
              try {
                const actualJsonString = prefixMatch[2];
                const parsedContent = JSON.parse(actualJsonString);

                // Look for news object in the parsed content
                const foundNewsData =
                  this.searchForNewsDataInObject(parsedContent);
                if (foundNewsData) {
                  logger.info(
                    `[SUCCESS] Found news data in push call ${i + 1}`,
                  );
                  newsData = foundNewsData;
                }
              } catch {
                // Continue to next push call
              }
            }
          }
        } catch {
          // Continue to next push call
        }
      }

      if (!newsData) {
        logger.info("[ERROR] No news data found in any push call");
        return null;
      }

      // Extract content using references
      if (newsData.description) {
        // Look for content references in the description
        for (const [refKey, content] of contentReferences) {
          if (newsData.description.includes(refKey)) {
            contentData = content;
            logger.info(
              `[SUCCESS] Found content data using reference ${refKey}`,
            );
            break;
          }
        }
      }

      // If no content found via references, try to find it directly
      if (!contentData && contentReferences.size > 0) {
        // Use the first content reference as fallback
        contentData = Array.from(contentReferences.values())[0];
        logger.info("[INFO] Using first available content as fallback");
      }

      // Build the news detail object
      const newsDetail: NLobbyNewsDetail = {
        id: newsData.id || newsId,
        microCmsId: newsData.microCmsId,
        title: newsData.title || "No Title",
        content:
          this.decodeHtmlContent(contentData) || newsData.description || "",
        description: newsData.description,
        publishedAt: newsData.publishedAt
          ? new Date(newsData.publishedAt)
          : new Date(),
        menuName: newsData.menuName || [],
        isImportant: newsData.isImportant || false,
        isByMentor: newsData.isByMentor || false,
        attachments: newsData.attachments || [],
        relatedEvents: newsData.relatedEvents || [],
        targetUserQueryId: newsData.targetUserQueryId,
        url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
      };

      logger.info(
        `[TARGET] Successfully parsed news detail: ${newsDetail.title}`,
      );
      return newsDetail;
    } catch (error) {
      logger.error("[ERROR] Error parsing news detail from HTML:", error);
      return null;
    }
  }

  private searchForNewsDataInObject(obj: any, path: string = ""): any | null {
    if (!obj || typeof obj !== "object") return null;

    // Check if this object has news-like properties
    if (
      obj.id &&
      obj.title &&
      (obj.publishedAt || obj.description || obj.menuName)
    ) {
      logger.info(`[INFO] Found news object at path: ${path}`);
      return obj;
    }

    // Check for "news" property
    if (obj.news && typeof obj.news === "object") {
      logger.info(`[INFO] Found news property at path: ${path}.news`);
      return obj.news;
    }

    // Recursively search through object properties
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object") {
        const searchPath = path ? `${path}.${key}` : key;
        const found = this.searchForNewsDataInObject(value, searchPath);
        if (found) return found;
      }
    }

    return null;
  }

  private decodeHtmlContent(content: string): string {
    if (!content) return "";

    try {
      // The content might be HTML-encoded
      const decoded = content
        .replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">")
        .replace(/\\u0026/g, "&")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      return decoded;
    } catch (error) {
      logger.warn("[WARNING] Failed to decode HTML content:", error);
      return content;
    }
  }

  async getSchedule(
    calendarType: CalendarType = CalendarType.PERSONAL,
    dateRange?: CalendarDateRange,
  ): Promise<NLobbyScheduleItem[]> {
    try {
      logger.info(`[INFO] Fetching ${calendarType} calendar events...`);

      const events = await this.getGoogleCalendarEvents(
        calendarType,
        dateRange,
      );
      const convertedEvents =
        this.convertGoogleCalendarEventsToScheduleItems(events);

      logger.info(
        `[SUCCESS] Retrieved ${convertedEvents.length} schedule items`,
      );
      return convertedEvents;
    } catch (error) {
      logger.error("[ERROR] Error fetching schedule:", error);
      throw new Error(
        `Failed to fetch ${calendarType} calendar: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async getGoogleCalendarEvents(
    calendarType: CalendarType = CalendarType.PERSONAL,
    dateRange?: CalendarDateRange,
  ): Promise<GoogleCalendarEvent[]> {
    try {
      logger.info(
        `[INFO] Fetching Google Calendar events for ${calendarType}...`,
      );

      // Default to current week if no date range provided
      const defaultRange = this.getDefaultDateRange();
      const range = dateRange || defaultRange;

      logger.info(
        `[INFO] Date range: ${range.from.toISOString()} to ${range.to.toISOString()}`,
      );

      // Determine endpoint based on calendar type
      const endpoint =
        calendarType === CalendarType.PERSONAL
          ? "/api/trpc/calendar.getGoogleCalendarEvents"
          : "/api/trpc/calendar.getLobbyCalendarEvents";

      logger.debug(`[URL] Using endpoint: ${endpoint}`);

      // Prepare query parameters
      const input = {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      };

      logger.debug(`[STATUS] Request input:`, input);
      logger.debug(`[COOKIE] Authentication status:`, this.getCookieStatus());

      const response = await this.httpClient.get<GoogleCalendarResponse>(
        endpoint,
        {
          params: { input: JSON.stringify(input) },
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );

      logger.info(
        `[SUCCESS] Calendar API response: ${response.status} ${response.statusText}`,
      );

      // Enhanced debugging for response structure
      logger.info("[INFO] Response data analysis:");
      logger.info(`  - Response type: ${typeof response.data}`);
      logger.info(
        `  - Response keys: ${response.data ? Object.keys(response.data) : "none"}`,
      );
      logger.info(
        `  - Has result: ${(response.data as any)?.result ? "yes" : "no"}`,
      );
      logger.info(
        `  - Has result.data: ${(response.data as any)?.result?.data ? "yes" : "no"}`,
      );
      logger.info(
        `  - Has result.data.gcal: ${(response.data as any)?.result?.data?.gcal ? "yes" : "no"}`,
      );
      logger.info(
        `  - Full response structure:`,
        JSON.stringify(response.data, null, 2),
      );

      // Check for different possible response formats
      let calendarEvents: GoogleCalendarEvent[] = [];
      const responseData = response.data as any;

      if (responseData?.result?.data?.gcal) {
        // Standard format (personal calendar)
        calendarEvents = responseData.result.data.gcal;
        logger.info(
          `[SUCCESS] Found events in standard gcal format: ${calendarEvents.length} events`,
        );
      } else if (responseData?.result?.data?.lcal) {
        // School calendar format (lobby calendar)
        calendarEvents = responseData.result.data.lcal;
        logger.info(
          `[SUCCESS] Found events in school lcal format: ${calendarEvents.length} events`,
        );
      } else if (
        responseData?.result?.data &&
        Array.isArray(responseData.result.data)
      ) {
        // Alternative format where data is directly an array
        calendarEvents = responseData.result.data;
        logger.info(
          `[SUCCESS] Found events in alternative format (direct array): ${calendarEvents.length} events`,
        );
      } else if (responseData?.data?.gcal) {
        // Another possible format
        calendarEvents = responseData.data.gcal;
        logger.info(
          `[SUCCESS] Found events in simplified format: ${calendarEvents.length} events`,
        );
      } else if (responseData?.data && Array.isArray(responseData.data)) {
        // Direct data array format
        calendarEvents = responseData.data;
        logger.info(
          `[SUCCESS] Found events in direct data array format: ${calendarEvents.length} events`,
        );
      } else if (responseData?.gcal) {
        // Direct gcal format
        calendarEvents = responseData.gcal;
        logger.info(
          `[SUCCESS] Found events in direct gcal format: ${calendarEvents.length} events`,
        );
      } else if (Array.isArray(responseData)) {
        // Response is directly an array
        calendarEvents = responseData;
        logger.info(
          `[SUCCESS] Found events in direct array format: ${calendarEvents.length} events`,
        );
      } else {
        logger.info("[WARNING] No calendar data found in any expected format");
        logger.info(
          "[DATA] Available response keys:",
          responseData ? Object.keys(responseData) : "none",
        );

        // Show sample of response data for debugging
        logger.info(
          "[DATA] Response sample:",
          JSON.stringify(responseData).substring(0, 300),
        );

        throw new Error(
          `Invalid calendar response format for ${calendarType} calendar.\n\n` +
            `Endpoint: ${endpoint}\n` +
            `Response type: ${typeof responseData}\n` +
            `Response keys: ${responseData ? Object.keys(responseData).join(", ") : "none"}\n` +
            `Expected format: { result: { data: { gcal: [...] } } }\n\n` +
            `Please check if the ${calendarType} calendar endpoint is correct and returns valid data.\n` +
            `Response preview: ${JSON.stringify(responseData).substring(0, 300)}...`,
        );
      }

      if (!Array.isArray(calendarEvents)) {
        throw new Error(
          `Calendar events is not an array: ${typeof calendarEvents}`,
        );
      }

      const events = calendarEvents;
      logger.info(`[TARGET] Retrieved ${events.length} calendar events`);

      // Log sample event for debugging
      if (events.length > 0) {
        const sampleEvent = events[0];
        logger.info(`[LOG] Sample event:`, {
          id: sampleEvent.id,
          summary: sampleEvent.summary,
          start: sampleEvent.start,
          end: sampleEvent.end,
        });
      }

      return events;
    } catch (error) {
      logger.error(`[ERROR] Error fetching Google Calendar events:`, error);

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        logger.debug("[DEBUG] Calendar API error details:", {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
        });

        if (axiosError.response?.status === 401) {
          throw new Error(
            "Authentication required. Please use the set_cookies tool to provide valid NextAuth.js session cookies from N Lobby.",
          );
        }
      }

      throw error;
    }
  }

  private getDefaultDateRange(): CalendarDateRange {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0); // Start of today

    const to = new Date(now);
    to.setDate(to.getDate() + 7); // One week from now
    to.setHours(23, 59, 59, 999); // End of the day

    return { from, to };
  }

  private convertGoogleCalendarEventsToScheduleItems(
    events: any[],
  ): NLobbyScheduleItem[] {
    return events.map((event) => {
      // Parse start and end times - handle both Google Calendar and School Calendar formats
      let startTime: Date;
      let endTime: Date;

      // Check for school calendar format first (startDateTime/endDateTime)
      if (event.startDateTime) {
        startTime = new Date(event.startDateTime);
        endTime = event.endDateTime
          ? new Date(event.endDateTime)
          : new Date(startTime.getTime() + 60 * 60 * 1000);
      }
      // Google Calendar format (start/end objects)
      else if (event.start) {
        if (event.start.dateTime) {
          startTime = new Date(event.start.dateTime);
        } else if (event.start.date) {
          startTime = new Date(event.start.date + "T00:00:00");
        } else {
          startTime = new Date();
        }

        if (event.end && event.end.dateTime) {
          endTime = new Date(event.end.dateTime);
        } else if (event.end && event.end.date) {
          // For all-day events, end date is exclusive, so we subtract 1 day and set to end of day
          endTime = new Date(event.end.date + "T23:59:59");
          endTime.setDate(endTime.getDate() - 1);
        } else {
          endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration
        }
      }
      // Fallback
      else {
        startTime = new Date();
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }

      // Determine event type based on content
      let type: "class" | "event" | "meeting" | "exam" = "event";
      const summary = event.summary?.toLowerCase() || "";

      if (summary.includes("授業") || summary.includes("class")) {
        type = "class";
      } else if (
        summary.includes("mtg") ||
        summary.includes("ミーティング") ||
        summary.includes("meeting") ||
        summary.includes("面談")
      ) {
        type = "meeting";
      } else if (
        summary.includes("試験") ||
        summary.includes("exam") ||
        summary.includes("テスト")
      ) {
        type = "exam";
      }

      // Extract participants from attendees (handle both formats)
      let participants: string[] = [];
      if (event.attendees && Array.isArray(event.attendees)) {
        participants = event.attendees
          .map((attendee: any) => attendee.email)
          .filter(Boolean);
      }

      const scheduleItem: NLobbyScheduleItem = {
        id: event.id || event.microCmsId || Math.random().toString(),
        title: event.summary || event.title || "No Title",
        description: event.description || "",
        startTime,
        endTime,
        location: event.location || "",
        type,
        participants,
      };

      return scheduleItem;
    });
  }

  // Helper methods for easier date range creation
  createDateRange(
    fromDate: string | Date,
    toDate: string | Date,
  ): CalendarDateRange {
    const from = typeof fromDate === "string" ? new Date(fromDate) : fromDate;
    const to = typeof toDate === "string" ? new Date(toDate) : toDate;

    // Validate dates
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new Error("Invalid date format provided");
    }

    // Calculate the difference in days
    const diffTime = to.getTime() - from.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays < 1) {
      throw new Error(
        'To date must be at least 1 day after from date. For single day queries, use period="today" or single from_date parameter.',
      );
    }

    return { from, to };
  }

  createSingleDayRange(date: string | Date): CalendarDateRange {
    const targetDate = typeof date === "string" ? new Date(date) : date;

    // Validate date
    if (isNaN(targetDate.getTime())) {
      throw new Error("Invalid date format provided");
    }

    // Create a single day range (start of day to end of day)
    const from = new Date(targetDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(targetDate);
    to.setHours(23, 59, 59, 999);

    return { from, to };
  }

  createWeekDateRange(startDate?: string | Date): CalendarDateRange {
    const start = startDate
      ? typeof startDate === "string"
        ? new Date(startDate)
        : startDate
      : new Date();

    // Set to start of the day
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6); // 7 days total
    end.setHours(23, 59, 59, 999);

    return { from: start, to: end };
  }

  createMonthDateRange(year?: number, month?: number): CalendarDateRange {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month !== undefined ? month : now.getMonth();

    const from = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    const to = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    return { from, to };
  }

  // Backward compatibility method
  async getScheduleByDate(date?: string): Promise<NLobbyScheduleItem[]> {
    logger.info(
      `Using backward compatibility method for date: ${date || "today"}`,
    );

    let dateRange: CalendarDateRange;

    if (date) {
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new Error(`Invalid date format: ${date}`);
      }

      // Create a single day range
      const from = new Date(targetDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(targetDate);
      to.setHours(23, 59, 59, 999);

      dateRange = { from, to };
    } else {
      // Default to current week
      dateRange = this.getDefaultDateRange();
    }

    return this.getSchedule(CalendarType.PERSONAL, dateRange);
  }

  async testCalendarEndpoints(dateRange?: CalendarDateRange): Promise<{
    personal: { success: boolean; count: number; error?: string };
    school: { success: boolean; count: number; error?: string };
  }> {
    logger.info("[TEST] Testing both calendar endpoints...");

    const range = dateRange || this.getDefaultDateRange();
    const results: {
      personal: { success: boolean; count: number; error?: string };
      school: { success: boolean; count: number; error?: string };
    } = {
      personal: { success: false, count: 0 },
      school: { success: false, count: 0 },
    };

    // Test personal calendar
    try {
      const personalEvents = await this.getGoogleCalendarEvents(
        CalendarType.PERSONAL,
        range,
      );
      results.personal.success = true;
      results.personal.count = personalEvents.length;
      logger.info(
        `[SUCCESS] Personal calendar: ${personalEvents.length} events`,
      );
    } catch (error) {
      results.personal.error =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[ERROR] Personal calendar failed:", results.personal.error);
    }

    // Test school calendar
    try {
      const schoolEvents = await this.getGoogleCalendarEvents(
        CalendarType.SCHOOL,
        range,
      );
      results.school.success = true;
      results.school.count = schoolEvents.length;
      logger.info(`[SUCCESS] School calendar: ${schoolEvents.length} events`);
    } catch (error) {
      results.school.error =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[ERROR] School calendar failed:", results.school.error);
    }

    logger.info("[TARGET] Calendar endpoint test summary:", results);
    return results;
  }

  async getLearningResources(
    subject?: string,
  ): Promise<NLobbyLearningResource[]> {
    try {
      const params = subject ? { subject } : {};
      const response = await this.httpClient.get<
        NLobbyApiResponse<NLobbyLearningResource[]>
      >("/api/learning-resources", { params });

      if (!response.data.success) {
        throw new Error(
          response.data.error || "Failed to fetch learning resources",
        );
      }

      return response.data.data || [];
    } catch (error) {
      logger.error("Error fetching learning resources:", error);
      throw new Error(
        "Authentication required. Please use the set_cookies tool to provide valid NextAuth.js session cookies from N Lobby.",
      );
    }
  }

  async getUserInfo(): Promise<any> {
    try {
      const response =
        await this.httpClient.get<NLobbyApiResponse>("/api/user");

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch user info");
      }

      return response.data.data;
    } catch (error) {
      logger.error("Error fetching user info:", error);
      throw new Error(
        "Authentication required. Please use the set_cookies tool to provide valid NextAuth.js session cookies from N Lobby.",
      );
    }
  }

  private searchForNewsInData(obj: any, path: string = ""): any[] {
    if (!obj || typeof obj !== "object") return [];

    // If it's an array, check if it looks like a news array
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        const firstItem = obj[0];
        if (firstItem && typeof firstItem === "object") {
          // Check for news-like properties
          const newsProperties = [
            "title",
            "name",
            "content",
            "publishedAt",
            "menuName",
            "createdAt",
            "updatedAt",
            "id",
          ];
          const hasNewsProperties = newsProperties.some(
            (prop) => prop in firstItem,
          );

          if (hasNewsProperties) {
            logger.info(
              `[INFO] Found potential news array at path: ${path}, length: ${obj.length}`,
            );
            logger.info(
              `[INFO] Sample item properties:`,
              Object.keys(firstItem),
            );
            return obj;
          }
        }
      }
      return [];
    }

    // If it's an object, search recursively through its properties
    const results = [];
    for (const [key, value] of Object.entries(obj)) {
      // Prioritize searching in keys that are likely to contain news data
      const priorityKeys = [
        "news",
        "announcements",
        "data",
        "items",
        "list",
        "content",
        "notifications",
        "posts",
        "feed",
        "results",
      ];
      const searchPath = path ? `${path}.${key}` : key;

      if (priorityKeys.includes(key.toLowerCase())) {
        logger.info(`[INFO] Searching priority key: ${searchPath}`);
      }

      const foundArrays = this.searchForNewsInData(value, searchPath);
      results.push(...foundArrays);
    }

    return results;
  }

  private parseAnnouncementsWithCheerio(html: string): NLobbyAnnouncement[] {
    try {
      logger.info("[TARGET] Starting Cheerio-based DOM parsing...");
      const $ = cheerio.load(html);

      // Find the second div[role='presentation'] which contains the DataGrid content
      const presentationDivs = $('div[role="presentation"]');
      logger.info(
        `[INFO] Found ${presentationDivs.length} div[role="presentation"] elements`,
      );

      if (presentationDivs.length < 2) {
        logger.info(
          '[WARNING] Less than 2 div[role="presentation"] elements found',
        );
        return [];
      }

      // Get the second div[role='presentation'] (index 1)
      const dataGridContent = $(presentationDivs[1]);
      logger.info('[SUCCESS] Located second div[role="presentation"] element');

      // Find all rows in the DataGrid
      const rows = dataGridContent.find('div[role="row"]');
      logger.info(`[INFO] Found ${rows.length} DataGrid rows`);

      const announcements: NLobbyAnnouncement[] = [];

      rows.each((index: number, rowElement: any) => {
        try {
          const $row = $(rowElement);
          const rowId = $row.attr("data-id");

          if (!rowId) {
            logger.info(
              `[WARNING] Row ${index} has no data-id attribute, skipping`,
            );
            return; // continue to next row
          }

          // Extract data from each gridcell
          const cells = $row.find('div[role="gridcell"]');
          logger.info(
            `[STATUS] Row ${rowId}: Found ${cells.length} grid cells`,
          );

          let title = "";
          let category = "";
          let publishedAt = new Date();
          let isImportant = false;
          let isUnread = false;
          let url = "";

          cells.each((_cellIndex: number, cellElement: any) => {
            const $cell = $(cellElement);
            const field = $cell.attr("data-field");

            switch (field) {
              case "title":
                // Extract title and URL from the link
                const link = $cell.find("a");
                if (link.length > 0) {
                  // Extract relative URL from href and convert to full URL
                  const hrefUrl = link.attr("href");
                  if (hrefUrl && hrefUrl.startsWith("/news/")) {
                    url = `${CONFIG.nlobby.baseUrl}${hrefUrl}`;
                  } else {
                    url = `${CONFIG.nlobby.baseUrl}/news/${rowId}`;
                  }
                  const titleSpan = link.find("span");
                  title =
                    titleSpan.length > 0
                      ? titleSpan.text().trim()
                      : link.text().trim();
                } else {
                  title = $cell.text().trim();
                  url = `${CONFIG.nlobby.baseUrl}/news/${rowId}`;
                }
                break;

              case "menuName":
                category = $cell.text().trim();
                break;

              case "isImportant":
                // Check if there's any content indicating importance
                isImportant =
                  $cell.text().trim().length > 0 || $cell.find("*").length > 0;
                break;

              case "isUnread":
                // Check for "未読" text or any indicator
                const unreadText = $cell.text().trim();
                isUnread = unreadText.includes("未読") || unreadText.length > 0;
                break;

              case "publishedAt":
                const dateText = $cell.text().trim();
                if (dateText) {
                  // Parse Japanese date format: 2025/07/13 09:00
                  const parsedDate = new Date(dateText.replace(/\//g, "-"));
                  if (!isNaN(parsedDate.getTime())) {
                    publishedAt = parsedDate;
                  }
                }
                break;
            }
          });

          // Only add if we have a valid title
          if (title) {
            // Ensure URL is properly formatted - fallback if not already set
            const finalUrl = url || `${CONFIG.nlobby.baseUrl}/news/${rowId}`;

            const announcement: NLobbyAnnouncement = {
              id: rowId,
              title,
              content: "", // Content not available in the grid, would need separate request
              publishedAt,
              category: category || "General",
              priority: isImportant ? "high" : "medium",
              targetAudience: ["student"],
              url: finalUrl,
              menuName: category,
              isImportant,
              isUnread,
            };

            announcements.push(announcement);
            logger.info(
              `[SUCCESS] Added announcement: ${title.substring(0, 50)}...`,
            );
          } else {
            logger.info(`[WARNING] Row ${rowId}: No title found, skipping`);
          }
        } catch (rowError) {
          logger.error(
            `[ERROR] Error parsing row ${index}:`,
            rowError instanceof Error ? rowError.message : "Unknown error",
          );
        }
      });

      logger.info(
        `[TARGET] Cheerio parsing completed: ${announcements.length} news items extracted`,
      );
      return announcements;
    } catch (error) {
      logger.error(
        "[ERROR] Cheerio parsing failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return [];
    }
  }

  private parseNewsFromHtml(html: string): NLobbyAnnouncement[] {
    const announcements: NLobbyAnnouncement[] = [];

    try {
      logger.info("[INFO] Starting HTML parsing...");
      logger.debug(`[DATA] HTML length: ${html.length} characters`);

      // **PRIORITY 1**: Extract data from Next.js self.__next_f.push() calls
      logger.info(
        "[STEP1] Extracting data from Next.js self.__next_f.push() calls...",
      );
      const nextFPushMatches = html.match(/self\.__next_f\.push\((\[.*?\])\)/g);

      if (nextFPushMatches && nextFPushMatches.length > 0) {
        logger.info(
          `[SUCCESS] Found ${nextFPushMatches.length} self.__next_f.push() calls`,
        );

        for (let i = 0; i < nextFPushMatches.length; i++) {
          const pushCall = nextFPushMatches[i];
          try {
            // Extract the JSON array from the push call
            const jsonMatch = pushCall.match(
              /self\.__next_f\.push\((\[.*?\])\)/,
            );
            if (!jsonMatch) continue;

            const pushData = JSON.parse(jsonMatch[1]);
            logger.info(
              `[INFO] Push call ${i + 1}: Array length ${pushData.length}, types: [${pushData.map((item: any) => typeof item).join(", ")}]`,
            );

            // Check if this looks like the news data format: [1, "5:[[...]]]"]
            if (pushData.length >= 2 && typeof pushData[1] === "string") {
              const stringData = pushData[1];

              // Check if string starts with number and colon (e.g., "5:...")
              const prefixMatch = stringData.match(/^(\d+):(.*)/);
              if (prefixMatch) {
                logger.info(
                  `[INFO] Push call ${i + 1}: Found prefixed data with prefix "${prefixMatch[1]}"`,
                );

                try {
                  // Parse the JSON after the prefix
                  const actualJsonString = prefixMatch[2];
                  const parsedContent = JSON.parse(actualJsonString);

                  logger.info(
                    `[INFO] Push call ${i + 1}: Parsed content type: ${typeof parsedContent}, isArray: ${Array.isArray(parsedContent)}`,
                  );

                  if (Array.isArray(parsedContent)) {
                    // This should be the array structure like [["$","$L23",...], ["$","$L24",null,{news:[...]}]]
                    for (let j = 0; j < parsedContent.length; j++) {
                      const item = parsedContent[j];
                      if (
                        Array.isArray(item) &&
                        item.length >= 4 &&
                        item[3] &&
                        typeof item[3] === "object"
                      ) {
                        const componentData = item[3];
                        logger.info(
                          `[INFO] Push call ${i + 1}, item ${j}: Component data keys: [${Object.keys(componentData).join(", ")}]`,
                        );

                        // Look for the news array in component data
                        if (
                          componentData.news &&
                          Array.isArray(componentData.news)
                        ) {
                          logger.info(
                            `[SUCCESS] Found news array in push call ${i + 1}, item ${j}: ${componentData.news.length} items`,
                          );

                          // Validate that this looks like real news data
                          if (componentData.news.length > 0) {
                            const firstNews = componentData.news[0];
                            if (
                              firstNews &&
                              typeof firstNews === "object" &&
                              (firstNews.id ||
                                firstNews.title ||
                                firstNews.microCmsId)
                            ) {
                              logger.info(
                                `[TARGET] Validated news data structure in push call ${i + 1}`,
                              );
                              return this.transformNewsToAnnouncements(
                                componentData.news,
                              );
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (parseError) {
                  logger.info(
                    `[WARNING] Failed to parse prefixed JSON in push call ${i + 1}:`,
                    parseError instanceof Error
                      ? parseError.message
                      : "Unknown error",
                  );
                }
              } else {
                // Fallback: try to parse the string directly
                try {
                  const innerData = JSON.parse(stringData);
                  const foundNews = this.searchForNewsInData(
                    innerData,
                    `push_call_${i + 1}_fallback`,
                  );
                  if (foundNews && foundNews.length > 0) {
                    logger.info(
                      `[SUCCESS] Found ${foundNews.length} news items in push call ${i + 1} (fallback)`,
                    );
                    return this.transformNewsToAnnouncements(foundNews);
                  }
                } catch (innerParseError) {
                  logger.info(
                    `[WARNING] Failed to parse inner JSON in push call ${i + 1}:`,
                    innerParseError instanceof Error
                      ? innerParseError.message
                      : "Unknown error",
                  );
                }
              }
            }

            // Also check if the push data itself contains news arrays
            const foundNews = this.searchForNewsInData(
              pushData,
              `push_call_${i + 1}_direct`,
            );
            if (foundNews && foundNews.length > 0) {
              logger.info(
                `[SUCCESS] Found ${foundNews.length} news items directly in push call ${i + 1}`,
              );
              return this.transformNewsToAnnouncements(foundNews);
            }
          } catch (e) {
            logger.info(
              `[WARNING] Failed to parse push call ${i + 1}:`,
              e instanceof Error ? e.message : "Unknown error",
            );
          }
        }
      } else {
        logger.info("[WARNING] No self.__next_f.push() calls found in HTML");
      }

      // **FALLBACK 1**: Direct DOM parsing using Cheerio as fallback...
      logger.info("[STEP2] Attempting DOM parsing with Cheerio as fallback...");
      const cheerioAnnouncements = this.parseAnnouncementsWithCheerio(html);
      if (cheerioAnnouncements && cheerioAnnouncements.length > 0) {
        logger.info(
          `[SUCCESS] Cheerio DOM parsing successful: ${cheerioAnnouncements.length} news items found`,
        );
        return cheerioAnnouncements;
      } else {
        logger.info("[WARNING] Cheerio DOM parsing returned no results");
      }

      // Second priority: Extract data from Next.js __NEXT_DATA__
      logger.info("[STEP2] Trying to extract data from __NEXT_DATA__...");
      const nextDataMatches = [
        html.match(/window\.__NEXT_DATA__\s*=\s*({.*?})\s*(?:;|<\/script>)/s),
        html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/s),
        html.match(/__NEXT_DATA__\s*=\s*({.*?})(?:;|\s*<\/script>)/s),
      ];

      for (const nextDataMatch of nextDataMatches) {
        if (nextDataMatch) {
          try {
            const jsonData = nextDataMatch[1] || nextDataMatch[0];
            const nextData = JSON.parse(jsonData);
            logger.info(
              "[SUCCESS] Found __NEXT_DATA__, analyzing structure...",
            );
            logger.info("[INFO] Keys in __NEXT_DATA__:", Object.keys(nextData));

            const foundNews = this.searchForNewsInData(
              nextData,
              "__NEXT_DATA__",
            );
            if (foundNews && foundNews.length > 0) {
              logger.info(
                `[SUCCESS] Found ${foundNews.length} news items in __NEXT_DATA__`,
              );
              return this.transformNewsToAnnouncements(foundNews);
            }

            logger.info("[WARNING] No news data found in __NEXT_DATA__");
          } catch (e) {
            logger.info(
              "[WARNING] Failed to parse __NEXT_DATA__:",
              e instanceof Error ? e.message : "Unknown error",
            );
          }
        }
      }

      if (!nextDataMatches.some((match) => match)) {
        logger.info("[WARNING] __NEXT_DATA__ not found in HTML");
      }

      // Third priority: Extract from React component inline JSON data
      logger.info("[STEP3] Trying to extract from React component data...");
      const reactDataPatterns = [
        /"news":\s*(\[.*?\])/g,
        /"announcements":\s*(\[.*?\])/g,
        /"items":\s*(\[.*?\])/g,
        /"data":\s*(\[.*?\])/g,
      ];

      for (const pattern of reactDataPatterns) {
        const matches = Array.from(html.matchAll(pattern));
        if (matches.length > 0) {
          logger.info(
            `[INFO] Found ${matches.length} matches for pattern: ${pattern.source}`,
          );
          for (const match of matches) {
            try {
              if (match[1]) {
                const newsData = JSON.parse(match[1]);
                if (
                  newsData &&
                  Array.isArray(newsData) &&
                  newsData.length > 0
                ) {
                  logger.info(
                    `[SUCCESS] Found React component data with ${newsData.length} items`,
                  );

                  const foundNews = this.searchForNewsInData(
                    newsData,
                    "react_component",
                  );
                  if (foundNews && foundNews.length > 0) {
                    logger.info(
                      `[SUCCESS] Confirmed news-like data structure with ${foundNews.length} items`,
                    );
                    return this.transformNewsToAnnouncements(foundNews);
                  }
                }
              }
            } catch (e) {
              logger.info(
                "[WARNING] Failed to parse React data:",
                e instanceof Error ? e.message : "Unknown error",
              );
            }
          }
        }
      }

      // Fourth priority: Simple HTML pattern extraction as fallback
      logger.info(
        "[STEP4] Trying simple HTML element extraction as fallback...",
      );

      // Look for simple patterns that might contain news data
      const simplePatterns = [
        // Look for data attributes that might contain JSON
        /data-news="([^"]*)">/g,
        /data-items="([^"]*)">/g,
        /data-content="([^"]*)">/g,
        // Look for script tags with JSON arrays
        /<script[^>]*>.*?(\[.*?\]).*?<\/script>/gs,
      ];

      for (const pattern of simplePatterns) {
        const matches = Array.from(html.matchAll(pattern));
        if (matches.length > 0) {
          logger.info(
            `[INFO] Found ${matches.length} matches for simple pattern`,
          );
          for (const match of matches) {
            try {
              if (match[1]) {
                // Try to decode if it's HTML encoded
                const decoded = match[1]
                  .replace(/&quot;/g, '"')
                  .replace(/&amp;/g, "&")
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">");
                const possibleData = JSON.parse(decoded);

                if (Array.isArray(possibleData) && possibleData.length > 0) {
                  logger.info(
                    `[SUCCESS] Found simple pattern data with ${possibleData.length} items`,
                  );

                  const foundNews = this.searchForNewsInData(
                    possibleData,
                    "simple_pattern",
                  );
                  if (foundNews && foundNews.length > 0) {
                    logger.info(
                      `[SUCCESS] Confirmed news data in simple pattern with ${foundNews.length} items`,
                    );
                    return this.transformNewsToAnnouncements(foundNews);
                  }
                }
              }
            } catch {
              // Silently continue - simple patterns often have false positives
            }
          }
        }
      }
    } catch (error) {
      logger.error("[ERROR] Error parsing news from HTML:", error);
    }

    // If no data was found through any method, log detailed information for debugging
    logger.info("[WARNING] No news data found through any parsing method");
    logger.info("[INFO] HTML analysis summary:");
    logger.info(
      `  - self.__next_f.push() calls: ${html.includes("self.__next_f.push(") ? "found" : "not found"}`,
    );
    logger.info(
      `  - __NEXT_DATA__: ${html.includes("__NEXT_DATA__") ? "found" : "not found"}`,
    );
    logger.info(
      `  - "news" keyword: ${html.includes('"news"') ? "found" : "not found"}`,
    );
    logger.info(
      `  - "announcements" keyword: ${html.includes('"announcements"') ? "found" : "not found"}`,
    );

    // Return empty array instead of null to ensure consistency
    logger.info(
      `[STATUS] Final result: ${announcements.length} news items extracted`,
    );
    return announcements;
  }

  private async fetchRenderedHtml(url: string): Promise<string> {
    try {
      logger.info(
        "[NETWORK] Fetching HTML using HTTP client (proven method)...",
      );
      logger.debug(`[URL] URL: ${CONFIG.nlobby.baseUrl + url}`);
      logger.info(
        "[COOKIE] Cookies:",
        this.httpClient.defaults.headers.Cookie ? "present" : "missing",
      );

      const response = await this.httpClient.get(url, {
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
      logger.info(
        `[DATA] Content length: ${response.data?.length || "unknown"}`,
      );
      logger.info(
        `[DATA] Content type: ${response.headers["content-type"] || "unknown"}`,
      );

      if (typeof response.data === "string") {
        const html = response.data;

        // Basic validation
        const lowerContent = html.toLowerCase();
        if (
          lowerContent.includes("ログイン") ||
          lowerContent.includes("login")
        ) {
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
        throw new Error(
          `Non-string response received: ${typeof response.data}`,
        );
      }
    } catch (error) {
      logger.error(
        "[ERROR] HTTP fetch error:",
        error instanceof Error ? error.message : "Unknown error",
      );

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
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

  setCookies(cookies: string): void {
    if (!cookies || cookies.trim() === "") {
      logger.warn("[WARNING] Empty cookies provided to setCookies");
      return;
    }

    logger.debug("[COOKIE] Setting cookies for all clients...");
    logger.debug(`[SIZE] Cookie string length: ${cookies.length}`);

    // Set cookies for HTTP client
    this.httpClient.defaults.headers.Cookie = cookies;
    logger.info("[SUCCESS] HTTP client cookies set");

    // Set cookies for NextAuth handler
    this.nextAuth.setCookies(cookies);
    logger.info("[SUCCESS] NextAuth cookies set");

    // Set cookies for tRPC client
    this.trpcClient.setAllCookies(cookies);
    logger.info("[SUCCESS] tRPC client cookies set");

    // Verify all cookies are set correctly
    const httpCookies = this.httpClient.defaults.headers.Cookie;
    const nextAuthAuthenticated = this.nextAuth.isAuthenticated();
    const trpcCookies = (this.trpcClient as any).allCookies;

    logger.info("[INFO] Cookie verification:");
    logger.info(
      `  HTTP client: ${httpCookies ? "[SUCCESS] present" : "[ERROR] missing"}`,
    );
    logger.info(
      `  NextAuth: ${nextAuthAuthenticated ? "[SUCCESS] authenticated" : "[ERROR] not authenticated"}`,
    );
    logger.info(
      `  tRPC client: ${trpcCookies ? "[SUCCESS] present" : "[ERROR] missing"}`,
    );

    if (httpCookies && nextAuthAuthenticated && trpcCookies) {
      logger.info("[SUCCESS] All clients successfully configured with cookies");
    } else {
      logger.error(
        "[ERROR] Cookie synchronization failed - some clients missing cookies",
      );
    }
  }

  getCookieStatus(): string {
    const hasHttpCookies = !!this.httpClient.defaults.headers.Cookie;
    const hasNextAuthCookies = this.nextAuth.isAuthenticated();
    const nextAuthCookies = this.nextAuth.getCookies();
    const hasTrpcCookies = !!(this.trpcClient as any).allCookies;

    // Get cookie lengths for detailed analysis
    const httpCookieString = this.httpClient.defaults.headers.Cookie;
    const httpCookieLength =
      typeof httpCookieString === "string" ? httpCookieString.length : 0;
    const trpcCookieLength = (this.trpcClient as any).allCookies?.length || 0;
    const nextAuthCookieHeaderLength =
      this.nextAuth.getCookieHeader()?.length || 0;

    // Check for cookie synchronization issues
    const cookiesSynced =
      httpCookieLength === trpcCookieLength && trpcCookieLength > 0;

    return `[INFO] Authentication Status:
[HTTP] HTTP client: ${hasHttpCookies ? "[SUCCESS] cookies set" : "[ERROR] no cookies"} (${httpCookieLength} chars)
[DEBUG] tRPC client: ${hasTrpcCookies ? "[SUCCESS] cookies set" : "[ERROR] no cookies"} (${trpcCookieLength} chars)
[AUTH] NextAuth: ${hasNextAuthCookies ? "[SUCCESS] authenticated" : "[ERROR] not authenticated"} (${nextAuthCookieHeaderLength} chars)
   - Session token: ${nextAuthCookies.sessionToken ? "[SUCCESS] present" : "[ERROR] missing"}
   - CSRF token: ${nextAuthCookies.csrfToken ? "[SUCCESS] present" : "[ERROR] missing"}
   - Callback URL: ${nextAuthCookies.callbackUrl ? "[SUCCESS] present" : "[ERROR] missing"}

Cookie Synchronization: ${cookiesSynced ? "[SUCCESS] synchronized" : "[ERROR] not synchronized"}
${!cookiesSynced && hasHttpCookies ? "[WARNING] Cookie length mismatch detected - may cause authentication issues" : ""}`;
  }

  private async tryMultipleNewsEndpoints(): Promise<any[] | null> {
    const endpoints = [
      // **Priority 1**: Direct simple patterns based on working getUnreadNewsCount
      { name: "news.find", method: () => this.trpcClient.call("news.find") },
      { name: "news.list", method: () => this.trpcClient.call("news.list") },
      { name: "news.get", method: () => this.trpcClient.call("news.get") },
      {
        name: "news.getAll",
        method: () => this.trpcClient.call("news.getAll"),
      },
      {
        name: "news.findAll",
        method: () => this.trpcClient.call("news.findAll"),
      },
      {
        name: "news.findMany",
        method: () => this.trpcClient.call("news.findMany"),
      },

      // **Priority 2**: With pagination parameters (67 items known)
      {
        name: "news.find_paginated",
        method: () => this.trpcClient.call("news.find", { take: 67, skip: 0 }),
      },
      {
        name: "news.list_paginated",
        method: () => this.trpcClient.call("news.list", { take: 67, skip: 0 }),
      },
      {
        name: "news.getAll_paginated",
        method: () =>
          this.trpcClient.call("news.getAll", { take: 67, skip: 0 }),
      },
      {
        name: "news.findMany_paginated",
        method: () =>
          this.trpcClient.call("news.findMany", { take: 67, skip: 0 }),
      },

      // **Priority 3**: With empty parameters
      {
        name: "news.find_empty",
        method: () => this.trpcClient.call("news.find", {}),
      },
      {
        name: "news.list_empty",
        method: () => this.trpcClient.call("news.list", {}),
      },
      {
        name: "news.get_empty",
        method: () => this.trpcClient.call("news.get", {}),
      },
      {
        name: "news.getAll_empty",
        method: () => this.trpcClient.call("news.getAll", {}),
      },
      {
        name: "news.findMany_empty",
        method: () => this.trpcClient.call("news.findMany", {}),
      },

      // **Priority 4**: Database-style methods (existing implementation)
      { name: "findAllNews", method: () => this.trpcClient.findAllNews() },
      {
        name: "findAllNews_limited",
        method: () => this.trpcClient.findAllNews({ limit: 67 }),
      },
      { name: "listNews", method: () => this.trpcClient.listNews() },
      { name: "selectNews", method: () => this.trpcClient.selectNews() },

      // **Priority 5**: More specific patterns
      {
        name: "news.getList",
        method: () => this.trpcClient.call("news.getList"),
      },
      {
        name: "news.getItems",
        method: () => this.trpcClient.call("news.getItems"),
      },
      {
        name: "news.getData",
        method: () => this.trpcClient.call("news.getData"),
      },
      {
        name: "news.getContent",
        method: () => this.trpcClient.call("news.getContent"),
      },
      {
        name: "news.getFeed",
        method: () => this.trpcClient.call("news.getFeed"),
      },
      {
        name: "news.getPage",
        method: () => this.trpcClient.call("news.getPage"),
      },

      // **Priority 6**: With filters
      {
        name: "news.find_published",
        method: () =>
          this.trpcClient.call("news.find", { where: { published: true } }),
      },
      {
        name: "news.find_active",
        method: () =>
          this.trpcClient.call("news.find", { where: { active: true } }),
      },
      {
        name: "news.list_published",
        method: () =>
          this.trpcClient.call("news.list", { where: { published: true } }),
      },
      {
        name: "news.list_active",
        method: () =>
          this.trpcClient.call("news.list", { where: { active: true } }),
      },

      // **Priority 7**: Alternative namespace patterns
      {
        name: "announcement.find",
        method: () => this.trpcClient.call("announcement.find"),
      },
      {
        name: "announcement.list",
        method: () => this.trpcClient.call("announcement.list"),
      },
      {
        name: "announcement.getAll",
        method: () => this.trpcClient.call("announcement.getAll"),
      },
      {
        name: "notifications.find",
        method: () => this.trpcClient.call("notifications.find"),
      },
      {
        name: "notifications.list",
        method: () => this.trpcClient.call("notifications.list"),
      },
      {
        name: "notifications.getAll",
        method: () => this.trpcClient.call("notifications.getAll"),
      },

      // **Priority 8**: Existing endpoints (keep for compatibility)
      {
        name: "getNewsListData",
        method: () => this.trpcClient.getNewsListData(),
      },
      { name: "getNewsItems", method: () => this.trpcClient.getNewsItems() },
      { name: "getNewsData", method: () => this.trpcClient.getNewsData() },
      {
        name: "getNewsContent",
        method: () => this.trpcClient.getNewsContent(),
      },
      { name: "getNewsFeed", method: () => this.trpcClient.getNewsFeed() },
      { name: "getNewsPage", method: () => this.trpcClient.getNewsPage() },
      { name: "getNewsAll", method: () => this.trpcClient.getNewsAll() },
      { name: "getNewsList2", method: () => this.trpcClient.getNewsList2() },
      { name: "getRecentNews", method: () => this.trpcClient.getRecentNews() },
      {
        name: "getPublishedNews",
        method: () => this.trpcClient.getPublishedNews(),
      },
      { name: "getActiveNews", method: () => this.trpcClient.getActiveNews() },
      { name: "queryNews", method: () => this.trpcClient.queryNews() },
      { name: "browseNews", method: () => this.trpcClient.browseNews() },
      { name: "searchNews_all", method: () => this.trpcClient.searchNews({}) },

      // **Priority 9**: Pagination-based endpoints (existing)
      {
        name: "getNewsWithPagination",
        method: () =>
          this.trpcClient.getNewsWithPagination({ take: 50, skip: 0 }),
      },
      {
        name: "getNewsWithPagination_all",
        method: () =>
          this.trpcClient.getNewsWithPagination({ take: 100, skip: 0 }),
      },
      {
        name: "getNewsWithPagination_small",
        method: () =>
          this.trpcClient.getNewsWithPagination({ take: 10, skip: 0 }),
      },

      // **Priority 10**: Original endpoints (keep for compatibility)
      { name: "getNews", method: () => this.trpcClient.getNews() },
      { name: "getNewsList", method: () => this.trpcClient.getNewsList() },
      {
        name: "getNotificationMessages",
        method: () => this.trpcClient.getNotificationMessages(),
      },
      { name: "getNews_empty", method: () => this.trpcClient.getNews({}) },
      {
        name: "getNewsList_empty",
        method: () => this.trpcClient.getNewsList({}),
      },
    ];

    logger.info("[INFO] Trying multiple tRPC endpoints...");
    logger.debug(`[STATUS] Known: There are 67 news items available`);
    logger.info(
      `[STATUS] Testing ${endpoints.length} different endpoint configurations`,
    );

    let lastValidResponse: any = null;
    const triedEndpoints: Array<{
      name: string;
      success: boolean;
      error?: string;
      responseType?: string;
    }> = [];

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      logger.info(
        `[REQUEST] [${i + 1}/${endpoints.length}] Attempting tRPC endpoint: ${endpoint.name}`,
      );

      try {
        const startTime = Date.now();
        const data = await endpoint.method();
        const endTime = Date.now();
        const duration = endTime - startTime;

        logger.debug(`[TIMING] ${endpoint.name} responded in ${duration}ms`);
        logger.info(
          `[INFO] Response type: ${typeof data}, isArray: ${Array.isArray(data)}`,
        );

        if (data !== null && data !== undefined) {
          lastValidResponse = data;
        }

        if (data && Array.isArray(data) && data.length > 0) {
          logger.info(
            `[SUCCESS] SUCCESS: tRPC endpoint ${endpoint.name} returned ${data.length} items`,
          );
          logger.info(
            `[TARGET] Sample item structure:`,
            data[0] ? Object.keys(data[0]) : "empty",
          );
          triedEndpoints.push({
            name: endpoint.name,
            success: true,
            responseType: `array[${data.length}]`,
          });
          return data;
        } else if (data && Array.isArray(data) && data.length === 0) {
          logger.info(
            `[WARNING] tRPC endpoint ${endpoint.name} returned empty array (valid but no data)`,
          );
          triedEndpoints.push({
            name: endpoint.name,
            success: true,
            responseType: "empty_array",
          });
          // Continue trying other endpoints, don't return empty array yet
        } else if (data && typeof data === "object") {
          logger.info(
            `[INFO] tRPC endpoint ${endpoint.name} returned object:`,
            Object.keys(data),
          );
          triedEndpoints.push({
            name: endpoint.name,
            success: true,
            responseType: "object",
          });

          // Check if object contains array properties
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key]) && data[key].length > 0) {
              logger.info(
                `[SUCCESS] Found array in object property '${key}' with ${data[key].length} items`,
              );
              return data[key];
            }
          }
        } else {
          logger.info(
            `[WARNING] tRPC endpoint ${endpoint.name} returned unexpected data:`,
            typeof data,
            data,
          );
          triedEndpoints.push({
            name: endpoint.name,
            success: false,
            responseType: typeof data,
          });
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `[ERROR] tRPC endpoint ${endpoint.name} failed: ${errorMsg}`,
        );
        triedEndpoints.push({
          name: endpoint.name,
          success: false,
          error: errorMsg,
        });

        // Enhanced error logging
        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as any;
          const status = axiosError.response?.status;
          const statusText = axiosError.response?.statusText;

          logger.error(`[DEBUG] ${endpoint.name} HTTP Error:`, {
            status,
            statusText,
            url: axiosError.config?.url,
            method: axiosError.config?.method,
            hasData: Boolean(axiosError.response?.data),
            dataType: typeof axiosError.response?.data,
          });

          // Specific error analysis
          if (status === 404) {
            logger.info(
              `[LOG] ${endpoint.name}: Endpoint not found (expected for non-existent endpoints)`,
            );
          } else if (status === 401) {
            logger.info(
              `[LOG] ${endpoint.name}: Authentication failed (this shouldn't happen)`,
            );
            break; // Stop trying if auth fails
          } else if (status === 403) {
            logger.info(
              `[LOG] ${endpoint.name}: Access forbidden (permissions issue)`,
            );
          } else if (status >= 500) {
            logger.info(
              `[LOG] ${endpoint.name}: Server error (try again later)`,
            );
          }
        }

        continue;
      }
    }

    // Summary of all attempts
    logger.info("\n[STATUS] tRPC Endpoint Test Summary:");
    logger.info(
      `[SUCCESS] Successful endpoints: ${triedEndpoints.filter((e) => e.success).length}`,
    );
    logger.info(
      `[ERROR] Failed endpoints: ${triedEndpoints.filter((e) => !e.success).length}`,
    );

    const successfulEndpoints = triedEndpoints.filter((e) => e.success);
    if (successfulEndpoints.length > 0) {
      logger.info(
        "[TARGET] Successful endpoints:",
        successfulEndpoints
          .map((e) => `${e.name} (${e.responseType})`)
          .join(", "),
      );
    }

    if (lastValidResponse !== null) {
      logger.info(
        "[INFO] Last valid response received, but it was not a news array",
      );
      logger.info("[INFO] Response type:", typeof lastValidResponse);
      if (Array.isArray(lastValidResponse)) {
        logger.info("[INFO] Array length:", lastValidResponse.length);
      } else if (typeof lastValidResponse === "object") {
        logger.info("[INFO] Object keys:", Object.keys(lastValidResponse));
      }
    }

    logger.info("[ERROR] All tRPC endpoints failed to return news array data");
    return null;
  }

  private async extractNextJsMetadata(): Promise<{
    routerState: string;
    action: string;
  } | null> {
    try {
      logger.info("[INFO] Extracting Next.js metadata from /news page...");

      const response = await this.httpClient.get("/news", {
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
        },
        withCredentials: true,
      });

      logger.info(
        `[SUCCESS] Metadata extraction response status: ${response.status}`,
      );
      logger.info(
        `[DATA] HTML length: ${typeof response.data === "string" ? response.data.length : "N/A"}`,
      );

      const html = response.data;

      // Extract Next-Router-State-Tree from meta tags or script tags
      let routerState = null;
      let action = null;

      logger.info("[INFO] Searching for router state in meta tags...");
      // Try to extract from meta tags first
      const routerStateMatch = html.match(
        /<meta\s+name=["']next-router-state-tree["']\s+content=["']([^"']+)["']/i,
      );
      if (routerStateMatch) {
        routerState = decodeURIComponent(routerStateMatch[1]);
        logger.info("[SUCCESS] Found router state in meta tags");
      } else {
        logger.info("[WARNING] Router state not found in meta tags");
      }

      logger.info("[INFO] Searching for action in meta tags...");
      const actionMatch = html.match(
        /<meta\s+name=["']next-action["']\s+content=["']([^"']+)["']/i,
      );
      if (actionMatch) {
        action = actionMatch[1];
        logger.info("[SUCCESS] Found action in meta tags");
      } else {
        logger.info("[WARNING] Action not found in meta tags");
      }

      // If not found in meta tags, try to extract from inline scripts
      if (!routerState || !action) {
        logger.info("[INFO] Searching in script tags...");

        // Look for Next.js router state in script tags
        const scriptMatches = html.match(
          /<script[^>]*>.*?window\.__NEXT_DATA__\s*=\s*({.*?});?.*?<\/script>/s,
        );
        if (scriptMatches) {
          try {
            logger.info("[INFO] Found __NEXT_DATA__, parsing...");
            const nextData = JSON.parse(scriptMatches[1]);
            if (nextData.props?.pageProps?.__N_RSC) {
              // Extract router state from Next.js data
              const rscData = nextData.props.pageProps.__N_RSC;
              if (rscData.routerState) {
                routerState = rscData.routerState;
                logger.info("[SUCCESS] Found router state in __NEXT_DATA__");
              }
            }
          } catch (e) {
            logger.info(
              "[WARNING] Could not parse __NEXT_DATA__:",
              e instanceof Error ? e.message : "Unknown error",
            );
          }
        } else {
          logger.info("[WARNING] __NEXT_DATA__ not found");
        }

        logger.info("[INFO] Searching for action in script content...");
        // Look for action in script tags or Network panel patterns
        const actionScriptMatch =
          html.match(/['"](c[0-9a-f]{40,})['"]/) ||
          html.match(/next-action['"]\s*:\s*['"](c[0-9a-f]{40,})['"]/) ||
          html.match(/action:\s*['"](c[0-9a-f]{40,})['"]/);

        if (actionScriptMatch) {
          action = actionScriptMatch[1];
          logger.info("[SUCCESS] Found action in script content");
        } else {
          logger.info("[WARNING] Action not found in script content");
        }
      }

      // Fallback: generate a default router state for /news page
      if (!routerState) {
        routerState =
          "%5B%22%22%2C%7B%22children%22%3A%5B%22news%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D";
        logger.info("[WARNING] Using fallback router state");
      }

      // If still no action found, try making a request to capture it from headers
      if (!action) {
        logger.info("[INFO] Trying preflight request to capture action...");
        try {
          // Make a preflight request to news page to capture action
          await this.httpClient.get("/news", {
            headers: {
              Accept: "text/x-component",
              RSC: "1",
            },
            withCredentials: true,
          });
        } catch (preflightError: any) {
          // Check if error response contains action in headers
          if (preflightError.response?.headers?.["next-action"]) {
            action = preflightError.response.headers["next-action"];
            logger.info("[SUCCESS] Found action in preflight response headers");
          } else {
            logger.info(
              "[WARNING] Action not found in preflight response headers",
            );
          }
        }
      }

      if (routerState && action) {
        logger.info("[SUCCESS] Successfully extracted Next.js metadata");
        logger.debug(`[STATUS] Router state length: ${routerState.length}`);
        logger.debug(`[STATUS] Action: ${action}`);
        return { routerState, action };
      } else {
        logger.info("[ERROR] Could not extract complete Next.js metadata", {
          routerState: Boolean(routerState),
          action: Boolean(action),
        });
        return null;
      }
    } catch (error) {
      logger.error("[ERROR] Error extracting Next.js metadata:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        logger.debug("[DEBUG] Metadata extraction Axios error:", {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          url: axiosError.config?.url,
          dataLength:
            typeof axiosError.response?.data === "string"
              ? axiosError.response?.data.length
              : "N/A",
        });
      }

      return null;
    }
  }

  private async fetchNewsViaRSC(): Promise<any[] | null> {
    try {
      logger.info("[INFO] Starting RSC approach...");

      // Extract dynamic Next.js metadata
      const metadata = await this.extractNextJsMetadata();

      if (!metadata) {
        logger.info(
          "[WARNING] Could not extract Next.js metadata, skipping RSC approach",
        );
        return null;
      }

      logger.info("[SUCCESS] Next.js metadata extracted:", {
        routerStateLength: metadata.routerState.length,
        actionLength: metadata.action.length,
      });

      logger.info("[REQUEST] Making RSC request with extracted metadata...");

      // React Server Components approach with dynamic values
      const rscId = Math.random().toString(36).substring(2, 7);
      const rscUrl = `/news?_rsc=${rscId}`;

      logger.debug(`[URL] RSC URL: ${rscUrl}`);
      logger.info(
        "[COOKIE] RSC cookies:",
        this.httpClient.defaults.headers.Cookie ? "present" : "missing",
      );

      const response = await this.httpClient.get(rscUrl, {
        headers: {
          Accept: "text/x-component",
          "Next-Router-State-Tree": metadata.routerState,
          "Next-Action": metadata.action,
          "Next-Url": "/news",
          RSC: "1",
        },
        withCredentials: true,
      });

      logger.info(`[SUCCESS] RSC response status: ${response.status}`);
      logger.debug(`[DATA] RSC response data type: ${typeof response.data}`);
      logger.info(
        `[SIZE] RSC response length: ${typeof response.data === "string" ? response.data.length : "N/A"}`,
      );

      // Parse RSC response for news data
      const parsedData = this.parseRSCResponse(response.data);
      logger.info(
        `[TARGET] RSC parsed data: ${parsedData ? parsedData.length : 0} items`,
      );

      return parsedData;
    } catch (error) {
      logger.error("[ERROR] RSC fetch failed:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        logger.debug("[DEBUG] RSC Axios error details:", {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          headers: axiosError.response?.headers,
          dataType: typeof axiosError.response?.data,
          dataLength:
            typeof axiosError.response?.data === "string"
              ? axiosError.response?.data.length
              : "N/A",
          dataPreview:
            typeof axiosError.response?.data === "string"
              ? axiosError.response?.data.substring(0, 200) + "..."
              : axiosError.response?.data,
          url: axiosError.config?.url,
          requestHeaders: axiosError.config?.headers,
        });
      }

      return null;
    }
  }

  private async fetchNewsViaHTML(): Promise<NLobbyAnnouncement[] | null> {
    try {
      logger.info("[INFO] Starting HTML fetch approach...");
      logger.info(
        "[COOKIE] HTML cookies:",
        this.httpClient.defaults.headers.Cookie ? "present" : "missing",
      );

      const response = await this.httpClient.get("/news", {
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
        },
        withCredentials: true,
      });

      logger.info(`[SUCCESS] HTML response status: ${response.status}`);
      logger.debug(`[DATA] HTML response type: ${typeof response.data}`);
      logger.info(
        `[SIZE] HTML response length: ${typeof response.data === "string" ? response.data.length : "N/A"}`,
      );

      // Enhanced debugging - show actual HTML content samples
      if (typeof response.data === "string") {
        logger.info("[INFO] HTML Content Analysis:");
        logger.info(
          `  - Contains "self.__next_f.push(": ${response.data.includes("self.__next_f.push(")}`,
        );
        logger.info(
          `  - Contains "__NEXT_DATA__": ${response.data.includes("__NEXT_DATA__")}`,
        );
        logger.info(`  - Contains "news": ${response.data.includes("news")}`);
        logger.info(
          `  - Contains "announcements": ${response.data.includes("announcements")}`,
        );
        logger.info(
          `  - Contains "ニュース": ${response.data.includes("ニュース")}`,
        );
        logger.info(
          `  - Contains "お知らせ": ${response.data.includes("お知らせ")}`,
        );

        // Show first 1000 characters for debugging
        logger.debug("[DATA] HTML Content Sample (first 1000 chars):");
        logger.info(response.data.substring(0, 1000));
        logger.info("...");

        // Show last 1000 characters for debugging
        logger.debug("[DATA] HTML Content Sample (last 1000 chars):");
        logger.info("...");
        logger.info(
          response.data.substring(Math.max(0, response.data.length - 1000)),
        );

        // Check if we got a login page instead of the news page
        if (
          response.data.includes("ログイン") ||
          response.data.includes("login") ||
          response.data.includes("sign-in") ||
          response.data.includes("auth")
        ) {
          logger.error(
            "[BLOCKED] Received login page instead of news page - session may be expired",
          );
          return null;
        }

        // Check for other indicators
        if (
          response.data.includes("Unauthorized") ||
          response.data.includes("Access Denied")
        ) {
          logger.error("[BLOCKED] Access denied - insufficient permissions");
          return null;
        }
      }

      const parsedNews = this.parseNewsFromHtml(response.data);
      logger.info(`[TARGET] HTML parsed news: ${parsedNews.length} items`);

      return parsedNews;
    } catch (error) {
      logger.error("[ERROR] HTML fetch failed:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        logger.debug("[DEBUG] HTML Axios error details:", {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          headers: axiosError.response?.headers,
          dataType: typeof axiosError.response?.data,
          dataLength:
            typeof axiosError.response?.data === "string"
              ? axiosError.response?.data.length
              : "N/A",
          containsLogin:
            typeof axiosError.response?.data === "string"
              ? axiosError.response?.data.includes("ログイン")
              : false,
          url: axiosError.config?.url,
        });
      }

      return null;
    }
  }

  private transformNewsToAnnouncements(newsData: any[]): NLobbyAnnouncement[] {
    logger.info(
      `Transforming ${newsData.length} news items to announcements...`,
    );

    return newsData.map((item, index) => {
      // Handle various date formats that might exist in the data
      let publishedDate = new Date();
      if (item.publishedAt) {
        publishedDate = new Date(item.publishedAt);
      } else if (item.createdAt) {
        publishedDate = new Date(item.createdAt);
      } else if (item.updatedAt) {
        publishedDate = new Date(item.updatedAt);
      } else if (item.date) {
        publishedDate = new Date(item.date);
      }

      // Handle various title formats
      const title =
        item.title ||
        item.name ||
        item.subject ||
        item.heading ||
        `News Item ${index + 1}`;

      // Handle various content formats
      const content =
        item.content ||
        item.description ||
        item.body ||
        item.text ||
        item.summary ||
        "";

      // Handle various category formats
      const category =
        item.category ||
        item.menuName ||
        item.type ||
        item.classification ||
        "General";

      // Determine priority based on various indicators
      let priority: "high" | "medium" | "low" = "medium";
      if (
        item.isImportant === true ||
        item.important === true ||
        item.priority === "high" ||
        item.urgent === true
      ) {
        priority = "high";
      } else if (item.priority === "low" || item.minor === true) {
        priority = "low";
      }

      // Generate proper URL in format: baseUrl + /news/ + id
      const newsId = item.id || index;
      const fullUrl = `${CONFIG.nlobby.baseUrl}/news/${newsId}`;

      // Build the announcement object, preserving original properties
      const announcement: NLobbyAnnouncement = {
        id: item.id?.toString() || index.toString(),
        title,
        content,
        publishedAt: publishedDate,
        category,
        priority,
        targetAudience: item.targetAudience || ["student"],
        url: fullUrl,
        // Preserve original properties for debugging and future use
        menuName: item.menuName,
        isImportant: item.isImportant,
        isUnread: item.isUnread,
        // Add any additional properties from the original item
        ...Object.fromEntries(
          Object.entries(item).filter(
            ([key]) =>
              ![
                "id",
                "title",
                "content",
                "publishedAt",
                "category",
                "priority",
                "url",
              ].includes(key),
          ),
        ),
      };

      return announcement;
    });
  }

  private parseRSCResponse(rscData: string): any[] | null {
    try {
      logger.info("[INFO] Parsing RSC response...");
      logger.debug(`[SIZE] RSC data length: ${rscData.length}`);

      // RSC responses can be in different formats
      // Try multiple parsing approaches

      // 1. Direct JSON objects
      const jsonPatterns = [
        /\{[^}]*"news"[^}]*\}/g,
        /\{[^}]*"announcements"[^}]*\}/g,
        /\{[^}]*"data"[^}]*\}/g,
        /\{[^}]*"items"[^}]*\}/g,
        /\{[^}]*"list"[^}]*\}/g,
        /\{[^}]*"content"[^}]*\}/g,
      ];

      for (const pattern of jsonPatterns) {
        const matches = rscData.match(pattern);
        if (matches) {
          logger.info(
            `[INFO] Found ${matches.length} JSON matches for pattern: ${pattern.source}`,
          );
          for (const match of matches) {
            try {
              const newsData = JSON.parse(match);
              if (newsData) {
                // Look for arrays in the parsed data
                const arrays = [];
                for (const key of Object.keys(newsData)) {
                  if (
                    Array.isArray(newsData[key]) &&
                    newsData[key].length > 0
                  ) {
                    arrays.push(newsData[key]);
                  }
                }
                if (arrays.length > 0) {
                  logger.info(
                    `[SUCCESS] Found ${arrays[0].length} items in RSC JSON`,
                  );
                  return arrays[0];
                }
              }
            } catch (e) {
              logger.info(
                `[WARNING] Failed to parse JSON match: ${e instanceof Error ? e.message : "Unknown error"}`,
              );
            }
          }
        }
      }

      // 2. Array patterns directly
      const arrayPatterns = [/\[(?:[^[\]]*|\[[^\]]*\])*\]/g];

      for (const pattern of arrayPatterns) {
        const matches = rscData.match(pattern);
        if (matches) {
          logger.info(`[INFO] Found ${matches.length} array matches`);
          for (const match of matches) {
            try {
              const arrayData = JSON.parse(match);
              if (Array.isArray(arrayData) && arrayData.length > 0) {
                // Check if this looks like news data
                const firstItem = arrayData[0];
                if (
                  firstItem &&
                  typeof firstItem === "object" &&
                  (firstItem.title ||
                    firstItem.name ||
                    firstItem.content ||
                    firstItem.publishedAt)
                ) {
                  logger.info(
                    `[SUCCESS] Found news array in RSC with ${arrayData.length} items`,
                  );
                  return arrayData;
                }
              }
            } catch (e) {
              logger.info(
                `[WARNING] Failed to parse array match: ${e instanceof Error ? e.message : "Unknown error"}`,
              );
            }
          }
        }
      }

      // 3. Streamed RSC format (React Server Components streaming)
      const streamedMatches = rscData.match(/\d+:(.+?)(?=\n\d+:|$)/g);
      if (streamedMatches) {
        logger.info(
          `[INFO] Found ${streamedMatches.length} streamed RSC chunks`,
        );
        for (const chunk of streamedMatches) {
          try {
            const contentMatch = chunk.match(/\d+:(.+)/);
            if (contentMatch) {
              const content = contentMatch[1];
              if (
                content.includes("news") ||
                content.includes("announcements")
              ) {
                logger.info(
                  `[INFO] Found news-related streamed chunk: ${content.substring(0, 100)}...`,
                );
                // Try to extract JSON from the chunk
                const jsonMatch = content.match(/\{.*\}/);
                if (jsonMatch) {
                  const parsedData = JSON.parse(jsonMatch[0]);
                  if (parsedData && Array.isArray(parsedData.news)) {
                    logger.info(
                      `[SUCCESS] Found news in streamed RSC with ${parsedData.news.length} items`,
                    );
                    return parsedData.news;
                  }
                }
              }
            }
          } catch (e) {
            logger.info(
              `[WARNING] Failed to parse streamed chunk: ${e instanceof Error ? e.message : "Unknown error"}`,
            );
          }
        }
      }

      logger.info("[WARNING] No valid news data found in RSC response");
      return null;
    } catch (error) {
      logger.error("[ERROR] Error parsing RSC response:", error);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    logger.info("[INFO] Running N Lobby API health check...");
    logger.debug("[STATUS] Authentication status:", this.getCookieStatus());

    // Define health check tests in order of priority
    const healthCheckTests = [
      {
        name: "tRPC lightweight endpoint",
        test: async () => {
          try {
            // Test a simple tRPC endpoint that should work if authenticated
            const result = await this.trpcClient.getUnreadNewsCount();
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
            const trpcHealthy = await this.trpcClient.healthCheck();
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
            const response = await this.httpClient.get("/news", {
              headers: {
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
              withCredentials: true,
              timeout: 8000,
            });

            if (response.status === 200 && typeof response.data === "string") {
              // Check if we got an actual news page (not login page)
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
        name: "Next.js metadata extraction",
        test: async () => {
          try {
            const metadata = await this.extractNextJsMetadata();
            return metadata !== null;
          } catch {
            return false;
          }
        },
      },
      {
        name: "Basic server connectivity",
        test: async () => {
          try {
            const pingResponse = await this.httpClient.get("/", {
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

    // Run health checks in order
    for (let i = 0; i < healthCheckTests.length; i++) {
      const test = healthCheckTests[i];
      logger.info(`[STEP${i + 1}] Testing ${test.name}...`);

      try {
        const result = await test.test();
        if (result) {
          logger.info(`[SUCCESS] ${test.name} passed`);

          // If any of the first 3 tests pass, we're in good shape
          if (i < 3) {
            logger.info(
              "[SUCCESS] Health check passed - authentication and connectivity verified",
            );
            return true;
          }

          // If only basic connectivity works, warn but still pass
          logger.info(
            "[WARNING] Health check passed with limited functionality - authentication may be required",
          );
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

    // Final diagnostic
    logger.info("[INFO] Final diagnostic:");
    const hasHttpCookies = !!this.httpClient.defaults.headers.Cookie;
    const hasNextAuthCookies = this.nextAuth.isAuthenticated();
    const hasTrpcCookies = !!(this.trpcClient as any).allCookies;

    if (!hasHttpCookies && !hasNextAuthCookies && !hasTrpcCookies) {
      logger.info(
        "[ERROR] No authentication cookies found - run interactive_login first",
      );
    } else if (hasHttpCookies && hasNextAuthCookies && hasTrpcCookies) {
      logger.info(
        "[ERROR] Authentication cookies present but all endpoints failed - server or network issue",
      );
    } else {
      logger.info(
        "[ERROR] Partial authentication state - cookie synchronization issue",
      );
    }

    return false;
  }

  async debugConnection(endpoint: string = "/news"): Promise<string> {
    const debugReport: string[] = [];

    debugReport.push("[INFO] N Lobby Connection Debug Report");
    debugReport.push("=".repeat(50));
    debugReport.push("");

    // 1. Authentication Status
    debugReport.push("[STATUS] Authentication Status:");
    const authStatus = this.getCookieStatus();
    debugReport.push(authStatus);
    debugReport.push("");

    // 2. Basic Connectivity Test
    debugReport.push(`[NETWORK] Testing Basic Connectivity to ${endpoint}:`);
    try {
      const startTime = Date.now();
      const response = await this.httpClient.get(endpoint, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": CONFIG.userAgent,
        },
        withCredentials: true,
        timeout: 10000,
      });
      const endTime = Date.now();

      debugReport.push(
        `[SUCCESS] Response received (${endTime - startTime}ms)`,
      );
      debugReport.push(
        `[STATUS] Status: ${response.status} ${response.statusText}`,
      );
      debugReport.push(
        `[SIZE] Content Length: ${response.data?.length || "unknown"}`,
      );
      debugReport.push(
        `[DATA] Content Type: ${response.headers["content-type"] || "unknown"}`,
      );

      // Check response headers
      debugReport.push("[HEADERS] Response Headers:");
      const importantHeaders = [
        "set-cookie",
        "location",
        "cache-control",
        "server",
      ];
      for (const header of importantHeaders) {
        if (response.headers[header]) {
          debugReport.push(`   ${header}: ${response.headers[header]}`);
        }
      }

      // Check for authentication indicators
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

        if (
          data.includes("next-action") ||
          data.includes("next-router-state")
        ) {
          debugReport.push("[SUCCESS] Contains Next.js metadata");
        }

        if (data.includes("__next_data__")) {
          debugReport.push("[SUCCESS] Contains Next.js data");
        }
      }
    } catch (error) {
      debugReport.push("[ERROR] Basic connectivity failed");
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        debugReport.push(
          `[STATUS] Error Status: ${axiosError.response?.status || "unknown"}`,
        );
        debugReport.push(
          `[DATA] Error Message: ${axiosError.message || "unknown"}`,
        );
      } else {
        debugReport.push(
          `[DATA] Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    debugReport.push("");

    // 3. tRPC Endpoint Test
    debugReport.push("[DEBUG] Testing tRPC Endpoints:");
    try {
      const trpcUrl = `/api/trpc/news.getUnreadNewsCount`;
      const trpcResponse = await this.httpClient.get(trpcUrl, {
        baseURL: this.httpClient.defaults.baseURL,
        withCredentials: true,
        timeout: 5000,
      });

      debugReport.push(`[SUCCESS] tRPC endpoint accessible`);
      debugReport.push(`[STATUS] Status: ${trpcResponse.status}`);
      debugReport.push(
        `[DATA] Response: ${JSON.stringify(trpcResponse.data).substring(0, 200)}...`,
      );
    } catch (trpcError) {
      debugReport.push("[ERROR] tRPC endpoint failed");
      if (
        trpcError &&
        typeof trpcError === "object" &&
        "response" in trpcError
      ) {
        const axiosError = trpcError as any;
        debugReport.push(
          `[STATUS] Error Status: ${axiosError.response?.status || "unknown"}`,
        );
        debugReport.push(
          `[DATA] Error Data: ${JSON.stringify(axiosError.response?.data || {}).substring(0, 200)}...`,
        );
      }
    }

    debugReport.push("");

    // 4. Network Information
    debugReport.push("[NETWORK] Network Information:");
    debugReport.push(`[URL] Base URL: ${this.httpClient.defaults.baseURL}`);
    debugReport.push(
      `[TIMEOUT] Timeout: ${this.httpClient.defaults.timeout}ms`,
    );
    debugReport.push(
      `[COOKIE] Credentials: ${this.httpClient.defaults.withCredentials ? "included" : "omitted"}`,
    );

    debugReport.push("");
    debugReport.push("=".repeat(50));
    debugReport.push("[TARGET] Recommendations:");

    const hasHttpCookies = !!this.httpClient.defaults.headers.Cookie;
    const hasNextAuthCookies = this.nextAuth.isAuthenticated();

    if (!hasHttpCookies && !hasNextAuthCookies) {
      debugReport.push("1. Run interactive_login to authenticate");
    } else if (hasHttpCookies && hasNextAuthCookies) {
      debugReport.push(
        "1. Authentication looks good - issue may be server-side",
      );
      debugReport.push("2. Try different endpoints or wait and retry");
    }

    return debugReport.join("\n");
  }

  async testPageContent(
    endpoint: string = "/news",
    maxLength: number = 1000,
  ): Promise<string> {
    try {
      logger.info(`[INFO] Testing page content for ${endpoint}...`);

      const response = await this.httpClient.get(endpoint, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
          "User-Agent": CONFIG.userAgent,
        },
        withCredentials: true,
        timeout: 10000,
      });

      logger.info(
        `[SUCCESS] Page content retrieved: ${response.status} ${response.statusText}`,
      );
      logger.info(
        `[SIZE] Content length: ${response.data?.length || "unknown"}`,
      );

      if (typeof response.data === "string") {
        const content = response.data;
        const sample = content.substring(0, maxLength);

        // Basic analysis
        const analysis = [];
        analysis.push(`Status: ${response.status} ${response.statusText}`);
        analysis.push(`Content Length: ${content.length} characters`);
        analysis.push(
          `Content Type: ${response.headers["content-type"] || "unknown"}`,
        );
        analysis.push("");

        // Check for authentication indicators
        const lowerContent = content.toLowerCase();
        if (
          lowerContent.includes("ログイン") ||
          lowerContent.includes("login")
        ) {
          analysis.push(
            "[WARNING] WARNING: Page contains login keywords - may not be authenticated",
          );
        } else if (
          lowerContent.includes("news") ||
          lowerContent.includes("お知らせ")
        ) {
          analysis.push("[SUCCESS] Page appears to contain news content");
        }

        if (
          lowerContent.includes("unauthorized") ||
          lowerContent.includes("access denied")
        ) {
          analysis.push("[BLOCKED] WARNING: Access denied detected");
        }

        // Check for typical N Lobby page elements
        if (
          lowerContent.includes("n lobby") ||
          lowerContent.includes("nlobby")
        ) {
          analysis.push("[SUCCESS] Confirmed N Lobby page");
        }

        if (
          lowerContent.includes("next-action") ||
          lowerContent.includes("__next_data__")
        ) {
          analysis.push("[SUCCESS] Next.js application detected");
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
      logger.error(
        `[ERROR] Failed to test page content for ${endpoint}:`,
        error,
      );

      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        return `Error ${axiosError.response?.status || "unknown"}: ${axiosError.message || "Unknown error"}\n\nResponse data: ${JSON.stringify(axiosError.response?.data || {}, null, 2)}`;
      }

      return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  async testTrpcEndpoint(method: string, params?: any): Promise<any> {
    try {
      logger.info(`[INFO] Testing tRPC endpoint: ${method}`);
      logger.debug(`[STATUS] Params:`, params);
      logger.debug(`[COOKIE] Authentication status:`, this.getCookieStatus());

      const result = await this.trpcClient.call(method, params);

      logger.info(`[SUCCESS] tRPC endpoint ${method} succeeded`);
      logger.debug(`[DATA] Result:`, result);

      return {
        success: true,
        method,
        params,
        result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`[ERROR] tRPC endpoint ${method} failed:`, error);

      const errorInfo: any = {
        success: false,
        method,
        params,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };

      // Add detailed error information if available
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as any;
        errorInfo.status = axiosError.response?.status;
        errorInfo.statusText = axiosError.response?.statusText;
        errorInfo.responseData = axiosError.response?.data;
        errorInfo.headers = axiosError.response?.headers;
      }

      return errorInfo;
    }
  }

  async markNewsAsRead(id: string): Promise<any> {
    logger.info(`[INFO] Marking news article ${id} as read`);
    try {
      const result = await this.httpClient.post(
        "/api/trpc/news.upsertBrowsingHistory",
        `"${id}"`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: this.nextAuth.getCookieHeader(),
            Referer: `https://nlobby.nnn.ed.jp/news/${id}`,
          },
        },
      );

      logger.info(`[SUCCESS] News article ${id} marked as read`);
      return result.data;
    } catch (error) {
      logger.error(`[ERROR] Failed to mark news ${id} as read:`, error);
      throw error;
    }
  }

  async getRequiredCourses(): Promise<NLobbyRequiredCourse[]> {
    logger.info("[INFO] Starting getRequiredCourses...");
    logger.info(
      "[STATUS] Current authentication status:",
      this.getCookieStatus(),
    );

    try {
      logger.info("[INFO] Fetching required courses via tRPC client...");

      // Call the known endpoint
      const response = await this.trpcClient.call(
        "requiredCourse.getRequiredCourses",
      );

      logger.debug("[DEBUG] Raw response type:", typeof response);
      logger.info(
        "[DEBUG] Raw response keys:",
        response ? Object.keys(response) : "null",
      );
      logger.info(
        "[DEBUG] Full response structure:",
        JSON.stringify(response, null, 2),
      );

      // Check for different possible response formats
      let educationData: EducationData | null = null;

      // Format 1: Expected format { result: { data: EducationData } }
      if (response && response.result && response.result.data) {
        logger.info(
          "[SUCCESS] Found data in expected format: response.result.data",
        );
        educationData = response.result.data;
      }
      // Format 2: Direct data format { data: EducationData }
      else if (response && response.data) {
        logger.info(
          "[SUCCESS] Found data in alternative format: response.data",
        );
        educationData = response.data;
      }
      // Format 3: Direct EducationData format
      else if (
        response &&
        response.educationProcessName &&
        response.termYears
      ) {
        logger.info(
          "[SUCCESS] Found data in direct format: response as EducationData",
        );
        educationData = response as EducationData;
      }
      // Format 4: Check if response is directly an array of courses
      else if (response && Array.isArray(response)) {
        logger.info("[SUCCESS] Found data as direct array of courses");
        return response;
      }
      // Format 5: Check for other possible nested structures
      else if (response) {
        logger.info(
          "[INFO] Searching for education data in nested structures...",
        );

        // Search for educationProcessName in nested objects
        const searchResult = this.findEducationDataInObject(response);
        if (searchResult) {
          logger.info("[SUCCESS] Found education data in nested structure");
          educationData = searchResult;
        }
      }

      if (educationData) {
        logger.info(
          `[SUCCESS] Retrieved education data for: ${educationData.educationProcessName}`,
        );
        logger.info(
          `[INFO] Found ${educationData.termYears.length} term years`,
        );

        // Flatten all courses from all term years
        const allCourses = this.transformEducationDataToCourses(educationData);
        logger.info(`[SUCCESS] Total courses extracted: ${allCourses.length}`);

        return allCourses;
      } else {
        logger.info("[WARNING] Invalid response structure from tRPC endpoint");
        logger.info("[INFO] Response type:", typeof response);
        logger.info(
          "[INFO] Response structure:",
          response ? Object.keys(response) : "null",
        );
        logger.info(
          "[DEBUG] Full response for debugging:",
          JSON.stringify(response, null, 2),
        );

        throw new Error(`Unexpected response format from required courses endpoint.
Response type: ${typeof response}
Response keys: ${response ? Object.keys(response).join(", ") : "none"}
Please check the API documentation or contact support.`);
      }
    } catch (error) {
      logger.error("[ERROR] getRequiredCourses failed:", error);

      // Provide detailed error information
      if (error instanceof Error) {
        throw error; // Re-throw our detailed error
      }

      throw new Error(
        `Failed to fetch required courses: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private findEducationDataInObject(
    obj: any,
    path: string = "",
  ): EducationData | null {
    if (!obj || typeof obj !== "object") return null;

    // Check if this object has education data properties
    if (
      obj.educationProcessName &&
      obj.termYears &&
      Array.isArray(obj.termYears)
    ) {
      logger.info(`[INFO] Found education data at path: ${path}`);
      return obj as EducationData;
    }

    // Recursively search through object properties
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object") {
        const searchPath = path ? `${path}.${key}` : key;
        const found = this.findEducationDataInObject(value, searchPath);
        if (found) return found;
      }
    }

    return null;
  }

  private transformEducationDataToCourses(
    educationData: EducationData,
  ): NLobbyRequiredCourse[] {
    logger.info(
      `[INFO] Transforming education data with ${educationData.termYears.length} term years...`,
    );

    const allCourses: NLobbyRequiredCourse[] = [];

    for (const termYear of educationData.termYears) {
      logger.info(
        `[INFO] Processing ${termYear.grade} (${termYear.termYear}) with ${termYear.courses.length} courses`,
      );

      for (const course of termYear.courses) {
        // Calculate additional computed fields
        const progressPercentage = this.calculateProgressPercentage(
          course.report,
        );
        const averageScore = this.calculateAverageScore(course.reportDetails);
        const isCompleted = course.acquired.acquisitionStatus === 1;
        const isInProgress =
          course.subjectStatus === 1 || course.subjectStatus === 2;

        // Create enhanced course object with computed fields
        const enhancedCourse: NLobbyRequiredCourse = {
          ...course,
          termYear: termYear.termYear,
          grade: termYear.grade,
          term: termYear.term,
          progressPercentage,
          averageScore,
          isCompleted,
          isInProgress,
        };

        allCourses.push(enhancedCourse);
        logger.info(
          `[SUCCESS] Added course: ${course.subjectName} (${course.curriculumName}) - ${termYear.grade}`,
        );
      }
    }

    logger.info(`[TARGET] Total courses processed: ${allCourses.length}`);
    return allCourses;
  }

  private calculateProgressPercentage(report: CourseReport): number {
    if (report.allCount === 0) return 0;
    return Math.round((report.count / report.allCount) * 100);
  }

  private calculateAverageScore(
    reportDetails: CourseReportDetail[],
  ): number | null {
    const scoresWithValues = reportDetails.filter(
      (detail) => detail.score !== null && detail.progress === 100,
    );

    if (scoresWithValues.length === 0) return null;

    const totalScore = scoresWithValues.reduce(
      (sum, detail) => sum + (detail.score || 0),
      0,
    );
    return Math.round(totalScore / scoresWithValues.length);
  }
}
