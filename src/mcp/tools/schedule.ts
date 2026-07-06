import { CalendarType } from "../../types.js";
import { catchError, jsonResult, textResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const scheduleModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_schedule",
        description:
          "Get school schedule for a specific date (backward compatibility)",
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
          return jsonResult(await ctx.api.getScheduleByDate(date));
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_calendar_events",
        description: "Get calendar events with advanced options",
        inputSchema: {
          type: "object",
          properties: {
            calendar_type: {
              type: "string",
              enum: ["personal", "school"],
              description: "Type of calendar to retrieve (personal or school)",
              default: "personal",
            },
            from_date: {
              type: "string",
              description:
                "Start date in YYYY-MM-DD format (optional). If only from_date is provided, it will be treated as a single day.",
            },
            to_date: {
              type: "string",
              description:
                "End date in YYYY-MM-DD format (optional). Must be at least 1 day after from_date when both are provided.",
            },
            period: {
              type: "string",
              enum: ["today", "week", "month"],
              description:
                'Predefined period (optional, overrides from/to dates). Use "today" for single day queries.',
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { calendar_type, from_date, to_date, period } = (args ??
            {}) as {
            calendar_type?: string;
            from_date?: string;
            to_date?: string;
            period?: string;
          };

          const calendarType =
            calendar_type === "school"
              ? CalendarType.SCHOOL
              : CalendarType.PERSONAL;

          let dateRange;
          if (period) {
            switch (period) {
              case "today":
                dateRange = ctx.api.createSingleDayRange(new Date());
                break;
              case "week":
                dateRange = ctx.api.createWeekDateRange();
                break;
              case "month":
                dateRange = ctx.api.createMonthDateRange();
                break;
              default:
                throw new Error(`Invalid period: ${period}`);
            }
          } else if (from_date && to_date) {
            dateRange = ctx.api.createDateRange(from_date, to_date);
          } else if (from_date) {
            dateRange = ctx.api.createSingleDayRange(from_date);
          }

          const schedule = await ctx.api.getSchedule(calendarType, dateRange);
          const rangeLabel = dateRange
            ? ` from ${dateRange.from.toDateString()} to ${dateRange.to.toDateString()}`
            : " (current week)";

          return textResult(
            `[DATE] Calendar Events (${calendar_type || "personal"})${rangeLabel}\n\n${JSON.stringify(schedule, null, 2)}`,
          );
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "test_calendar_endpoints",
        description: "Test both personal and school calendar endpoints",
        inputSchema: {
          type: "object",
          properties: {
            from_date: {
              type: "string",
              description:
                "Start date in YYYY-MM-DD format (optional). If only from_date is provided, it will be treated as a single day.",
            },
            to_date: {
              type: "string",
              description:
                "End date in YYYY-MM-DD format (optional). Must be at least 1 day after from_date when both are provided.",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { from_date, to_date } = (args ?? {}) as {
            from_date?: string;
            to_date?: string;
          };

          let dateRange;
          if (from_date && to_date) {
            dateRange = ctx.api.createDateRange(from_date, to_date);
          } else if (from_date) {
            dateRange = ctx.api.createSingleDayRange(from_date);
          }

          const testResults = await ctx.api.testCalendarEndpoints(dateRange);
          const reportLines = [
            "[TEST] Calendar Endpoints Test Results",
            "=".repeat(40),
            "",
            `[DATE] Test Period: ${
              dateRange
                ? `${dateRange.from.toDateString()} to ${dateRange.to.toDateString()}`
                : "Current week (default)"
            }`,
            "",
            "[PERSONAL] Personal Calendar:",
            `   Status: ${testResults.personal.success ? "[SUCCESS] Success" : "[ERROR] Failed"}`,
            `   Events: ${testResults.personal.count}`,
            testResults.personal.error
              ? `   Error: ${testResults.personal.error}`
              : "",
            "",
            "[SCHOOL] School Calendar:",
            `   Status: ${testResults.school.success ? "[SUCCESS] Success" : "[ERROR] Failed"}`,
            `   Events: ${testResults.school.count}`,
            testResults.school.error
              ? `   Error: ${testResults.school.error}`
              : "",
            "",
            "[STATUS] Summary:",
            "   Total Endpoints: 2",
            `   Successful: ${
              (testResults.personal.success ? 1 : 0) +
              (testResults.school.success ? 1 : 0)
            }`,
            `   Failed: ${
              (testResults.personal.success ? 0 : 1) +
              (testResults.school.success ? 0 : 1)
            }`,
            `   Total Events: ${testResults.personal.count + testResults.school.count}`,
          ];

          return textResult(reportLines.filter(Boolean).join("\n"));
        } catch (error) {
          return catchError(error, "Error testing calendar endpoints");
        }
      },
    },
    {
      definition: {
        name: "get_calendar_filters",
        description: "Get lobby calendar filter list",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getLobbyCalendarFilters());
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
