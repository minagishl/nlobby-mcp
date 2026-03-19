import type { NLobbyRequiredCourse } from "../../types.js";

function statusLabel(status: number): string {
  switch (status) {
    case 0:
      return "Not Started";
    case 1:
      return "In Progress";
    case 2:
      return "Completed";
    default:
      return `Status ${status}`;
  }
}

export function formatCourses(courses: NLobbyRequiredCourse[]): string {
  if (courses.length === 0) {
    return "No courses found.";
  }

  const lines: string[] = [];

  // Group by grade/term if available
  const byGroup = new Map<string, NLobbyRequiredCourse[]>();
  for (const course of courses) {
    const key = course.grade
      ? `Grade ${course.grade}${course.term != null ? ` / Term ${course.term}` : ""}`
      : "Courses";
    const group = byGroup.get(key) ?? [];
    group.push(course);
    byGroup.set(key, group);
  }

  for (const [group, groupCourses] of byGroup) {
    lines.push(`── ${group} ──`);
    for (const course of groupCourses) {
      const status = statusLabel(course.subjectStatus);
      const progress =
        course.progressPercentage != null
          ? ` (${course.progressPercentage.toFixed(0)}%)`
          : "";
      lines.push(`  [${course.subjectCode}] ${course.subjectName}`);
      lines.push(`    Curriculum: ${course.curriculumName}`);
      lines.push(`    Status: ${status}${progress}`);
      lines.push(
        `    Reports: ${course.report.count}/${course.report.allCount}`,
      );

      if (course.schooling.necessaryCount > 0) {
        lines.push(
          `    Attendance: ${course.schooling.attendanceCount}/${course.schooling.necessaryCount}`,
        );
      }

      if (course.averageScore != null) {
        lines.push(`    Avg Score: ${course.averageScore.toFixed(1)}`);
      }

      const credits = course.acquired.approvedCredit;
      if (credits > 0) {
        lines.push(`    Credits: ${credits}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}
