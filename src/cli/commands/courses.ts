import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatCourses } from "../formatters/courses.js";
import { formatLearningResources } from "../formatters/learning.js";
import type { NLobbyRequiredCourse } from "../../types.js";

function filterCourses(
  courses: NLobbyRequiredCourse[],
  opts: { grade?: string; semester?: string; category?: string },
): NLobbyRequiredCourse[] {
  let filtered = courses;

  if (opts.grade) {
    const gradeNum = parseInt(opts.grade, 10);
    const gradeString = Number.isNaN(gradeNum)
      ? opts.grade
      : gradeNum === 1
        ? "1年次"
        : gradeNum === 2
          ? "2年次"
          : gradeNum === 3
            ? "3年次"
            : `${gradeNum}年次`;
    filtered = filtered.filter(
      (course) =>
        course.grade === gradeString || String(course.grade) === opts.grade,
    );
  }

  if (opts.semester) {
    filtered = filtered.filter(
      (course) =>
        course.termYear?.toString().includes(opts.semester!) ||
        String(course.term) === opts.semester,
    );
  }

  if (opts.category) {
    const category = opts.category.toLowerCase();
    filtered = filtered.filter(
      (course) =>
        course.curriculumName?.toLowerCase().includes(category) ||
        course.subjectName?.toLowerCase().includes(category),
    );
  }

  return filtered;
}

export function buildCoursesCommand(api: NLobbyApi): Command {
  const courses = new Command("courses").description(
    "Required courses and learning resources",
  );

  courses
    .command("list", { isDefault: true })
    .description("Show required courses")
    .option("--grade <n>", "Filter by grade (1, 2, or 3)")
    .option("--semester <n>", "Filter by semester/term year")
    .option(
      "--category <name>",
      'Filter by curriculum category (e.g. "国語", "数学")',
    )
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        grade?: string;
        semester?: string;
        category?: string;
        json?: boolean;
      }) => {
        try {
          const items = filterCourses(await api.getRequiredCourses(), opts);

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

  courses
    .command("resources")
    .description("Show learning resources")
    .option("--subject <name>", "Filter by subject")
    .option("--json", "Output raw JSON")
    .action(async (opts: { subject?: string; json?: boolean }) => {
      try {
        const resources = await api.getLearningResources(opts.subject);
        if (opts.json) {
          console.log(JSON.stringify(resources, null, 2));
        } else {
          console.log(formatLearningResources(resources));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return courses;
}
