import type { ApiContext } from "./context.js";
import { fetchRenderedHtml } from "./shared.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import * as cheerio from "cheerio";
import type {
  NLobbyAnnouncement,
  NLobbyNewsDetail,
  NewsData,
  NewsItem,
  UnreadNewsInfo,
  AxiosError,
} from "../types.js";

// ---- Private helpers ----

function decodeHtmlContent(content: string): string {
  if (!content) return "";
  try {
    return content
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  } catch {
    return content;
  }
}

function searchForNewsDataInObject(
  obj: unknown,
  path: string = "",
): NewsData | null {
  if (!obj || typeof obj !== "object") return null;

  const objRecord = obj as Record<string, unknown>;

  if (
    objRecord.id &&
    objRecord.title &&
    (objRecord.publishedAt || objRecord.description || objRecord.menuName)
  ) {
    logger.info(`[INFO] Found news object at path: ${path}`);
    return obj as NewsData;
  }

  if (objRecord.news && typeof objRecord.news === "object") {
    logger.info(`[INFO] Found news property at path: ${path}.news`);
    return objRecord.news as NewsData;
  }

  for (const [key, value] of Object.entries(objRecord)) {
    if (value && typeof value === "object") {
      const searchPath = path ? `${path}.${key}` : key;
      const found = searchForNewsDataInObject(value, searchPath);
      if (found) return found;
    }
  }

  return null;
}

function searchForNewsInData(obj: unknown, path: string = ""): unknown[] {
  if (!obj || typeof obj !== "object") return [];

  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      const firstItem = obj[0];
      if (firstItem && typeof firstItem === "object") {
        const newsProperties = [
          "title",
          "name",
          "content",
          "publishedAt",
          "menuName",
          "createdAt",
          "updatedAt",
          "id",
        ];
        const hasNewsProperties = newsProperties.some(
          (prop) => prop in firstItem,
        );

        if (hasNewsProperties) {
          logger.info(
            `[INFO] Found potential news array at path: ${path}, length: ${obj.length}`,
          );
          return obj;
        }
      }
    }
    return [];
  }

  const results = [];
  for (const [key, value] of Object.entries(obj)) {
    const priorityKeys = [
      "news",
      "announcements",
      "data",
      "items",
      "list",
      "content",
      "notifications",
      "posts",
      "feed",
      "results",
    ];
    const searchPath = path ? `${path}.${key}` : key;

    if (priorityKeys.includes(key.toLowerCase())) {
      logger.info(`[INFO] Searching priority key: ${searchPath}`);
    }

    const foundArrays = searchForNewsInData(value, searchPath);
    results.push(...foundArrays);
  }

  return results;
}

function transformNewsToAnnouncements(
  newsData: unknown[],
): NLobbyAnnouncement[] {
  return newsData.map((item, index) => {
    const newsItem = item as NewsItem;

    let publishedDate = new Date();
    if (newsItem.publishedAt) {
      publishedDate = new Date(newsItem.publishedAt);
    } else if (newsItem.createdAt) {
      publishedDate = new Date(newsItem.createdAt);
    } else if (newsItem.updatedAt) {
      publishedDate = new Date(newsItem.updatedAt);
    } else if (newsItem.date) {
      publishedDate = new Date(newsItem.date);
    }

    const title =
      newsItem.title ||
      newsItem.name ||
      newsItem.subject ||
      newsItem.heading ||
      `News Item ${index + 1}`;

    const content =
      newsItem.content ||
      newsItem.description ||
      newsItem.body ||
      newsItem.text ||
      newsItem.summary ||
      "";

    const category =
      newsItem.category ||
      newsItem.menuName ||
      newsItem.type ||
      newsItem.classification ||
      "General";

    let priority: "high" | "medium" | "low" = "medium";
    if (
      newsItem.isImportant === true ||
      newsItem.important === true ||
      newsItem.priority === "high" ||
      newsItem.urgent === true
    ) {
      priority = "high";
    } else if (newsItem.priority === "low" || newsItem.minor === true) {
      priority = "low";
    }

    const newsId = newsItem.id || index;
    const fullUrl = `${CONFIG.nlobby.baseUrl}/news/${newsId}`;

    const announcement: NLobbyAnnouncement = {
      id: newsItem.id?.toString() || index.toString(),
      title,
      content,
      publishedAt: publishedDate,
      category,
      priority,
      targetAudience: (newsItem.targetAudience as (
        | "student"
        | "parent"
        | "staff"
      )[]) || ["student"],
      url: fullUrl,
      menuName: newsItem.menuName,
      isImportant: Boolean(newsItem.isImportant),
      isUnread: Boolean(newsItem.isUnread),
      ...Object.fromEntries(
        Object.entries(newsItem).filter(
          ([key]) =>
            ![
              "id",
              "title",
              "content",
              "publishedAt",
              "category",
              "priority",
              "url",
            ].includes(key),
        ),
      ),
    };

    return announcement;
  });
}

