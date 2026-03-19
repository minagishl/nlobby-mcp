import type { ApiContext } from "./context.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type {
  NLobbyScheduleItem,
  GoogleCalendarEvent,
  CalendarDateRange,
  CalendarType,
  CalendarApiResponse,
  ApiResponseData,
  CalendarEvent,
  AxiosError,
  LobbyCalendarFilter,
} from "../types.js";

// ---- Private helpers ----

function getDefaultDateRange(): CalendarDateRange {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

function convertGoogleCalendarEventsToScheduleItems(
  events: unknown[],
): NLobbyScheduleItem[] {
  return events.map((event) => {
    const calendarEvent = event as CalendarEvent;

    let startTime: Date;
    let endTime: Date;

    if (calendarEvent.startDateTime) {
      startTime = new Date(calendarEvent.startDateTime);
      endTime = calendarEvent.endDateTime
        ? new Date(calendarEvent.endDateTime)
        : new Date(startTime.getTime() + 60 * 60 * 1000);
    } else if (calendarEvent.start) {
      if (calendarEvent.start.dateTime) {
        startTime = new Date(calendarEvent.start.dateTime);
      } else if (calendarEvent.start.date) {
        startTime = new Date(calendarEvent.start.date + "T00:00:00");
      } else {
        startTime = new Date();
      }

      if (calendarEvent.end && calendarEvent.end.dateTime) {
        endTime = new Date(calendarEvent.end.dateTime);
      } else if (calendarEvent.end && calendarEvent.end.date) {
        endTime = new Date(calendarEvent.end.date + "T23:59:59");
        endTime.setDate(endTime.getDate() - 1);
      } else {
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }
    } else {
      startTime = new Date();
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    let type: "class" | "event" | "meeting" | "exam" = "event";
    const summary = (calendarEvent.summary || "").toLowerCase();

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

    let participants: string[] = [];
    if (calendarEvent.attendees && Array.isArray(calendarEvent.attendees)) {
      participants = calendarEvent.attendees
        .map((attendee) => attendee.email)
        .filter(Boolean);
    }

    const scheduleItem: NLobbyScheduleItem = {
      id:
        calendarEvent.id ||
        calendarEvent.microCmsId ||
        Math.random().toString(),
      title: calendarEvent.summary || calendarEvent.title || "No Title",
      description: calendarEvent.description || "",
      startTime,
      endTime,
      location: calendarEvent.location || "",
      type,
      participants,
    };

    return scheduleItem;
  });
}

// ---- Public module functions ----

export async function getGoogleCalendarEvents(
  ctx: ApiContext,
  calendarType: CalendarType,
  dateRange?: CalendarDateRange,
): Promise<GoogleCalendarEvent[]> {
  // Import CalendarType enum value
  const { CalendarType: CT } = await import("../types.js");

  try {
    logger.info(
      `[INFO] Fetching Google Calendar events for ${calendarType}...`,
    );

    const defaultRange = getDefaultDateRange();
    const range = dateRange || defaultRange;

    logger.info(
      `[INFO] Date range: ${range.from.toISOString()} to ${range.to.toISOString()}`,
    );

    const endpoint =
      calendarType === CT.PERSONAL
        ? "/api/trpc/calendar.getGoogleCalendarEvents"
        : "/api/trpc/calendar.getLobbyCalendarEvents";

    const input = {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    };

    const response = await ctx.httpClient.get<CalendarApiResponse>(endpoint, {
      params: { input: JSON.stringify(input) },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      withCredentials: true,
    });

    let calendarEvents: GoogleCalendarEvent[] = [];
    const responseData = response.data as ApiResponseData;

    if (responseData?.result?.data?.gcal) {
      calendarEvents = responseData.result.data.gcal;
    } else if (responseData?.result?.data?.lcal) {
      calendarEvents = responseData.result.data.lcal;
    } else if (
      responseData?.result?.data &&
      Array.isArray(responseData.result.data)
    ) {
      calendarEvents = responseData.result.data as GoogleCalendarEvent[];
    } else if (responseData?.data?.gcal) {
      calendarEvents = responseData.data.gcal;
    } else if (responseData?.data && Array.isArray(responseData.data)) {
      calendarEvents = responseData.data as GoogleCalendarEvent[];
    } else if (responseData?.gcal) {
      calendarEvents = responseData.gcal;
    } else if (Array.isArray(responseData)) {
      calendarEvents = responseData as GoogleCalendarEvent[];
    } else {
      throw new Error(
        `Invalid calendar response format for ${calendarType} calendar.`,
      );
    }

    if (!Array.isArray(calendarEvents)) {
      throw new Error(
        `Calendar events is not an array: ${typeof calendarEvents}`,
      );
    }

    return calendarEvents;
  } catch (error) {
    logger.error(`[ERROR] Error fetching Google Calendar events:`, error);

    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        throw new Error(
          "Authentication required. Please use the set_cookies tool to provide valid NextAuth.js session cookies from N Lobby.",
        );
      }
    }

    throw error;
  }
}

