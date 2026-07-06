import type { ApiContext } from "./context.js";
import { fetchRenderedHtml } from "./shared.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import type {
  NLobbyAnnouncement,
  NLobbyNewsDetail,
  NewsData,
  NewsItem,
  UnreadNewsInfo,
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

function normalizeDetailDescription(value: string): string {
  const trimmed = value.trim();
  // Next.js flight reference placeholder (e.g. "$2a")
  if (/^\$[a-z0-9]+$/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function extractNewsDetailBodyFromDom(html: string): string {
  try {
    const $ = cheerio.load(html);
    const lines = $("p.MuiTypography-body1")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0);

    if (lines.length === 0) {
      return "";
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

function buildPdfViewerUrl(
  rawHref: string,
  downloadFileName: string,
  newsId: string,
): string {
  let normalizedPath = rawHref.replace(/^\/+/, "");
  if (rawHref.startsWith("http")) {
    try {
      const parsed = new URL(rawHref);
      if (parsed.pathname.startsWith("/pdf-viewer/")) {
        return rawHref;
      }
      normalizedPath = parsed.pathname.replace(/^\/+/, "");
    } catch {
      return rawHref;
    }
  }

  const encodedPath = encodeURIComponent(normalizedPath);
  const encodedName = encodeURIComponent(downloadFileName);
  const encodedNewsId = encodeURIComponent(newsId);
  return `${CONFIG.nlobby.baseUrl}/pdf-viewer/${encodedPath}?df=${encodedName}&dcrt=news&cid=${encodedNewsId}`;
}

function normalizeNewsAttachments(
  attachments: Array<{
    href: string;
    fileName: string;
    downloadFileName: string;
  }>,
  newsId: string,
): Array<{ href: string; fileName: string; downloadFileName: string }> {
  return attachments.map((attachment) => ({
    ...attachment,
    href: buildPdfViewerUrl(
      attachment.href,
      attachment.downloadFileName || attachment.fileName,
      newsId,
    ),
  }));
}

function extractNextFPushPayloads(html: string): string[] {
  const marker = "self.__next_f.push(";
  const payloads: string[] = [];
  let searchStart = 0;

  while (searchStart < html.length) {
    const markerIndex = html.indexOf(marker, searchStart);
    if (markerIndex === -1) {
      break;
    }

    let cursor = markerIndex + marker.length;
    while (cursor < html.length && /\s/.test(html[cursor])) {
      cursor++;
    }

    if (html[cursor] !== "[") {
      searchStart = cursor + 1;
      continue;
    }

    const arrayStart = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let arrayEnd = -1;

    for (let i = arrayStart; i < html.length; i++) {
      const ch = html[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          arrayEnd = i;
          break;
        }
      }
    }

    if (arrayEnd !== -1) {
      payloads.push(html.slice(arrayStart, arrayEnd + 1));
      searchStart = arrayEnd + 1;
    } else {
      break;
    }
  }

  return payloads;
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

function parseAnnouncementsFromNewsLinks(html: string): NLobbyAnnouncement[] {
  try {
    const $ = cheerio.load(html);
    const announcements: NLobbyAnnouncement[] = [];
    const seenIds = new Set<string>();

    $('a[href^="/news/"]').each((_index: number, element: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const $link = $(element as any);
      const href = $link.attr("href");
      if (!href) {
        return;
      }

      const matched = href.match(/^\/news\/([^/?#]+)/);
      const newsId = matched?.[1];
      if (!newsId || seenIds.has(newsId)) {
        return;
      }

      const title = $link.text().replace(/\s+/g, " ").trim();
      if (!title || title.length < 2) {
        return;
      }

      seenIds.add(newsId);
      announcements.push({
        id: newsId,
        title,
        content: "",
        publishedAt: new Date(),
        category: "General",
        priority: "medium",
        targetAudience: ["student"],
        url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
        isImportant: false,
        isUnread: false,
      });
    });

    if (announcements.length > 0) {
      logger.info(
        `[TARGET] Anchor fallback extracted ${announcements.length} news links`,
      );
    }

    return announcements;
  } catch (error) {
    logger.error(
      "[ERROR] Anchor-based news parsing failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}

function parseNewsFromRawHtmlFragments(html: string): NLobbyAnnouncement[] {
  const decodedHtml = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const marker = '"news":[';
  let cursor = 0;
  const candidates: unknown[][] = [];

  while (cursor < decodedHtml.length) {
    const markerIndex = decodedHtml.indexOf(marker, cursor);
    if (markerIndex === -1) {
      break;
    }

    const arrayStart = markerIndex + marker.length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let arrayEnd = -1;

    for (let i = arrayStart; i < decodedHtml.length; i++) {
      const ch = decodedHtml[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          arrayEnd = i;
          break;
        }
      }
    }

    if (arrayEnd !== -1) {
      const rawArray = decodedHtml.slice(arrayStart, arrayEnd + 1);
      try {
        const parsed = JSON.parse(rawArray);
        if (Array.isArray(parsed) && parsed.length > 0) {
          candidates.push(parsed);
        }
      } catch {
        // Continue scanning other candidates
      }
      cursor = arrayEnd + 1;
    } else {
      break;
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0];
  logger.info(
    `[TARGET] Raw HTML fallback found news array candidates: ${candidates.length} (using length=${best.length})`,
  );

  return transformNewsToAnnouncements(best);
}

function parseNewsFromHtml(html: string): NLobbyAnnouncement[] {
  const announcements: NLobbyAnnouncement[] = [];

  try {
    logger.info("[INFO] Starting HTML parsing...");

    const nextFPushPayloads = extractNextFPushPayloads(html);

    if (nextFPushPayloads.length > 0) {
      logger.info(
        `[SUCCESS] Found ${nextFPushPayloads.length} self.__next_f.push() payloads`,
      );

      for (let i = 0; i < nextFPushPayloads.length; i++) {
        try {
          const pushData = JSON.parse(nextFPushPayloads[i]);

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

    // Anchor fallback for pages that hydrate list data client-side
    const anchorAnnouncements = parseAnnouncementsFromNewsLinks(html);
    if (anchorAnnouncements && anchorAnnouncements.length > 0) {
      return anchorAnnouncements;
    }

    const rawHtmlAnnouncements = parseNewsFromRawHtmlFragments(html);
    if (rawHtmlAnnouncements && rawHtmlAnnouncements.length > 0) {
      return rawHtmlAnnouncements;
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
    const nextFPushPayloads = extractNextFPushPayloads(html);

    if (nextFPushPayloads.length === 0) {
      return null;
    }

    let newsData: NewsData | null = null;
    let contentData: string = "";
    const contentReferences: Map<string, string> = new Map();

    for (let i = 0; i < nextFPushPayloads.length; i++) {
      try {
        const pushData = JSON.parse(nextFPushPayloads[i]);

        if (
          pushData.length >= 2 &&
          typeof pushData[1] === "string" &&
          pushData[1].match(/^\d+:T\d+,?$/)
        ) {
          const refKey = pushData[1].replace(/,$/, "");

          if (i + 1 < nextFPushPayloads.length) {
            const nextPushData = JSON.parse(nextFPushPayloads[i + 1]);
            if (
              nextPushData.length >= 2 &&
              typeof nextPushData[1] === "string"
            ) {
              contentReferences.set(refKey, nextPushData[1]);
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
      attachments: normalizeNewsAttachments(newsData.attachments || [], newsId),
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

function parseNewsDetailFromRawHtml(
  html: string,
  newsId: string,
): NLobbyNewsDetail | null {
  try {
    const decodedHtml = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const detailObjectStartToken = `{"newsId":"${newsId}"`;
    let searchPos = 0;
    let bestDetail: NLobbyNewsDetail | null = null;
    let bestScore = -1;
    while (searchPos < decodedHtml.length) {
      const detailObjectStart = decodedHtml.indexOf(
        detailObjectStartToken,
        searchPos,
      );
      if (detailObjectStart === -1) {
        break;
      }

      let objectEnd = -1;
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = detailObjectStart; i < decodedHtml.length; i++) {
        const ch = decodedHtml[i];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            objectEnd = i;
            break;
          }
        }
      }

      if (objectEnd === -1) {
        break;
      }

      const rawDetailObject = decodedHtml.slice(
        detailObjectStart,
        objectEnd + 1,
      );
      try {
        const parsedDetail = JSON.parse(rawDetailObject) as Record<
          string,
          unknown
        >;
        const header =
          parsedDetail.header && typeof parsedDetail.header === "object"
            ? (parsedDetail.header as Record<string, unknown>)
            : {};
        const documentTable =
          parsedDetail.documentTable &&
          typeof parsedDetail.documentTable === "object"
            ? (parsedDetail.documentTable as Record<string, unknown>)
            : {};

        const publishedAtText =
          typeof header.publishedAt === "string" ? header.publishedAt : "";
        const normalizedPublishedAt = publishedAtText
          .replace(/年|月/g, "-")
          .replace(/日/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const publishedAt =
          normalizedPublishedAt.length > 0
            ? new Date(normalizedPublishedAt)
            : new Date();
        const safePublishedAt = isNaN(publishedAt.getTime())
          ? new Date()
          : publishedAt;

        const rawDescription =
          typeof parsedDetail.description === "string"
            ? parsedDetail.description
            : "";
        let description = normalizeDetailDescription(
          decodeHtmlContent(rawDescription),
        );
        if (!description) {
          description = extractNewsDetailBodyFromDom(html);
        }
        const title =
          typeof header.title === "string"
            ? header.title
            : typeof parsedDetail.title === "string"
              ? parsedDetail.title
              : "No Title";
        const downloadItems = Array.isArray(documentTable.downloadItems)
          ? (documentTable.downloadItems as Array<Record<string, unknown>>)
          : [];
        const score =
          (title !== "No Title" ? 2 : 0) +
          (description.length > 3 ? 2 : 0) +
          (downloadItems.length > 0 ? 1 : 0);
        const attachments = downloadItems
          .map((item) => {
            const href = typeof item.href === "string" ? item.href : "";
            const fileName =
              typeof item.fileName === "string" ? item.fileName : "";
            const downloadFileName =
              typeof item.downloadFileName === "string"
                ? item.downloadFileName
                : fileName;
            if (!href || !fileName) {
              return null;
            }
            return {
              href: href.startsWith("http")
                ? href
                : `${CONFIG.nlobby.baseUrl}/${href}`,
              fileName,
              downloadFileName,
            };
          })
          .filter(
            (
              item,
            ): item is {
              href: string;
              fileName: string;
              downloadFileName: string;
            } => !!item,
          );
        const normalizedAttachments = normalizeNewsAttachments(
          attachments,
          newsId,
        );

        const detail: NLobbyNewsDetail = {
          id: newsId,
          title,
          content: description,
          description,
          publishedAt: safePublishedAt,
          menuName: [],
          isImportant: Boolean(header.isImportant),
          isByMentor: Boolean(header.isByMentor),
          attachments: normalizedAttachments,
          relatedEvents: [],
          url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
        };
        if (score > bestScore) {
          bestScore = score;
          bestDetail = detail;
        }
      } catch {
        // try next match
      }
      searchPos = objectEnd + 1;
    }
    if (bestDetail) {
      return bestDetail;
    }

    const idTokens = [`"id":"${newsId}"`, `"newsId":"${newsId}"`];
    const idIndex = Math.max(
      ...idTokens.map((token) => decodedHtml.indexOf(token)),
    );
    if (idIndex === -1) {
      return null;
    }

    let objectStart = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = idIndex; i >= 0; i--) {
      const ch = decodedHtml[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "}") {
        depth++;
      } else if (ch === "{") {
        if (depth === 0) {
          objectStart = i;
          break;
        }
        depth--;
      }
    }
    if (objectStart === -1) {
      return null;
    }

    let objectEnd = -1;
    depth = 0;
    inString = false;
    escaped = false;
    for (let i = objectStart; i < decodedHtml.length; i++) {
      const ch = decodedHtml[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objectEnd = i;
          break;
        }
      }
    }
    if (objectEnd === -1) {
      return null;
    }

    const rawObject = decodedHtml.slice(objectStart, objectEnd + 1);
    const parsedObject = JSON.parse(rawObject) as Record<string, unknown>;

    if ("header" in parsedObject || "newsId" in parsedObject) {
      const header =
        parsedObject.header && typeof parsedObject.header === "object"
          ? (parsedObject.header as Record<string, unknown>)
          : {};
      const documentTable =
        parsedObject.documentTable &&
        typeof parsedObject.documentTable === "object"
          ? (parsedObject.documentTable as Record<string, unknown>)
          : {};

      const publishedAtText =
        typeof header.publishedAt === "string" ? header.publishedAt : "";
      const normalizedPublishedAt = publishedAtText
        .replace(/年|月/g, "-")
        .replace(/日/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const publishedAt =
        normalizedPublishedAt.length > 0
          ? new Date(normalizedPublishedAt)
          : new Date();
      const safePublishedAt = isNaN(publishedAt.getTime())
        ? new Date()
        : publishedAt;

      const rawDescription =
        typeof parsedObject.description === "string"
          ? parsedObject.description
          : "";
      const description = decodeHtmlContent(rawDescription);
      const title =
        typeof header.title === "string"
          ? header.title
          : typeof parsedObject.title === "string"
            ? parsedObject.title
            : "No Title";

      const downloadItems = Array.isArray(documentTable.downloadItems)
        ? (documentTable.downloadItems as Array<Record<string, unknown>>)
        : [];
      const attachments = downloadItems
        .map((item) => {
          const href = typeof item.href === "string" ? item.href : "";
          const fileName =
            typeof item.fileName === "string" ? item.fileName : "";
          const downloadFileName =
            typeof item.downloadFileName === "string"
              ? item.downloadFileName
              : fileName;
          if (!href || !fileName) {
            return null;
          }
          return {
            href: href.startsWith("http")
              ? href
              : `${CONFIG.nlobby.baseUrl}/${href}`,
            fileName,
            downloadFileName,
          };
        })
        .filter(
          (
            item,
          ): item is {
            href: string;
            fileName: string;
            downloadFileName: string;
          } => !!item,
        );
      const normalizedAttachments = normalizeNewsAttachments(
        attachments,
        newsId,
      );

      return {
        id: newsId,
        title,
        content: description,
        description,
        publishedAt: safePublishedAt,
        menuName: [],
        isImportant: Boolean(header.isImportant),
        isByMentor: Boolean(header.isByMentor),
        attachments: normalizedAttachments,
        relatedEvents: [],
        url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
      };
    }

    const newsData = parsedObject as NewsData;
    const description = normalizeDetailDescription(
      typeof newsData.description === "string" ? newsData.description : "",
    );
    const content =
      normalizeDetailDescription(decodeHtmlContent(description)) ||
      extractNewsDetailBodyFromDom(html);

    return {
      id: newsData.id || newsId,
      microCmsId: newsData.microCmsId,
      title: newsData.title || "No Title",
      content: content || description || "",
      description,
      publishedAt: newsData.publishedAt
        ? new Date(newsData.publishedAt)
        : new Date(),
      menuName: Array.isArray(newsData.menuName) ? newsData.menuName : [],
      isImportant: Boolean(newsData.isImportant),
      isByMentor: Boolean(newsData.isByMentor),
      attachments: normalizeNewsAttachments(newsData.attachments || [], newsId),
      relatedEvents: newsData.relatedEvents || [],
      targetUserQueryId: newsData.targetUserQueryId,
      url: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
    };
  } catch {
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
      logger.warn(
        "[WARNING] getNews could not extract news items from HTML or fallback; returning empty list",
      );
      return [];
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
    const newsDetail =
      parseNewsDetailFromHtml(html, newsId) ??
      parseNewsDetailFromRawHtml(html, newsId);

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
    const result = await ctx.trpcClient.call("news.upsertBrowsingHistory", id, {
      postOnly: true,
    });

    logger.info(`[SUCCESS] News article ${id} marked as read`);
    return result;
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

export async function downloadNewsAttachment(
  ctx: ApiContext,
  newsId: string,
  attachmentIndex: number = 0,
  outputDir: string = ".",
): Promise<string> {
  const detail = await getNewsDetail(ctx, newsId);
  const attachments = detail.attachments || [];
  if (attachments.length === 0) {
    throw new Error(`No attachments found for news ID: ${newsId}`);
  }
  if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
    throw new Error(
      `Attachment index out of range: ${attachmentIndex + 1} (available: 1-${attachments.length})`,
    );
  }

  const attachment = attachments[attachmentIndex];
  const targetName =
    attachment.downloadFileName ||
    attachment.fileName.split("/").pop() ||
    `news-${newsId}-attachment-${attachmentIndex + 1}.pdf`;
  const outputPath = path.resolve(outputDir, targetName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const response = await fetch(attachment.href, {
    method: "GET",
    headers: {
      Cookie: ctx.httpClient.defaults.headers["Cookie"] || "",
      "User-Agent": CONFIG.userAgent,
      Referer: `${CONFIG.nlobby.baseUrl}/news/${newsId}`,
      Accept: "application/pdf,*/*",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download attachment (${response.status} ${response.statusText})`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}
