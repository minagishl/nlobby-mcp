import type { Course } from "../../types.js";
import { catchError, jsonResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

function groupCoursesByGrade(courses: Course[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const course of courses) {
    const grade = course.grade || "Unknown";
    groups[grade] = (groups[grade] || 0) + 1;
  }
  return groups;
}

function groupCoursesByCurriculum(courses: Course[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const course of courses) {
    const curriculum = course.curriculumName || "Unknown";
    groups[curriculum] = (groups[curriculum] || 0) + 1;
  }
  return groups;
}

export const coursesModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_required_courses",
        description:
          "Retrieve required courses information with detailed progress tracking",
        inputSchema: {
          type: "object",
          properties: {
            grade: {
              type: "number",
              description: "Filter by grade level (1, 2, or 3) (optional)",
            },
            semester: {
              type: "string",
              description:
                'Filter by term year (e.g., "2024", "2025") (optional)',
            },
            category: {
              type: "string",
              description:
                'Filter by curriculum category (e.g., "国語", "数学", "英語") (optional)',
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { grade, semester, category } = (args ?? {}) as {
            grade?: number;
            semester?: string;
            category?: string;
          };

          const courses = await ctx.api.getRequiredCourses();
          let filteredCourses = courses;

          if (grade !== undefined) {
            const gradeString =
              grade === 1
                ? "1年次"
                : grade === 2
                  ? "2年次"
                  : grade === 3
                    ? "3年次"
                    : `${grade}年次`;
            filteredCourses = filteredCourses.filter(
              (course) => course.grade === gradeString,
            );
          }

          if (semester) {
            filteredCourses = filteredCourses.filter(
              (course) =>
                course.termYear &&
                course.termYear.toString().includes(semester),
            );
          }

          if (category) {
            filteredCourses = filteredCourses.filter(
              (course) =>
                course.curriculumName &&
                course.curriculumName
                  .toLowerCase()
                  .includes(category.toLowerCase()),
            );
          }

          return jsonResult({
            totalCourses: filteredCourses.length,
            filters: { grade, semester, category },
            coursesByGrade: groupCoursesByGrade(filteredCourses),
            coursesByCurriculum: groupCoursesByCurriculum(filteredCourses),
            completedCourses: filteredCourses.filter(
              (course) => course.isCompleted,
            ).length,
            inProgressCourses: filteredCourses.filter(
              (course) => course.isInProgress,
            ).length,
            courses: filteredCourses,
          });
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "get_learning_resources",
        description: "Get learning resources and study materials",
        inputSchema: {
          type: "object",
          properties: {
            subject: {
              type: "string",
              description: "Filter by subject (optional)",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const { subject } = (args ?? {}) as { subject?: string };
          return jsonResult(await ctx.api.getLearningResources(subject));
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
