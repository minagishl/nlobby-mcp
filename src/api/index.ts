import { HttpClient } from "../http-client.js";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { NextAuthHandler } from "../auth/nextauth.js";
import { TRPCClient } from "../trpc-client.js";
import type { ApiContext } from "./context.js";
import {
  getNews,
  getNewsDetail,
  markNewsAsRead,
  getUnreadNewsInfo,
  downloadNewsAttachment,
} from "./news.js";
import {
  getSchedule as _getSchedule,
  getGoogleCalendarEvents,
  getScheduleByDate as _getScheduleByDate,
  testCalendarEndpoints as _testCalendarEndpoints,
  getLobbyCalendarFilters as _getLobbyCalendarFilters,
  createDateRange,
  createSingleDayRange,
  createWeekDateRange,
  createMonthDateRange,
} from "./schedule.js";
import {
  getRequiredCourses as _getRequiredCourses,
  getLearningResources as _getLearningResources,
  isExamDay as _isExamDay,
  finishExamDayMode as _finishExamDayMode,
  getExamOneTimePassword as _getExamOneTimePassword,
} from "./courses.js";
import {
  getUserInfo as _getUserInfo,
  getAccountInfoFromScript as _getAccountInfoFromScript,
  getStudentCardScreenshot as _getStudentCardScreenshot,
  updateLastAccess as _updateLastAccess,
} from "./account.js";
import {
  getMainNavigations as _getMainNavigations,
  getNotificationMessages as _getNotificationMessages,
  getUserInterests as _getUserInterests,
  getInterestWeights as _getInterestWeights,
} from "./navigation.js";
import {
  healthCheck as _healthCheck,
  debugConnection as _debugConnection,
  testPageContent as _testPageContent,
  testTrpcEndpoint as _testTrpcEndpoint,
} from "./health.js";
import type {
  NLobbySession,
  NLobbyAnnouncement,
  NLobbyNewsDetail,
  NLobbyScheduleItem,
  NLobbyLearningResource,
  NLobbyRequiredCourse,
  NLobbyAccountInfo,
  GoogleCalendarEvent,
  CalendarDateRange,
  CalendarType,
  ExamOneTimePassword,
  NavigationMenuCategory,
  UnreadNewsInfo,
  NotificationMessage,
  UserInterest,
  InterestWeight,
  LobbyCalendarFilter,
} from "../types.js";
import type { NewsListOptions } from "./news.js";

const SESSION_FILE = path.join(os.homedir(), ".nlobby", "session");

function loadSessionFromDisk(): string | null {
  try {
    return fsSync.readFileSync(SESSION_FILE, "utf8");
  } catch {
    return null;
  }
}

export function saveSessionToDisk(cookies: string): void {
  try {
    const dir = path.dirname(SESSION_FILE);
    fsSync.mkdirSync(dir, { recursive: true });
    fsSync.writeFileSync(SESSION_FILE, cookies, "utf8");
  } catch (error) {
    logger.warn("[WARNING] Failed to save session to disk:", error);
  }
}

export class NLobbyApi implements ApiContext {
  httpClient: HttpClient;
  nextAuth: NextAuthHandler;
  trpcClient: TRPCClient;
  private session: NLobbySession | null = null;

  constructor() {
    this.nextAuth = new NextAuthHandler();
    this.trpcClient = new TRPCClient(this.nextAuth);

    this.httpClient = new HttpClient({
      baseURL: CONFIG.nlobby.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": CONFIG.userAgent,
      },
    });

    this.setupInterceptors();

