import type { ApiContext } from "./context.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type {
  NLobbyRequiredCourse,
  NLobbyLearningResource,
  NLobbyApiResponse,
  EducationData,
  CourseReport,
  CourseReportDetail,
  EducationApiResponseData,
  ExamOneTimePassword,
} from "../types.js";

type UnknownObject = Record<string, unknown>;

// ---- Private helpers ----

function findEducationDataInObject(
  obj: UnknownObject,
  path: string = "",
): EducationData | null {
  if (!obj || typeof obj !== "object") return null;

  if (
    obj.educationProcessName &&
    obj.termYears &&
    Array.isArray(obj.termYears)
  ) {
    logger.info(`[INFO] Found education data at path: ${path}`);
    return obj as unknown as EducationData;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      const searchPath = path ? `${path}.${key}` : key;
      const found = findEducationDataInObject(
        value as UnknownObject,
        searchPath,
      );
      if (found) return found;
    }
  }

  return null;
}

function calculateProgressPercentage(report: CourseReport): number {
  if (report.allCount === 0) return 0;
  return Math.round((report.count / report.allCount) * 100);
}

function calculateAverageScore(
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

function transformEducationDataToCourses(
  educationData: EducationData,
): NLobbyRequiredCourse[] {
  const allCourses: NLobbyRequiredCourse[] = [];

  for (const termYear of educationData.termYears) {
    for (const course of termYear.courses) {
      const progressPercentage = calculateProgressPercentage(course.report);
      const averageScore = calculateAverageScore(course.reportDetails);
      const isCompleted = course.acquired.acquisitionStatus === 1;
      const isInProgress =
        course.subjectStatus === 1 || course.subjectStatus === 2;

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
    }
  }

  return allCourses;
}

// ---- Public module functions ----

export async function getRequiredCourses(
  ctx: ApiContext,
): Promise<NLobbyRequiredCourse[]> {
  logger.info("[INFO] Starting getRequiredCourses...");

  try {
    const response = await ctx.trpcClient.call(
      "requiredCourse.getRequiredCourses",
    );

    let educationData: EducationData | null = null;
    const responseData = response as EducationApiResponseData;

    if (responseData && responseData.result && responseData.result.data) {
      educationData = responseData.result.data;
    } else if (responseData && responseData.data) {
      educationData = responseData.data;
    } else if (
      responseData &&
      responseData.educationProcessName &&
      responseData.termYears
    ) {
      educationData = responseData as unknown as EducationData;
    } else if (responseData && Array.isArray(responseData)) {
      return responseData;
    } else if (responseData) {
      const searchResult = findEducationDataInObject(
        responseData as UnknownObject,
      );
      if (searchResult) {
        educationData = searchResult;
      }
    }

    if (educationData) {
      const allCourses = transformEducationDataToCourses(educationData);
      logger.info(`[SUCCESS] Total courses extracted: ${allCourses.length}`);
      return allCourses;
    } else {
      throw new Error(
        `Unexpected response format from required courses endpoint.`,
      );
    }
  } catch (error) {
    logger.error("[ERROR] getRequiredCourses failed:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to fetch required courses: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function courseMatchesSubjectFilter(
  course: NLobbyRequiredCourse,
  subject: string,
): boolean {
  const needle = subject.toLowerCase();
  return (
    course.subjectName.toLowerCase().includes(needle) ||
    course.curriculumName.toLowerCase().includes(needle) ||
    course.subjectCode.toLowerCase().includes(needle)
  );
}

function deriveLearningResourcesFromCourses(
  courses: NLobbyRequiredCourse[],
  subject?: string,
): NLobbyLearningResource[] {
  const resources: NLobbyLearningResource[] = [];

  for (const course of courses) {
    if (subject && !courseMatchesSubjectFilter(course, subject)) {
      continue;
    }

    const test = course.test as { makeupExamUrl?: string | null } | undefined;
    const makeupUrl = test?.makeupExamUrl;
    if (makeupUrl) {
      resources.push({
        id: `${course.subjectCode}-makeup-exam`,
        title: `${course.subjectName} 追試`,
        description: `${course.curriculumName}の追試提出フォーム`,
        type: "assignment",
        url: makeupUrl,
        subject: course.subjectName,
        grade: course.grade,
        publishedAt: new Date(),
      });
    }

    for (const detail of course.reportDetails ?? []) {
      if (detail.progress >= 100) {
        continue;
      }

      resources.push({
        id: `${course.subjectCode}-report-${detail.number}`,
        title:
          detail.name ?? `${course.subjectName} レポート第${detail.number}回`,
        description: `レポート進捗 ${detail.progress}%（期限: ${new Date(detail.expiration).toLocaleDateString("ja-JP")}）`,
        type: detail.type === "report" ? "document" : "quiz",
        url: `${CONFIG.nlobby.baseUrl}/required/`,
        subject: course.subjectName,
        grade: course.grade,
        publishedAt: new Date(detail.expiration),
      });
    }
  }

  return resources;
}

export async function getLearningResources(
  ctx: ApiContext,
  subject?: string,
): Promise<NLobbyLearningResource[]> {
  logger.info("[INFO] Fetching learning resources...");

  try {
    const params = subject ? { subject } : {};
    const response = await ctx.httpClient.get<
      NLobbyApiResponse<NLobbyLearningResource[]>
    >("/api/learning-resources", { params });

    if (response.data.success && response.data.data) {
      logger.info(
        `[SUCCESS] Fetched ${response.data.data.length} learning resources from REST API`,
      );
      return response.data.data;
    }
  } catch (error) {
    logger.warn(
      "[WARNING] /api/learning-resources unavailable, deriving from required courses",
      error instanceof Error ? error.message : error,
    );
  }

  const courses = await getRequiredCourses(ctx);
  const resources = deriveLearningResourcesFromCourses(courses, subject);
  logger.info(
    `[SUCCESS] Derived ${resources.length} learning resources from required courses`,
  );
  return resources;
}

export async function isExamDay(
  ctx: ApiContext,
  date?: Date,
): Promise<boolean> {
  logger.info("[INFO] Checking if date is exam day...");
  const targetDate = date || new Date();
  const isoString = targetDate.toISOString();
  try {
    const result = await ctx.trpcClient.call<boolean>(
      "exam.isExamDay",
      isoString,
    );
    logger.info(`[SUCCESS] isExamDay result: ${result}`);
    return result === true;
  } catch (error) {
    logger.error("[ERROR] isExamDay failed:", error);
    throw error;
  }
}

export async function finishExamDayMode(ctx: ApiContext): Promise<boolean> {
  logger.info("[INFO] Finishing exam day mode...");
  try {
    const result = await ctx.trpcClient.call<boolean>(
      "exam.finishExamDayMode",
      undefined,
      { postOnly: true },
    );
    logger.info("[SUCCESS] finishExamDayMode succeeded");
    return result === true;
  } catch (error) {
    logger.error("[ERROR] finishExamDayMode failed:", error);
    throw error;
  }
}

export async function getExamOneTimePassword(
  ctx: ApiContext,
): Promise<ExamOneTimePassword> {
  logger.info("[INFO] Fetching exam one-time password...");
  try {
    const result = await ctx.trpcClient.call<ExamOneTimePassword>(
      "auth.student.examOneTimePasswordDisplay",
    );
    logger.info("[SUCCESS] getExamOneTimePassword succeeded");
    return result;
  } catch (error) {
    logger.error("[ERROR] getExamOneTimePassword failed:", error);
    throw error;
  }
}
