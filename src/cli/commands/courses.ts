import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatCourses } from "../formatters/courses.js";

export function buildCoursesCommand(api: NLobbyApi): Command {
  const courses = new Command("courses")
    .description("Show required courses")
    .option("--grade <n>", "Filter by grade")
    .option("--semester <n>", "Filter by semester/term")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: { grade?: string; semester?: string; json?: boolean }) => {
        try {
          let items = await api.getRequiredCourses();

          if (opts.grade) {
            items = items.filter((c) => String(c.grade) === opts.grade);
          }

          if (opts.semester) {
            items = items.filter((c) => String(c.term) === opts.semester);
          }

          if (opts.json) {
            console.log(JSON.stringify(items, null, 2));
          } else {
            console.log(formatCourses(items));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  return courses;
}