export async function getSchedule(
  ctx: ApiContext,
  calendarType: CalendarType,
  dateRange?: CalendarDateRange,
): Promise<NLobbyScheduleItem[]> {
  try {
    logger.info(`[INFO] Fetching ${calendarType} calendar events...`);

    const events = await getGoogleCalendarEvents(ctx, calendarType, dateRange);
    const convertedEvents = convertGoogleCalendarEventsToScheduleItems(events);

    logger.info(`[SUCCESS] Retrieved ${convertedEvents.length} schedule items`);
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

export async function getScheduleByDate(
  ctx: ApiContext,
  date?: string,
): Promise<NLobbyScheduleItem[]> {
  const { CalendarType: CT } = await import("../types.js");

  let dateRange: CalendarDateRange;

  if (date) {
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      throw new Error(`Invalid date format: ${date}`);
    }

    const from = new Date(targetDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(targetDate);
    to.setHours(23, 59, 59, 999);

    dateRange = { from, to };
  } else {
    dateRange = getDefaultDateRange();
  }

  return getSchedule(ctx, CT.PERSONAL, dateRange);
}

export async function testCalendarEndpoints(
  ctx: ApiContext,
  dateRange?: CalendarDateRange,
): Promise<{
  personal: { success: boolean; count: number; error?: string };
  school: { success: boolean; count: number; error?: string };
}> {
  const { CalendarType: CT } = await import("../types.js");

  const range = dateRange || getDefaultDateRange();
  const results: {
    personal: { success: boolean; count: number; error?: string };
    school: { success: boolean; count: number; error?: string };
  } = {
    personal: { success: false, count: 0 },
    school: { success: false, count: 0 },
  };

  try {
    const personalEvents = await getGoogleCalendarEvents(
      ctx,
      CT.PERSONAL,
      range,
    );
    results.personal.success = true;
    results.personal.count = personalEvents.length;
  } catch (error) {
    results.personal.error =
      error instanceof Error ? error.message : "Unknown error";
  }

  try {
    const schoolEvents = await getGoogleCalendarEvents(ctx, CT.SCHOOL, range);
    results.school.success = true;
    results.school.count = schoolEvents.length;
  } catch (error) {
    results.school.error =
      error instanceof Error ? error.message : "Unknown error";
  }

  return results;
}

export async function getLobbyCalendarFilters(
  ctx: ApiContext,
): Promise<LobbyCalendarFilter[]> {
  logger.info("[INFO] Fetching lobby calendar filters...");
  try {
    const result = await ctx.trpcClient.call<{
      result?: { label?: string; filter?: LobbyCalendarFilter[] };
    }>("calendar.getLobbyCalendarFilters", {});
    logger.info("[SUCCESS] getLobbyCalendarFilters succeeded");
    if (result && typeof result === "object" && "result" in result) {
      const inner = (result as { result?: { filter?: LobbyCalendarFilter[] } })
        .result;
      return inner?.filter || [];
    }
    return Array.isArray(result) ? (result as LobbyCalendarFilter[]) : [];
  } catch (error) {
    logger.error("[ERROR] getLobbyCalendarFilters failed:", error);
    throw error;
  }
}

// ---- Date range helpers ----

export function createDateRange(
  fromDate: string | Date,
  toDate: string | Date,
): CalendarDateRange {
  const from = typeof fromDate === "string" ? new Date(fromDate) : fromDate;
  const to = typeof toDate === "string" ? new Date(toDate) : toDate;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error("Invalid date format provided");
  }

  const diffTime = to.getTime() - from.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  if (diffDays < 1) {
    throw new Error(
      'To date must be at least 1 day after from date. For single day queries, use period="today" or single from_date parameter.',
    );
  }

  return { from, to };
}

export function createSingleDayRange(date: string | Date): CalendarDateRange {
  const targetDate = typeof date === "string" ? new Date(date) : date;

  if (isNaN(targetDate.getTime())) {
    throw new Error("Invalid date format provided");
  }

  const from = new Date(targetDate);
  from.setHours(0, 0, 0, 0);

  const to = new Date(targetDate);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

export function createWeekDateRange(
  startDate?: string | Date,
): CalendarDateRange {
  const start = startDate
    ? typeof startDate === "string"
      ? new Date(startDate)
      : startDate
    : new Date();

  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { from: start, to: end };
}

export function createMonthDateRange(
  year?: number,
  month?: number,
): CalendarDateRange {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month !== undefined ? month : now.getMonth();

  const from = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const to = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  return { from, to };
}
