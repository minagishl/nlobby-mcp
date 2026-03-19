import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { CalendarType } from "../../types.js";
import {
  formatSchedule,
  formatCalendarEvents,
} from "../formatters/schedule.js";

export function buildScheduleCommand(api: NLobbyApi): Command {
  const schedule = new Command("schedule")
    .description("Show schedule for a date (default: today)")
    .argument("[date]", "Date in YYYY-MM-DD format (default: today)")
    .option("--json", "Output raw JSON")
    .action(async (date: string | undefined, opts: { json?: boolean }) => {
      try {
        const items = await api.getScheduleByDate(date);
        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          console.log(formatSchedule(items));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return schedule;
}

export function buildCalendarCommand(api: NLobbyApi): Command {
  const calendar = new Command("calendar")
    .description("Show calendar events")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option(
      "--type <type>",
      "Calendar type: personal|school (default: personal)",
      "personal",
    )
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        from?: string;
        to?: string;
        type: string;
        json?: boolean;
      }) => {
        try {
          const calType =
            opts.type === "school"
              ? CalendarType.SCHOOL
              : CalendarType.PERSONAL;
          const dateRange =
            opts.from && opts.to
              ? api.createDateRange(opts.from, opts.to)
              : api.createWeekDateRange();

          const events = await api.getGoogleCalendarEvents(calType, dateRange);
          if (opts.json) {
            console.log(JSON.stringify(events, null, 2));
          } else {
            console.log(formatCalendarEvents(events));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  calendar
    .command("test")
    .description("Test both personal and school calendar endpoints")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { from?: string; to?: string; json?: boolean }) => {
      try {
        const dateRange =
          opts.from && opts.to
            ? api.createDateRange(opts.from, opts.to)
            : opts.from
              ? api.createSingleDayRange(opts.from)
              : undefined;
        const result = await api.testCalendarEndpoints(dateRange);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            `Personal: ${result.personal.success ? "[OK]" : "[FAIL]"} ${result.personal.count} events${result.personal.error ? ` (${result.personal.error})` : ""}`,
          );
          console.log(
            `School:   ${result.school.success ? "[OK]" : "[FAIL]"} ${result.school.count} events${result.school.error ? ` (${result.school.error})` : ""}`,
          );
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  calendar
    .command("filters")
    .description("Show lobby calendar filter list")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const filters = await api.getLobbyCalendarFilters();
        if (opts.json) {
          console.log(JSON.stringify(filters, null, 2));
        } else {
          if (filters.length === 0) {
            console.log("No calendar filters found.");
          } else {
            for (const f of filters) {
              console.log(`[${f.id}] ${f.label} (${f.color})`);
            }
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return calendar;
}