    // Auto-load cookies from disk (for CLI persistence)
    const savedCookies = loadSessionFromDisk();
    if (savedCookies) {
      logger.info("[INFO] Loaded session from disk");
      this.setCookiesInternal(savedCookies);
    }
  }

  private setupInterceptors(): void {
    this.httpClient.interceptors.request.use((config) => {
      if (this.session) {
        config.headers["Authorization"] = `Bearer ${this.session.accessToken}`;
        return config;
      }

      const sessionToken = this.nextAuth.getSessionToken();
      if (sessionToken) {
        config.headers["Authorization"] = `Bearer ${sessionToken}`;
      }

      const csrfToken = this.nextAuth.getCsrfHeaderValue();
      if (csrfToken) {
        config.headers["X-CSRF-Token"] = csrfToken;
      }

      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error): Promise<never> => {
        if (
          error instanceof Error &&
          "response" in error &&
          (error as { response?: { status?: number } }).response?.status ===
            401 &&
          this.session
        ) {
          throw new Error("Authentication expired. Please re-authenticate.");
        }
        return Promise.reject(error) as never;
      },
    );
  }

  private setCookiesInternal(cookies: string): void {
    if (!cookies || cookies.trim() === "") {
      return;
    }
    this.httpClient.defaults.headers["Cookie"] = cookies;
    this.nextAuth.setCookies(cookies);
    this.trpcClient.setAllCookies(cookies);
  }

  setSession(session: NLobbySession): void {
    this.session = session;
  }

  setCookies(cookies: string): void {
    if (!cookies || cookies.trim() === "") {
      logger.warn("[WARNING] Empty cookies provided to setCookies");
      return;
    }

    logger.debug("[COOKIE] Setting cookies for all clients...");

    this.setCookiesInternal(cookies);

    logger.info("[SUCCESS] HTTP client cookies set");
    logger.info("[SUCCESS] NextAuth cookies set");
    logger.info("[SUCCESS] tRPC client cookies set");
  }

  getCookieStatus(): string {
    const hasHttpCookies = !!this.httpClient.defaults.headers["Cookie"];
    const hasNextAuthCookies = this.nextAuth.isAuthenticated();
    const nextAuthCookies = this.nextAuth.getCookies();
    const hasTrpcCookies = !!(
      this.trpcClient as unknown as { allCookies?: string }
    ).allCookies;

    const httpCookieString = this.httpClient.defaults.headers["Cookie"];
    const httpCookieLength =
      typeof httpCookieString === "string" ? httpCookieString.length : 0;
    const trpcCookieLength =
      (this.trpcClient as unknown as { allCookies?: string }).allCookies
        ?.length || 0;
    const nextAuthCookieHeaderLength =
      this.nextAuth.getCookieHeader()?.length || 0;

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

  // ---- News ----
  async getNews(options?: NewsListOptions): Promise<NLobbyAnnouncement[]> {
    return getNews(this, options);
  }

  async getNewsDetail(newsId: string): Promise<NLobbyNewsDetail> {
    return getNewsDetail(this, newsId);
  }

  async markNewsAsRead(id: string): Promise<unknown> {
    return markNewsAsRead(this, id);
  }

  async getUnreadNewsInfo(): Promise<UnreadNewsInfo> {
    return getUnreadNewsInfo(this);
  }

  async downloadNewsAttachment(
    newsId: string,
    attachmentIndex: number = 0,
    outputDir: string = ".",
  ): Promise<string> {
    return downloadNewsAttachment(this, newsId, attachmentIndex, outputDir);
  }

  // ---- Schedule ----
  async getSchedule(
    calendarType: CalendarType,
    dateRange?: CalendarDateRange,
  ): Promise<NLobbyScheduleItem[]> {
    return _getSchedule(this, calendarType, dateRange);
  }

  async getGoogleCalendarEvents(
    calendarType: CalendarType,
    dateRange?: CalendarDateRange,
  ): Promise<GoogleCalendarEvent[]> {
    return getGoogleCalendarEvents(this, calendarType, dateRange);
  }

  async getScheduleByDate(date?: string): Promise<NLobbyScheduleItem[]> {
    return _getScheduleByDate(this, date);
  }

  async testCalendarEndpoints(dateRange?: CalendarDateRange): Promise<{
    personal: { success: boolean; count: number; error?: string };
    school: { success: boolean; count: number; error?: string };
  }> {
    return _testCalendarEndpoints(this, dateRange);
  }

  async getLobbyCalendarFilters(): Promise<LobbyCalendarFilter[]> {
    return _getLobbyCalendarFilters(this);
  }

  createDateRange(
    fromDate: string | Date,
    toDate: string | Date,
  ): CalendarDateRange {
    return createDateRange(fromDate, toDate);
  }

  createSingleDayRange(date: string | Date): CalendarDateRange {
    return createSingleDayRange(date);
  }

  createWeekDateRange(startDate?: string | Date): CalendarDateRange {
    return createWeekDateRange(startDate);
  }

  createMonthDateRange(year?: number, month?: number): CalendarDateRange {
    return createMonthDateRange(year, month);
  }

  // ---- Courses ----
  async getRequiredCourses(): Promise<NLobbyRequiredCourse[]> {
    return _getRequiredCourses(this);
  }

  async getLearningResources(
    subject?: string,
  ): Promise<NLobbyLearningResource[]> {
    return _getLearningResources(this, subject);
  }

  async isExamDay(date?: Date): Promise<boolean> {
    return _isExamDay(this, date);
  }

  async finishExamDayMode(): Promise<boolean> {
    return _finishExamDayMode(this);
  }

  async getExamOneTimePassword(): Promise<ExamOneTimePassword> {
    return _getExamOneTimePassword(this);
  }

  // ---- Account ----
  async getUserInfo(): Promise<unknown> {
    return _getUserInfo(this);
  }

  async getAccountInfoFromScript(
    endpoint: string = "/",
  ): Promise<NLobbyAccountInfo> {
    return _getAccountInfoFromScript(this, endpoint);
  }

  async getStudentCardScreenshot(): Promise<{
    base64: string;
    path: string;
    studentNo: string;
    secureHost: string;
    callbackUrl: string;
    finalUrl: string;
    elementSize?: { width: number; height: number };
  }> {
    return _getStudentCardScreenshot(this);
  }

  async updateLastAccess(): Promise<boolean> {
    return _updateLastAccess(this);
  }

  // ---- Navigation ----
  async getMainNavigations(): Promise<NavigationMenuCategory[]> {
    return _getMainNavigations(this);
  }

  async getNotificationMessages(): Promise<NotificationMessage[]> {
    return _getNotificationMessages(this);
  }

  async getUserInterests(withIcon: boolean = false): Promise<UserInterest[]> {
    return _getUserInterests(this, withIcon);
  }

  async getInterestWeights(): Promise<InterestWeight[]> {
    return _getInterestWeights(this);
  }

  // ---- Health ----
  async healthCheck(): Promise<boolean> {
    return _healthCheck(this);
  }

  async debugConnection(endpoint: string = "/news"): Promise<string> {
    return _debugConnection(this, endpoint);
  }

  async testPageContent(
    endpoint: string = "/news",
    maxLength: number = 1000,
  ): Promise<string> {
    return _testPageContent(this, endpoint, maxLength);
  }

  async testTrpcEndpoint(method: string, params?: unknown): Promise<unknown> {
    return _testTrpcEndpoint(this, method, params);
  }
}
