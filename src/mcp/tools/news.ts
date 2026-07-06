import { logger } from "../../logger.js";
import { catchError, errorResult, jsonResult, textResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const newsModule: MCPModule = {
  tools: [
    {
      definition: {
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
      handler: async (ctx, args) => {
        try {
          const {
            category,
            limit = 10,
            sort = "newest",
            tab = "all",
          } = (args ?? {}) as {
            category?: string;
            limit?: number;
            sort?: "newest" | "oldest" | "title-asc" | "title-desc";
            tab?: "all" | "mentor";
          };

          const news = await ctx.api.getNews({
            tab: tab === "mentor" ? "mentor" : "all",
          });
          let filteredNews = category
            ? news.filter((item) => item.category === category)
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

          return jsonResult(filteredNews);
        } catch (error) {
          return textResult(
            `Error: ${error instanceof Error ? error.message : "Unknown error"}\n\nTo authenticate:\n1. Login to N Lobby in your browser\n2. Open Developer Tools (F12)\n3. Go to Application/Storage tab\n4. Copy cookies and use the set_cookies tool\n5. Use health_check to verify connection`,
          );
        }
      },
    },
    {
      definition: {
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
      handler: async (ctx, args) => {
        try {
          const { newsId, markAsRead = false } = (args ?? {}) as {
            newsId: string;
            markAsRead?: boolean;
          };

          const newsDetail = await ctx.api.getNewsDetail(newsId);

          if (markAsRead) {
            try {
              await ctx.api.markNewsAsRead(newsId);
            } catch (markError) {
              logger.error(`Failed to mark news ${newsId} as read:`, markError);
            }
          }

          return jsonResult(newsDetail);
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
        name: "mark_news_as_read",
        description: "Mark news articles as read",
        inputSchema: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "string" },
              description: "Array of news article IDs to mark as read",
            },
          },
          required: ["ids"],
        },
      },
      handler: async (ctx, args) => {
        try {
          const { ids } = (args ?? {}) as { ids?: string[] };

          if (!ids || ids.length === 0) {
            return errorResult("No news article IDs provided.");
          }

          const results: string[] = [];
          const errors: Array<{ id: string; error: string }> = [];

          for (const newsId of ids) {
            try {
              await ctx.api.markNewsAsRead(newsId);
              results.push(newsId);
            } catch (error) {
              errors.push({
                id: newsId,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }

          let responseText = "";
          if (results.length > 0) {
            responseText += `Successfully marked ${results.length} news article(s) as read: ${results.join(", ")}\n`;
          }
          if (errors.length > 0) {
            responseText += `\nFailed to mark ${errors.length} news article(s) as read:\n`;
            for (const { id, error } of errors) {
              responseText += `- ${id}: ${error}\n`;
            }
          }

          return textResult(responseText.trim());
        } catch (error) {
          return catchError(error, "Error marking news as read");
        }
      },
    },
    {
      definition: {
        name: "get_unread_news_info",
        description:
          "Get unread news information including count and important news flags",
        inputSchema: { type: "object", properties: {} },
      },
      handler: async (ctx) => {
        try {
          return jsonResult(await ctx.api.getUnreadNewsInfo());
        } catch (error) {
          return catchError(error);
        }
      },
    },
    {
      definition: {
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
              description: "Attachment index to download (0-based, default: 0)",
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
      handler: async (ctx, args) => {
        try {
          const {
            newsId,
            index = 0,
            outputDir = ".",
          } = (args ?? {}) as {
            newsId: string;
            index?: number;
            outputDir?: string;
          };
          const savedPath = await ctx.api.downloadNewsAttachment(
            newsId,
            index,
            outputDir,
          );
          return jsonResult({
            message: "Attachment downloaded successfully",
            path: savedPath,
            newsId,
            index,
          });
        } catch (error) {
          return catchError(error);
        }
      },
    },
  ],
};
