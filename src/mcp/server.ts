import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NLobbyApi } from "../api/index.js";
import { CONFIG } from "../config.js";
import { BrowserAuth } from "../auth/browser.js";
import { CredentialManager } from "../auth/credentials.js";
import { CalendarType, Course } from "../types.js";
import { logger } from "../logger.js";

export class NLobbyMCPServer {
  private server: Server;
  private api: NLobbyApi;
  private browserAuth: BrowserAuth;
  private credentialManager: CredentialManager;

  constructor() {
    this.server = new Server(
      {
        name: CONFIG.mcp.serverName,
        version: CONFIG.mcp.serverVersion,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      },
    );

    this.api = new NLobbyApi();
    this.browserAuth = new BrowserAuth();
    this.credentialManager = new CredentialManager();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "nlobby://news",
            name: "School News",
            description: "Latest school news and notices",
            mimeType: "application/json",
          },
          {
            uri: "nlobby://schedule",
            name: "School Schedule",
            description: "Daily class schedule and events",
            mimeType: "application/json",
          },
          {
            uri: "nlobby://user-profile",
            name: "User Profile",
            description: "Current user information and preferences",
            mimeType: "application/json",
          },
          {
            uri: "nlobby://required-courses",
            name: "Required Courses",
            description: "Required courses and academic information",
            mimeType: "application/json",
          },
          {
            uri: "nlobby://learning-resources",
            name: "Learning Resources",
            description: "Learning materials, assignments, and study resources",
            mimeType: "application/json",
          },
        ],
      };
    });

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;

        try {
          switch (uri) {
            case "nlobby://news": {
              const news = await this.api.getNews();
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(news, null, 2),
                  },
                ],
              };
            }

            case "nlobby://schedule": {
              const schedule = await this.api.getSchedule(
                CalendarType.PERSONAL,
              );
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(schedule, null, 2),
                  },
                ],
              };
            }

            case "nlobby://user-profile": {
              const userInfo = await this.api.getAccountInfoFromScript();
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(userInfo, null, 2),
                  },
                ],
              };
            }

            case "nlobby://required-courses": {
              const courses = await this.api.getRequiredCourses();
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(courses, null, 2),
                  },
                ],
              };
            }

            case "nlobby://learning-resources": {
              const resources = await this.api.getLearningResources();
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(resources, null, 2),
                  },
                ],
              };
            }

            default:
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Unknown resource: ${uri}`,
              );
          }
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read resource: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_news",
            description: "Retrieve school news",
            inputSchema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  description: "Filter by category (optional)",
                },
                limit: {
                  type: "number",
                  description:
                    "Maximum number of news items to retrieve (optional, default: 10)",
                  minimum: 1,
                  default: 10,
                },
                sort: {
                  type: "string",
                  description:
                    "Sort order: 'newest' (default), 'oldest', 'title-asc', 'title-desc'",
                  enum: ["newest", "oldest", "title-asc", "title-desc"],
                },
                tab: {
                  type: "string",
                  description:
                    "News tab: 'all' (default) or 'mentor' for mentor announcements",
                  enum: ["all", "mentor"],
                  default: "all",
                },
              },
            },
          },
          {
            name: "get_news_detail",
            description:
              "Retrieve detailed information for a specific news article",
            inputSchema: {
              type: "object",
              properties: {
                newsId: {
                  type: "string",
                  description: "The ID of the news article to retrieve",
                },
                markAsRead: {
                  type: "boolean",
                  description:
                    "Mark the news article as read (optional, default: false)",
                  default: false,
                },
              },
              required: ["newsId"],
            },
          },
          {
            name: "get_account_info",
            description:
              "Extract account information by parsing Next.js flight data from a rendered page",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_student_card_screenshot",
            description:
              "Capture a screenshot of the student ID card by following the secure portal redirect flow",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_schooling",
            description:
              "Fetch schooling schedule from the secure student portal (/mypage/schooling/top)",
            inputSchema: {
              type: "object",
              properties: {
                html_only: {
                  type: "boolean",
                  description:
                    "Return raw #main HTML instead of parsed schooling data (optional, default: false)",
                  default: false,
                },
              },
            },
          },
          {
            name: "get_schooling_detail",
            description:
              "Fetch schooling application details (申し込み内容) by entry ID from the secure portal",
            inputSchema: {
              type: "object",
              properties: {
                entry_id: {
                  type: "string",
                  description: "Schooling entry ID (entryId query parameter)",
                },
                html_only: {
                  type: "boolean",
                  description:
                    "Return raw #main HTML instead of parsed detail data (optional, default: false)",
                  default: false,
                },
              },
              required: ["entry_id"],
            },
          },
          {
            name: "get_designated_school",
            description:
              "Fetch designated school (指定校) recommendations from the secure student portal (/mypage/designated_school/index)",
            inputSchema: {
              type: "object",
              properties: {
                html_only: {
                  type: "boolean",
                  description:
                    "Return raw #main HTML instead of parsed data (optional, default: false)",
                  default: false,
                },
                page: {
                  type: "number",
                  description: "Page number for search results (optional)",
                },
                prefectures: {
                  type: "array",
                  items: { type: "number" },
                  description:
                    "Prefecture filter codes (optional, e.g. [13] for Tokyo)",
                },
                school_types: {
                  type: "array",
                  items: { type: "number" },
                  description:
                    "School type codes: 1=university, 2=junior college, 3=vocational (optional)",
                },
                school_name: {
                  type: "string",
                  description: "School name filter (optional)",
                },
                school_name_exact: {
                  type: "boolean",
                  description: "Match school name exactly (optional)",
                },
                faculty_name: {
                  type: "string",
                  description: "Faculty name filter (optional)",
                },
                faculty_name_exact: {
                  type: "boolean",
                  description: "Match faculty name exactly (optional)",
                },
                freeword: {
                  type: "string",
                  description: "Free word search (optional)",
                },
                freeword_exact: {
                  type: "boolean",
                  description: "Match free word exactly (optional)",
                },
                selection_deadline_before: {
                  type: "string",
                  description:
                    "Selection deadline on or before YYYY/MM/DD or YYYY-MM-DD (optional)",
                },
              },
            },
          },
          {
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
          {
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
          {
            name: "get_calendar_events",
            description: "Get calendar events with advanced options",
            inputSchema: {
              type: "object",
              properties: {
                calendar_type: {
                  type: "string",
                  enum: ["personal", "school"],
                  description:
                    "Type of calendar to retrieve (personal or school)",
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
          {
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
          {
            name: "set_cookies",
            description: "Set authentication cookies for N Lobby access",
            inputSchema: {
              type: "object",
              properties: {
                cookies: {
                  type: "string",
                  description:
                    "Cookie string from authenticated N Lobby session",
                },
              },
              required: ["cookies"],
            },
          },
          {
            name: "check_cookies",
            description: "Check if authentication cookies are set",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "health_check",
            description: "Check if N Lobby API connection is working",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "debug_connection",
            description: "Debug N Lobby connection with detailed information",
            inputSchema: {
              type: "object",
              properties: {
                endpoint: {
                  type: "string",
                  description: "Endpoint to test (default: /news)",
                  default: "/news",
                },
              },
            },
          },
          {
            name: "test_page_content",
            description: "Test page content retrieval and show sample content",
            inputSchema: {
              type: "object",
              properties: {
                endpoint: {
                  type: "string",
                  description: "Endpoint to test (default: /news)",
                  default: "/news",
                },
                length: {
                  type: "number",
                  description: "Number of characters to show (default: 1000)",
                  default: 1000,
                },
              },
            },
          },
          {
            name: "test_trpc_endpoint",
            description: "Test specific tRPC endpoint with detailed response",
            inputSchema: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  description:
                    "tRPC method to test (e.g., news.getUnreadNewsCount, user.updateLastAccess)",
                  default: "user.updateLastAccess",
                },
                params: {
                  type: "string",
                  description: "JSON string of parameters (optional)",
                },
              },
            },
          },
          {
            name: "verify_authentication",
            description:
              "Verify authentication status and cookie synchronization across all clients",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "interactive_login",
            description:
              "Open browser for manual login to N Lobby (no credentials required)",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "login_help",
            description: "Get help and troubleshooting tips for N Lobby login",
            inputSchema: {
              type: "object",
              properties: {
                email: {
                  type: "string",
                  description:
                    "Your email address (optional, for personalized help)",
                },
              },
            },
          },
          {
            name: "mark_news_as_read",
            description: "Mark news articles as read",
            inputSchema: {
              type: "object",
              properties: {
                ids: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "Array of news article IDs to mark as read",
                },
              },
              required: ["ids"],
            },
          },
          {
            name: "check_exam_day",
            description:
              "Check if the specified date (or today if omitted) is an exam day",
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
          {
            name: "finish_exam_day_mode",
            description: "Finish exam day mode",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_exam_otp",
            description: "Get one-time password for exam",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "update_last_access",
            description:
              "Update the last access timestamp for the current user",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_navigation_menus",
            description: "Get main navigation menu list",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_unread_news_info",
            description:
              "Get unread news information including count and important news flags",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_notifications",
            description: "Get notification messages",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_user_interests",
            description:
              "Get user interest tags (optionally with icon information)",
            inputSchema: {
              type: "object",
              properties: {
                with_icon: {
                  type: "boolean",
                  description:
                    "Whether to include icon information (optional, default: false)",
                  default: false,
                },
              },
            },
          },
          {
            name: "get_interest_weights",
            description: "Get interest weight scale definitions",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_calendar_filters",
            description: "Get lobby calendar filter list",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
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
          {
            name: "download_news_attachment",
            description:
              "Download a news article attachment using the authenticated session",
            inputSchema: {
              type: "object",
              properties: {
                newsId: {
                  type: "string",
                  description: "The ID of the news article",
                },
                index: {
                  type: "number",
                  description:
                    "Attachment index to download (0-based, default: 0)",
                  default: 0,
                },
                outputDir: {
                  type: "string",
                  description: "Directory to save the file (default: .)",
                  default: ".",
                },
              },
              required: ["newsId"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_news":
            try {
              const {
                category,
                limit = 10,
                sort = "newest",
                tab = "all",
              } = args as {
                category?: string;
                limit?: number;
                sort?: "newest" | "oldest" | "title-asc" | "title-desc";
                tab?: "all" | "mentor";
              };
              const news = await this.api.getNews({
                tab: tab === "mentor" ? "mentor" : "all",
              });
              let filteredNews = category
                ? news.filter((n) => n.category === category)
                : news;

              switch (sort) {
                case "oldest":
                  filteredNews.sort(
                    (a, b) =>
                      new Date(a.publishedAt || 0).getTime() -
                      new Date(b.publishedAt || 0).getTime(),
                  );
                  break;
                case "title-asc":
                  filteredNews.sort((a, b) =>
                    (a.title || "").localeCompare(b.title || ""),
                  );
                  break;
                case "title-desc":
                  filteredNews.sort((a, b) =>
                    (b.title || "").localeCompare(a.title || ""),
                  );
                  break;
                case "newest":
                default:
                  filteredNews.sort(
                    (a, b) =>
                      new Date(b.publishedAt || 0).getTime() -
                      new Date(a.publishedAt || 0).getTime(),
                  );
                  break;
              }

              if (limit > 0) {
                filteredNews = filteredNews.slice(0, limit);
              }

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(filteredNews, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}\n\nTo authenticate:\n1. Login to N Lobby in your browser\n2. Open Developer Tools (F12)\n3. Go to Application/Storage tab\n4. Copy cookies and use the set_cookies tool\n5. Use health_check to verify connection`,
                  },
                ],
              };
            }

          case "get_news_detail":
            try {
              const { newsId, markAsRead = false } = args as {
                newsId: string;
                markAsRead?: boolean;
              };

              const newsDetail = await this.api.getNewsDetail(newsId);

              if (markAsRead) {
                try {
                  await this.api.markNewsAsRead(newsId);
                } catch (markError) {
                  logger.error(
                    `Failed to mark news ${newsId} as read:`,
                    markError,
                  );
                }
              }

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(newsDetail, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_account_info":
            try {
              const accountInfo = await this.api.getAccountInfoFromScript();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(accountInfo, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_student_card_screenshot":
            try {
              const result = await this.api.getStudentCardScreenshot();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        message:
                          "Student card screenshot captured successfully. Image data attached as base64.",
                        filePath: result.path,
                        studentNo: result.studentNo,
                        secureHost: result.secureHost,
                        callbackUrl: result.callbackUrl,
                        finalUrl: result.finalUrl,
                        elementSize: result.elementSize,
                      },
                      null,
                      2,
                    ),
                  },
                  {
                    type: "image",
                    mimeType: "image/png",
                    data: result.base64,
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error capturing student card screenshot: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_schooling":
            try {
              const { html_only = false } = args as { html_only?: boolean };
              if (html_only) {
                const html = await this.api.getSchoolingPageHtml();
                return {
                  content: [
                    {
                      type: "text",
                      text: html,
                    },
                  ],
                };
              }

              const schooling = await this.api.getSchooling();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(schooling, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error fetching schooling page: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_schooling_detail":
            try {
              const { entry_id, html_only = false } = args as {
                entry_id: string;
                html_only?: boolean;
              };

              if (html_only) {
                const html =
                  await this.api.getSchoolingDetailPageHtml(entry_id);
                return {
                  content: [
                    {
                      type: "text",
                      text: html,
                    },
                  ],
                };
              }

              const detail = await this.api.getSchoolingDetail(entry_id);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(detail, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error fetching schooling detail: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_designated_school":
            try {
              const {
                html_only = false,
                page,
                prefectures,
                school_types,
                school_name,
                school_name_exact,
                faculty_name,
                faculty_name_exact,
                freeword,
                freeword_exact,
                selection_deadline_before,
              } = args as {
                html_only?: boolean;
                page?: number;
                prefectures?: number[];
                school_types?: number[];
                school_name?: string;
                school_name_exact?: boolean;
                faculty_name?: string;
                faculty_name_exact?: boolean;
                freeword?: string;
                freeword_exact?: boolean;
                selection_deadline_before?: string;
              };

              const searchOptions = {
                page,
                prefectures,
                schoolTypes: school_types,
                schoolName: school_name,
                schoolNameExact: school_name_exact,
                facultyName: faculty_name,
                facultyNameExact: faculty_name_exact,
                freeword,
                freewordExact: freeword_exact,
                selectionDeadlineBefore: selection_deadline_before,
              };

              if (html_only) {
                const html =
                  await this.api.getDesignatedSchoolPageHtml(searchOptions);
                return {
                  content: [
                    {
                      type: "text",
                      text: html,
                    },
                  ],
                };
              }

              const designatedSchool =
                await this.api.getDesignatedSchool(searchOptions);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(designatedSchool, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error fetching designated school page: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_required_courses":
            try {
              const { grade, semester, category } = args as {
                grade?: number;
                semester?: string;
                category?: string;
              };

              const courses = await this.api.getRequiredCourses();

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

              const summary = {
                totalCourses: filteredCourses.length,
                filters: { grade, semester, category },
                coursesByGrade: this.groupCoursesByGrade(filteredCourses),
                coursesByCurriculum:
                  this.groupCoursesByCurriculum(filteredCourses),
                completedCourses: filteredCourses.filter(
                  (course) => course.isCompleted,
                ).length,
                inProgressCourses: filteredCourses.filter(
                  (course) => course.isInProgress,
                ).length,
                courses: filteredCourses,
              };

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(summary, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_schedule":
            try {
              const { date } = args as { date?: string };
              const schedule = await this.api.getScheduleByDate(date);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(schedule, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_calendar_events":
            try {
              const { calendar_type, from_date, to_date, period } = args as {
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
                  case "today": {
                    const today = new Date();
                    dateRange = this.api.createSingleDayRange(today);
                    break;
                  }
                  case "week":
                    dateRange = this.api.createWeekDateRange();
                    break;
                  case "month":
                    dateRange = this.api.createMonthDateRange();
                    break;
                  default:
                    throw new Error(`Invalid period: ${period}`);
                }
              } else if (from_date && to_date) {
                dateRange = this.api.createDateRange(from_date, to_date);
              } else if (from_date) {
                dateRange = this.api.createSingleDayRange(from_date);
              }

              const schedule = await this.api.getSchedule(
                calendarType,
                dateRange,
              );

              return {
                content: [
                  {
                    type: "text",
                    text: `[DATE] Calendar Events (${calendar_type || "personal"})${
                      dateRange
                        ? ` from ${dateRange.from.toDateString()} to ${dateRange.to.toDateString()}`
                        : " (current week)"
                    }\n\n${JSON.stringify(schedule, null, 2)}`,
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "test_calendar_endpoints":
            try {
              const { from_date, to_date } = args as {
                from_date?: string;
                to_date?: string;
              };

              let dateRange;
              if (from_date && to_date) {
                dateRange = this.api.createDateRange(from_date, to_date);
              } else if (from_date) {
                dateRange = this.api.createSingleDayRange(from_date);
              }

              const testResults =
                await this.api.testCalendarEndpoints(dateRange);

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
                `   Total Endpoints: 2`,
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

              return {
                content: [
                  {
                    type: "text",
                    text: reportLines.filter(Boolean).join("\n"),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error testing calendar endpoints: ${
                      error instanceof Error ? error.message : "Unknown error"
                    }`,
                  },
                ],
              };
            }

          case "set_cookies": {
            const { cookies } = args as { cookies: string };
            this.api.setCookies(cookies);
            return {
              content: [
                {
                  type: "text",
                  text: "Authentication cookies have been set. You can now access real N Lobby data.",
                },
              ],
            };
          }

          case "check_cookies": {
            const cookieStatus = this.api.getCookieStatus();
            return {
              content: [
                {
                  type: "text",
                  text: `Cookie status: ${cookieStatus}`,
                },
              ],
            };
          }

          case "health_check": {
            const isHealthy = await this.api.healthCheck();
            return {
              content: [
                {
                  type: "text",
                  text: `N Lobby API connection: ${isHealthy ? "healthy" : "failed"}`,
                },
              ],
            };
          }

          case "debug_connection": {
            const { endpoint } = args as { endpoint?: string };
            const debugResult = await this.api.debugConnection(
              endpoint || "/news",
            );
            return {
              content: [
                {
                  type: "text",
                  text: debugResult,
                },
              ],
            };
          }

          case "test_page_content": {
            const { endpoint: testEndpoint, length } = args as {
              endpoint?: string;
              length?: number;
            };
            const sampleContent = await this.api.testPageContent(
              testEndpoint || "/news",
              length || 1000,
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Sample content from ${testEndpoint || "/news"}:\n\n${sampleContent}`,
                },
              ],
            };
          }

          case "test_trpc_endpoint": {
            const { method, params } = args as {
              method: string;
              params?: string;
            };
            try {
              const parsedParams = params ? JSON.parse(params) : {};
              const result = await this.api.testTrpcEndpoint(
                method,
                parsedParams,
              );
              return {
                content: [
                  {
                    type: "text",
                    text: `Result of ${method} with params ${JSON.stringify(parsedParams)}:\n\n${JSON.stringify(result, null, 2)}`,
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error testing tRPC endpoint ${method}: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }
          }

          case "verify_authentication": {
            const authStatus = this.api.getCookieStatus();
            return {
              content: [
                {
                  type: "text",
                  text: `[INFO] Authentication Verification Report\n\n${authStatus}\n\n[LOG] Recommendations:\n${this.getAuthenticationRecommendations()}`,
                },
              ],
            };
          }

          case "interactive_login":
            try {
              await this.browserAuth.initializeBrowser();
              const extractedCookies =
                await this.browserAuth.interactiveLogin();
              this.api.setCookies(extractedCookies.allCookies);
              await this.browserAuth.close();

              return {
                content: [
                  {
                    type: "text",
                    text: `[SUCCESS] Successfully logged in to N Lobby!\n\nExtracted cookies:\n- Session Token: ${extractedCookies.sessionToken ? "present" : "missing"}\n- CSRF Token: ${extractedCookies.csrfToken ? "present" : "missing"}\n- Callback URL: ${extractedCookies.callbackUrl || "not set"}\n\nYou can now access real N Lobby data using other tools.`,
                  },
                ],
              };
            } catch (error) {
              await this.browserAuth.close();
              return {
                content: [
                  {
                    type: "text",
                    text: `[ERROR] Interactive login failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "login_help": {
            const { email } = args as { email?: string };

            let helpMessage = `[LOGIN] N Lobby Login Help\n\n`;

            if (email) {
              const emailValidation =
                this.credentialManager.validateEmail(email);
              helpMessage += `[EMAIL] Email: ${email}\n`;
              helpMessage += `[USER] User Type: ${emailValidation.userType}\n`;
              helpMessage += `[SUCCESS] Valid: ${emailValidation.valid ? "Yes" : "No"}\n\n`;

              if (!emailValidation.valid) {
                helpMessage += `[ERROR] Issue: ${emailValidation.message}\n\n`;
              }

              helpMessage += this.credentialManager.getLoginGuidance(
                emailValidation.userType,
              );
            } else {
              helpMessage += this.credentialManager.getLoginGuidance("unknown");
            }

            helpMessage += `\n\n${this.credentialManager.getTroubleshootingTips()}`;

            const stats = this.credentialManager.getSessionStats();
            helpMessage += `\n\n[STATUS] Session Stats:\n- Active sessions: ${stats.total - stats.expired}\n- Expired sessions: ${stats.expired}`;

            return {
              content: [
                {
                  type: "text",
                  text: helpMessage,
                },
              ],
            };
          }

          case "mark_news_as_read":
            try {
              const { ids } = args as { ids: string[] };

              if (!ids || ids.length === 0) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "Error: No news article IDs provided.",
                    },
                  ],
                };
              }

              const results = [];
              const errors = [];

              for (const newsId of ids) {
                try {
                  await this.api.markNewsAsRead(newsId);
                  results.push(newsId);
                } catch (error) {
                  errors.push({
                    id: newsId,
                    error:
                      error instanceof Error ? error.message : "Unknown error",
                  });
                }
              }

              let responseText = "";

              if (results.length > 0) {
                responseText += `Successfully marked ${results.length} news article(s) as read: ${results.join(", ")}\n`;
              }

              if (errors.length > 0) {
                responseText += `\nFailed to mark ${errors.length} news article(s) as read:\n`;
                errors.forEach(({ id, error }) => {
                  responseText += `- ${id}: ${error}\n`;
                });
              }

              return {
                content: [
                  {
                    type: "text",
                    text: responseText.trim(),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error marking news as read: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "check_exam_day":
            try {
              const { date } = args as { date?: string };
              const targetDate = date ? new Date(date) : undefined;
              const result = await this.api.isExamDay(targetDate);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        date: targetDate
                          ? targetDate.toISOString().split("T")[0]
                          : new Date().toISOString().split("T")[0],
                        isExamDay: result,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "finish_exam_day_mode":
            try {
              const result = await this.api.finishExamDayMode();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ success: result }, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_exam_otp":
            try {
              const result = await this.api.getExamOneTimePassword();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "update_last_access":
            try {
              const result = await this.api.updateLastAccess();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ success: result }, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_navigation_menus":
            try {
              const menus = await this.api.getMainNavigations();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(menus, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_unread_news_info":
            try {
              const info = await this.api.getUnreadNewsInfo();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(info, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_notifications":
            try {
              const messages = await this.api.getNotificationMessages();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(messages, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_user_interests":
            try {
              const { with_icon = false } = args as { with_icon?: boolean };
              const interests = await this.api.getUserInterests(with_icon);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(interests, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_interest_weights":
            try {
              const weights = await this.api.getInterestWeights();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(weights, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_calendar_filters":
            try {
              const filters = await this.api.getLobbyCalendarFilters();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(filters, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "get_learning_resources":
            try {
              const { subject } = args as { subject?: string };
              const resources = await this.api.getLearningResources(subject);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(resources, null, 2),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          case "download_news_attachment":
            try {
              const {
                newsId,
                index = 0,
                outputDir = ".",
              } = args as {
                newsId: string;
                index?: number;
                outputDir?: string;
              };
              const savedPath = await this.api.downloadNewsAttachment(
                newsId,
                index,
                outputDir,
              );
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        message: "Attachment downloaded successfully",
                        path: savedPath,
                        newsId,
                        index,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                ],
              };
            }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;
      throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("N Lobby MCP Server started successfully");
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  private getAuthenticationRecommendations(): string {
    const authStatus = this.api.getCookieStatus();
    const recommendations = [];

    if (
      authStatus.includes("[ERROR] no cookies") &&
      authStatus.includes("[ERROR] not authenticated")
    ) {
      recommendations.push(
        "1. Run interactive_login to authenticate with N Lobby",
      );
      recommendations.push(
        "2. Make sure to complete the login process in the browser window",
      );
      recommendations.push(
        '3. Wait for the "Login successful" message before proceeding',
      );
    } else if (authStatus.includes("[ERROR] not synchronized")) {
      recommendations.push("1. Cookie synchronization issue detected");
      recommendations.push(
        "2. Try running interactive_login again to refresh all cookies",
      );
    } else if (
      authStatus.includes("[SUCCESS] authenticated") &&
      authStatus.includes("[SUCCESS] synchronized")
    ) {
      recommendations.push("1. Authentication appears to be working correctly");
      recommendations.push(
        "2. If endpoints are still failing, the issue may be server-side",
      );
      recommendations.push(
        "3. Try running health_check to verify connectivity",
      );
    } else {
      recommendations.push(
        "1. Check the authentication status above for specific issues",
      );
      recommendations.push(
        "2. Run health_check to verify overall system health",
      );
    }

    return recommendations.join("\n");
  }

  private groupCoursesByGrade(courses: Course[]): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const course of courses) {
      const grade = course.grade || "Unknown";
      groups[grade] = (groups[grade] || 0) + 1;
    }

    return groups;
  }

  private groupCoursesByCurriculum(courses: Course[]): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const course of courses) {
      const curriculum = course.curriculumName || "Unknown";
      groups[curriculum] = (groups[curriculum] || 0) + 1;
    }

    return groups;
  }
}