function parseAnnouncementsWithCheerio(html: string): NLobbyAnnouncement[] {
  try {
    logger.info("[TARGET] Starting Cheerio-based DOM parsing...");
    const $ = cheerio.load(html);

    const presentationDivs = $('div[role="presentation"]');
    logger.info(
      `[INFO] Found ${presentationDivs.length} div[role="presentation"] elements`,
    );

    if (presentationDivs.length < 2) {
      logger.info(
        '[WARNING] Less than 2 div[role="presentation"] elements found',
      );
      return [];
    }

    const dataGridContent = $(presentationDivs[1]);
    logger.info('[SUCCESS] Located second div[role="presentation"] element');

    const rows = dataGridContent.find('div[role="row"]');
    logger.info(`[INFO] Found ${rows.length} DataGrid rows`);

    const announcements: NLobbyAnnouncement[] = [];

    rows.each((index: number, rowElement: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const $row = $(rowElement as any);
        const rowId = $row.attr("data-id");

        if (!rowId) {
          return;
        }

        const cells = $row.find('div[role="gridcell"]');

        let title = "";
        let category = "";
        let publishedAt = new Date();
        let isImportant = false;
        let isUnread = false;
        let url = "";

        cells.each((_cellIndex: number, cellElement: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const $cell = $(cellElement as any);
          const field = $cell.attr("data-field");

          switch (field) {
            case "title": {
              const link = $cell.find("a");
              if (link.length > 0) {
                const hrefUrl = link.attr("href");
                if (hrefUrl && hrefUrl.startsWith("/news/")) {
                  url = `${CONFIG.nlobby.baseUrl}${hrefUrl}`;
                } else {
                  url = `${CONFIG.nlobby.baseUrl}/news/${rowId}`;
                }
                const titleSpan = link.find("span");
                title =
                  titleSpan.length > 0
                    ? titleSpan.text().trim()
                    : link.text().trim();
              } else {
                title = $cell.text().trim();
                url = `${CONFIG.nlobby.baseUrl}/news/${rowId}`;
              }
              break;
            }

            case "menuName":
              category = $cell.text().trim();
              break;

            case "isImportant": {
              isImportant =
                $cell.text().trim().length > 0 || $cell.find("*").length > 0;
              break;
            }

            case "isUnread": {
              const unreadText = $cell.text().trim();
              isUnread = unreadText.includes("未読") || unreadText.length > 0;
              break;
            }

            case "publishedAt": {
              const dateText = $cell.text().trim();
              if (dateText) {
                const parsedDate = new Date(dateText.replace(/\//g, "-"));
                if (!isNaN(parsedDate.getTime())) {
                  publishedAt = parsedDate;
                }
              }
              break;
            }
          }
        });

        if (title) {
          const finalUrl = url || `${CONFIG.nlobby.baseUrl}/news/${rowId}`;

          const announcement: NLobbyAnnouncement = {
            id: rowId,
            title,
            content: "",
            publishedAt,
            category: category || "General",
            priority: isImportant ? "high" : "medium",
            targetAudience: ["student"],
            url: finalUrl,
            menuName: category,
            isImportant,
            isUnread,
          };

          announcements.push(announcement);
        }
      } catch (rowError) {
        logger.error(
          `[ERROR] Error parsing row ${index}:`,
          rowError instanceof Error ? rowError.message : "Unknown error",
        );
      }
    });

    logger.info(
      `[TARGET] Cheerio parsing completed: ${announcements.length} news items extracted`,
    );
    return announcements;
  } catch (error) {
    logger.error(
      "[ERROR] Cheerio parsing failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}

function parseNewsFromHtml(html: string): NLobbyAnnouncement[] {
  const announcements: NLobbyAnnouncement[] = [];

  try {
    logger.info("[INFO] Starting HTML parsing...");

    const nextFPushMatches = html.match(/self\.__next_f\.push\((\[.*?\])\)/g);

    if (nextFPushMatches && nextFPushMatches.length > 0) {
      logger.info(
        `[SUCCESS] Found ${nextFPushMatches.length} self.__next_f.push() calls`,
      );

      for (let i = 0; i < nextFPushMatches.length; i++) {
        const pushCall = nextFPushMatches[i];
        try {
          const jsonMatch = pushCall.match(/self\.__next_f\.push\((\[.*?\])\)/);
          if (!jsonMatch) continue;

          const pushData = JSON.parse(jsonMatch[1]);

          if (pushData.length >= 2 && typeof pushData[1] === "string") {
            const stringData = pushData[1];

            const prefixMatch = stringData.match(/^(\d+):(.*)/);
            if (prefixMatch) {
              try {
                const actualJsonString = prefixMatch[2];
                const parsedContent = JSON.parse(actualJsonString);

                if (Array.isArray(parsedContent)) {
                  for (let j = 0; j < parsedContent.length; j++) {
                    const item = parsedContent[j];
                    if (
                      Array.isArray(item) &&
                      item.length >= 4 &&
                      item[3] &&
                      typeof item[3] === "object"
                    ) {
                      const componentData = item[3];

                      if (
                        componentData.news &&
                        Array.isArray(componentData.news)
                      ) {
                        if (componentData.news.length > 0) {
                          const firstNews = componentData.news[0];
                          if (
                            firstNews &&
                            typeof firstNews === "object" &&
                            (firstNews.id ||
                              firstNews.title ||
                              firstNews.microCmsId)
                          ) {
                            return transformNewsToAnnouncements(
                              componentData.news,
                            );
                          }
                        }
                      }
                    }
                  }
                }
              } catch {
                // continue
              }
            } else {
              try {
                const innerData = JSON.parse(stringData);
                const foundNews = searchForNewsInData(
                  innerData,
                  `push_call_${i + 1}_fallback`,
                );
                if (foundNews && foundNews.length > 0) {
                  return transformNewsToAnnouncements(foundNews);
                }
              } catch {
                // continue
              }
            }
          }

          const foundNews = searchForNewsInData(
            pushData,
            `push_call_${i + 1}_direct`,
          );
          if (foundNews && foundNews.length > 0) {
            return transformNewsToAnnouncements(foundNews);
          }
        } catch {
          // continue
        }
      }
    }

    // Cheerio fallback
    const cheerioAnnouncements = parseAnnouncementsWithCheerio(html);
    if (cheerioAnnouncements && cheerioAnnouncements.length > 0) {
      return cheerioAnnouncements;
    }

    // __NEXT_DATA__ fallback
    const nextDataMatches = [
      html.match(/window\.__NEXT_DATA__\s*=\s*({.*?})\s*(?:;|<\/script>)/s),
      html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/s),
    ];

    for (const nextDataMatch of nextDataMatches) {
      if (nextDataMatch) {
        try {
          const jsonData = nextDataMatch[1] || nextDataMatch[0];
          const nextData = JSON.parse(jsonData);
          const foundNews = searchForNewsInData(nextData, "__NEXT_DATA__");
          if (foundNews && foundNews.length > 0) {
            return transformNewsToAnnouncements(foundNews);
          }
        } catch {
          // continue
        }
      }
    }
  } catch (error) {
    logger.error("[ERROR] Error parsing news from HTML:", error);
  }

  return announcements;
}

function parseNewsDetailFromHtml(
  html: string,
  newsId: string,
): NLobbyNewsDetail | null {
  try {
    const nextFPushMatches = html.match(/self\.__next_f\.push\((\[.*?\])\)/g);

    if (!nextFPushMatches || nextFPushMatches.length === 0) {
      return null;
    }

    let newsData: NewsData | null = null;
    let contentData: string = "";
    const contentReferences: Map<string, string> = new Map();

    for (let i = 0; i < nextFPushMatches.length; i++) {
      const pushCall = nextFPushMatches[i];
      try {
        const jsonMatch = pushCall.match(/self\.__next_f\.push\((\[.*?\])\)/);
        if (!jsonMatch) continue;

        const pushData = JSON.parse(jsonMatch[1]);

        if (
          pushData.length >= 2 &&
          typeof pushData[1] === "string" &&
          pushData[1].match(/^\d+:T\d+,?$/)
        ) {
          const refKey = pushData[1].replace(/,$/, "");

          if (i + 1 < nextFPushMatches.length) {
            const nextPushCall = nextFPushMatches[i + 1];
            const nextJsonMatch = nextPushCall.match(
              /self\.__next_f\.push\((\[.*?\])\)/,
            );
            if (nextJsonMatch) {
              const nextPushData = JSON.parse(nextJsonMatch[1]);
              if (
                nextPushData.length >= 2 &&
                typeof nextPushData[1] === "string"
              ) {
                contentReferences.set(refKey, nextPushData[1]);
              }
            }
          }
          continue;
        }

        if (pushData.length >= 2 && typeof pushData[1] === "string") {
          const stringData = pushData[1];

          const prefixMatch = stringData.match(/^(\d+):(.*)/);
          if (prefixMatch) {
            try {
              const actualJsonString = prefixMatch[2];
              const parsedContent = JSON.parse(actualJsonString);

              const foundNewsData = searchForNewsDataInObject(parsedContent);
              if (foundNewsData) {
                newsData = foundNewsData;
              }
            } catch {
              // continue
            }
          }
        }
      } catch {
        // continue
      }
    }

    if (!newsData) {
      return null;
    }

    if (newsData.description) {
      for (const [refKey, content] of contentReferences) {
        if (newsData.description.includes(refKey)) {
          contentData = content;
          break;
        }
      }
    }

    if (!contentData && contentReferences.size > 0) {
      contentData = Array.from(contentReferences.values())[0];
    }

    const newsDetail: NLobbyNewsDetail = {
      id: newsData.id || newsId,
      microCmsId: newsData.microCmsId,
      title: newsData.title || "No Title",
      content: decodeHtmlContent(contentData) || newsData.description || "",
      description: newsData.description,
      publishedAt: newsData.publishedAt
        ? new Date(newsData.publishedAt)
        : new Date(),
      menuName: newsData.menuName || [],
      isImportant: newsData.isImportant || false,
      isByMentor: newsData.isByMentor || false,
      attachments: newsData.attachments || [],
      relatedEvents: newsData.relatedEvents || [],
      targetUserQueryId: newsData.targetUserQueryId,
      url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
    };

    return newsDetail;
  } catch (error) {
    logger.error("[ERROR] Error parsing news detail from HTML:", error);
    return null;
  }
}

// ---- Public module functions ----

export async function getNews(ctx: ApiContext): Promise<NLobbyAnnouncement[]> {
  logger.info("[INFO] Starting getNews with HTTP client...");
  logger.info("[STATUS] Current authentication status:", ctx.getCookieStatus());

  try {
    const html = await fetchRenderedHtml(ctx, "/news");
    const news = parseNewsFromHtml(html);

    if (news && news.length > 0) {
      logger.info(`[SUCCESS] Retrieved ${news.length} news items from HTML`);
      return news;
    } else {
      const debugInfo = `HTML scraping returned no data. Debug info:
- Authentication status: ${ctx.nextAuth.isAuthenticated() ? "authenticated" : "not authenticated"}
- HTTP cookies: ${ctx.httpClient.defaults.headers.Cookie ? "present" : "missing"}
- HTML length: ${html.length} characters

Troubleshooting steps:
1. Run 'health_check' to verify connection
2. Ensure you are properly authenticated using 'set_cookies'`;

      throw new Error(debugInfo);
    }
  } catch (error) {
    logger.error("[ERROR] getNews failed:", error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to fetch news: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function getNewsDetail(
  ctx: ApiContext,
  newsId: string,
): Promise<NLobbyNewsDetail> {
  logger.info(`[INFO] Fetching news detail for ID: ${newsId}`);

  try {
    const newsUrl = `/news/${newsId}`;
    const html = await fetchRenderedHtml(ctx, newsUrl);
    const newsDetail = parseNewsDetailFromHtml(html, newsId);

    if (newsDetail) {
      return newsDetail;
    } else {
      throw new Error(
        `Failed to parse news detail from HTML for news ID: ${newsId}`,
      );
    }
  } catch (error) {
    logger.error(`[ERROR] getNewsDetail failed for ID ${newsId}:`, error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to fetch news detail for ID ${newsId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function markNewsAsRead(
  ctx: ApiContext,
  id: string,
): Promise<unknown> {
  logger.info(`[INFO] Marking news article ${id} as read`);
  try {
    const result = await ctx.httpClient.post(
      "/api/trpc/news.upsertBrowsingHistory",
      `"${id}"`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: ctx.nextAuth.getCookieHeader(),
          Referer: `https://nlobby.nnn.ed.jp/news/${id}`,
        },
      },
    );

    logger.info(`[SUCCESS] News article ${id} marked as read`);
    return result.data;
  } catch (error) {
    logger.error(`[ERROR] Failed to mark news ${id} as read:`, error);
    throw error;
  }
}

export async function getUnreadNewsInfo(
  ctx: ApiContext,
): Promise<UnreadNewsInfo> {
  logger.info("[INFO] Fetching unread news info...");
  try {
    const result = await ctx.trpcClient.call<UnreadNewsInfo>(
      "news.getUnreadNewsInfo",
    );
    logger.info("[SUCCESS] getUnreadNewsInfo succeeded");
    return result;
  } catch (error) {
    logger.error("[ERROR] getUnreadNewsInfo failed:", error);
    throw error;
  }
}
