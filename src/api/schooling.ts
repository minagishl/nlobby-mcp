import * as cheerio from "cheerio";
import type { ApiContext } from "./context.js";
import { logger } from "../logger.js";
import {
  fetchSecurePortalPage,
  resolveSecurePortalContext,
} from "./secure-portal.js";
import type {
  SchoolingPageData,
  SchoolingSession,
  SchoolingEntryDetail,
  SchoolingDetailField,
  SchoolingScheduleRow,
  SchoolingAttachment,
} from "../types.js";

const SCHOOLING_TOP_PATH = "/mypage/schooling/top";

function buildSchoolingDetailPath(entryId: string): string {
  return `/mypage/schooling/detail?entryId=${encodeURIComponent(entryId)}&ref=sctop`;
}

function extractEntryIdFromDetailUrl(detailUrl?: string): string | undefined {
  if (!detailUrl) return undefined;
  const match = detailUrl.match(/entryId=(\d+)/i);
  return match?.[1];
}

function extractLabeledFields(
  $: cheerio.CheerioAPI,
  $root: ReturnType<cheerio.CheerioAPI>,
): SchoolingDetailField[] {
  const fields: SchoolingDetailField[] = [];
  const seen = new Set<string>();

  $root.find(".generic-badge").each((_, badge) => {
    const $badge = $(badge);
    const label = $badge.text().replace(/\s+/g, " ").trim();
    if (!label) return;

    const $row = $badge.closest(".row");
    const value = $row
      .find(".col-9 span, .col-md-10 span, .col-9, .col-md-10")
      .last()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!value) return;

    const key = `${label}::${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ label, value });
  });

  $root.find("dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((_, dt) => {
      const label = $(dt).text().replace(/\s+/g, " ").trim();
      const value = $(dt).next("dd").text().replace(/\s+/g, " ").trim();
      if (!label || !value) return;
      const key = `${label}::${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      fields.push({ label, value });
    });
  });

  return fields;
}

function extractBoldDarkFields(
  $: cheerio.CheerioAPI,
  $root: ReturnType<cheerio.CheerioAPI>,
): SchoolingDetailField[] {
  const fields: SchoolingDetailField[] = [];

  $root.find(".bold-dark").each((_, labelEl) => {
    const label = $(labelEl).text().replace(/\s+/g, " ").trim();
    if (!label) return;

    const valueParts: string[] = [];
    let $cursor = $(labelEl).next();

    while ($cursor.length > 0) {
      const tagName = ($cursor.prop("tagName") || "").toLowerCase();
      if (tagName === "hr" || $cursor.hasClass("bold-dark")) {
        break;
      }

      if ($cursor.is(".read-more-container")) {
        const description = $cursor
          .find("[data-entry-descriptions]")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (description) {
          valueParts.push(description);
        }
      } else {
        const text = $cursor.text().replace(/\s+/g, " ").trim();
        if (text) {
          valueParts.push(text);
        }
      }

      $cursor = $cursor.next();
    }

    const value = valueParts.join("\n").trim();
    if (value && label !== "添付ファイル") {
      fields.push({ label, value });
    }
  });

  return fields;
}

function extractSchoolingAttachments(
  $: cheerio.CheerioAPI,
  $root: ReturnType<cheerio.CheerioAPI>,
): SchoolingAttachment[] {
  const attachments: SchoolingAttachment[] = [];

  $root.find("a.schooling-file-link").each((_, link) => {
    const $link = $(link);
    const fileId = $link.attr("data-file-id")?.trim();
    if (!fileId) return;

    attachments.push({
      fileId,
      fileName:
        $link.attr("data-file-name")?.trim() ||
        $link.text().replace(/\s+/g, " ").trim(),
    });
  });

  return attachments;
}

function extractScheduleRows(html: string): SchoolingScheduleRow[] {
  const $ = cheerio.load(html);
  const root = $("#main").length > 0 ? $("#main") : $("body");
  const rows: SchoolingScheduleRow[] = [];

  root.find("table").each((_, table) => {
    const $table = $(table);
    const tableRows = $table.find("tbody tr").length
      ? $table.find("tbody tr")
      : $table.find("tr");

    tableRows.each((rowIndex, row) => {
      const cells: string[] = [];
      $(row)
        .find("td, th")
        .each((_, cell) => {
          cells.push($(cell).text().replace(/\s+/g, " ").trim());
        });

      if (cells.length === 0) return;
      if (rowIndex === 0 && $(row).find("th").length > 0) {
        return;
      }
      rows.push({ cells });
    });
  });

  return rows;
}

export function parseSchoolingDetailHtml(
  html: string,
  entryId: string,
): Omit<
  SchoolingEntryDetail,
  "studentNo" | "secureHost" | "callbackUrl" | "targetUrl" | "finalUrl"
> {
  const $ = cheerio.load(html);
  const root = $("#main").length > 0 ? $("#main") : $("body");

  const title =
    root
      .find(".card .card-body h5")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim() ||
    root.find("h5").first().text().replace(/\s+/g, " ").trim() ||
    undefined;

  const status = root.find(".pill").first().text().replace(/\s+/g, " ").trim();

  const badgeFields = extractLabeledFields($, root);
  const boldDarkFields = extractBoldDarkFields($, root);
  const fields = [...badgeFields, ...boldDarkFields].filter(
    (field, index, all) => {
      const key = `${field.label}::${field.value}`;
      return (
        all.findIndex((item) => `${item.label}::${item.value}` === key) ===
        index
      );
    },
  );

  const descriptionField = fields.find((field) => field.label === "説明");
  const description = descriptionField?.value;
  const fieldsWithoutLongDescription = fields.filter(
    (field) => field.label !== "説明",
  );

  const attachments = extractSchoolingAttachments($, root);
  const scheduleRows = extractScheduleRows(html);

  return {
    entryId,
    title,
    status: status || undefined,
    fields: fieldsWithoutLongDescription,
    description,
    attachments: attachments.length > 0 ? attachments : undefined,
    scheduleRows: scheduleRows.length > 0 ? scheduleRows : undefined,
    detailUrl: buildSchoolingDetailPath(entryId),
  };
}

const HEADER_ALIASES: Record<string, keyof SchoolingSession> = {
  科目: "subjectName",
  教科: "subjectName",
  科目名: "subjectName",
  日程: "date",
  日時: "date",
  開催日: "date",
  日付: "date",
  時間: "time",
  会場: "location",
  場所: "location",
  教室: "location",
  出欠: "attendanceStatus",
  出席: "attendanceStatus",
  状態: "status",
  ステータス: "status",
  実施回: "sessionNumber",
  回: "sessionNumber",
  備考: "notes",
};

function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, "").trim();
}

function mapHeaderToField(header: string): keyof SchoolingSession | null {
  const normalized = normalizeHeader(header);
  if (HEADER_ALIASES[normalized]) {
    return HEADER_ALIASES[normalized];
  }

  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    if (normalized.includes(alias)) {
      return field;
    }
  }

  return null;
}

function assignSessionField(
  session: SchoolingSession,
  field: keyof SchoolingSession,
  value: string,
): void {
  if (!value) return;

  if (field === "subjectName" && !session.subjectName) {
    session.subjectName = value;
  } else if (field === "date" && !session.date) {
    session.date = value;
  } else if (field === "time" && !session.time) {
    session.time = value;
  } else if (field === "location" && !session.location) {
    session.location = value;
  } else if (field === "attendanceStatus" && !session.attendanceStatus) {
    session.attendanceStatus = value;
  } else if (field === "status" && !session.status) {
    session.status = value;
  } else if (field === "sessionNumber" && !session.sessionNumber) {
    session.sessionNumber = value;
  } else if (field === "notes" && !session.notes) {
    session.notes = value;
  }
}

function buildSessionFromCells(
  cells: string[],
  headers: string[],
): SchoolingSession | null {
  const nonEmptyCells = cells.filter((cell) => cell.trim().length > 0);
  if (nonEmptyCells.length === 0) {
    return null;
  }

  const session: SchoolingSession = {
    rawText: nonEmptyCells.join(" | "),
  };

  if (headers.length > 0) {
    for (let i = 0; i < cells.length; i++) {
      const header = headers[i] ?? "";
      const field = mapHeaderToField(header);
      if (field) {
        assignSessionField(session, field, cells[i]?.trim() ?? "");
      }
    }
  }

  if (!session.subjectName && cells[0]) {
    session.subjectName = cells[0].trim();
  }
  if (!session.date && cells[1]) {
    session.date = cells[1].trim();
  }
  if (!session.location && cells[2]) {
    session.location = cells[2].trim();
  }
  if (!session.attendanceStatus && cells[3]) {
    session.attendanceStatus = cells[3].trim();
  }

  return session;
}

function parseSchoolingTables(html: string): SchoolingSession[] {
  const $ = cheerio.load(html);
  const root = $("#main").length > 0 ? $("#main") : $("body");
  const sessions: SchoolingSession[] = [];

  root.find("table").each((_, table) => {
    const $table = $(table);
    const headers: string[] = [];

    $table.find("thead th").each((_, cell) => {
      headers.push($(cell).text().replace(/\s+/g, " ").trim());
    });

    if (headers.length === 0) {
      const firstRow = $table.find("tr").first();
      const firstRowCells = firstRow.find("th, td");
      const looksLikeHeader = firstRow.find("th").length > 0;

      if (looksLikeHeader) {
        firstRowCells.each((_, cell) => {
          headers.push($(cell).text().replace(/\s+/g, " ").trim());
        });
      }
    }

    const rows = $table.find("tbody tr").length
      ? $table.find("tbody tr")
      : $table.find("tr");

    rows.each((rowIndex, row) => {
      if (
        rowIndex === 0 &&
        headers.length > 0 &&
        $(row).find("th").length > 0
      ) {
        return;
      }

      const cells: string[] = [];
      $(row)
        .find("td, th")
        .each((_, cell) => {
          cells.push($(cell).text().replace(/\s+/g, " ").trim());
        });

      const session = buildSessionFromCells(cells, headers);
      if (session) {
        const detailLink = $(row).find('a[href*="schooling"]').attr("href");
        if (detailLink) {
          session.detailUrl = detailLink;
        }
        sessions.push(session);
      }
    });
  });

  return sessions;
}

function findBadgeValueInCard(
  $: cheerio.CheerioAPI,
  $card: ReturnType<cheerio.CheerioAPI>,
  label: string,
): string | undefined {
  let value: string | undefined;

  $card.find(".generic-badge").each((_, badge) => {
    const $badge = $(badge);
    if ($badge.text().replace(/\s+/g, "").trim() !== label) {
      return;
    }

    const $row = $badge.closest(".row");
    const text = $row
      .find(".col-9 span, .col-md-10 span, .col-9, .col-md-10")
      .last()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      value = text;
    }
  });

  return value;
}

function parseSchoolingCards(html: string): SchoolingSession[] {
  const $ = cheerio.load(html);
  const root = $("#main").length > 0 ? $("#main") : $("body");
  const sessions: SchoolingSession[] = [];

  root.find(".card").each((_, card) => {
    const $card = $(card);
    if ($card.hasClass("alert-success") || $card.hasClass("alert-info")) {
      return;
    }

    const $body = $card.find(".card-body").first();
    const title = $body.find("h5").first().text().replace(/\s+/g, " ").trim();
    if (!title) {
      return;
    }

    const date = findBadgeValueInCard($, $body, "実施期間");
    const location = findBadgeValueInCard($, $body, "会場");
    const status = $body
      .find(".pill")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const detailHref = $body.find('a[href*="schooling/detail"]').attr("href");
    const detailUrl = detailHref
      ? detailHref.replace(/&amp;/g, "&")
      : undefined;
    const entryId = extractEntryIdFromDetailUrl(detailUrl);

    const session: SchoolingSession = {
      entryId,
      subjectName: title,
      date,
      location,
      status: status || undefined,
      attendanceStatus: status || undefined,
      detailUrl,
      rawText: [title, date, location, status].filter(Boolean).join(" | "),
    };

    sessions.push(session);
  });

  return sessions;
}

function parseSchoolingListItems(html: string): SchoolingSession[] {
  const $ = cheerio.load(html);
  const root = $("#main").length > 0 ? $("#main") : $("body");
  const sessions: SchoolingSession[] = [];

  root.find("li, .MuiListItem-root, [class*='ListItem']").each((_, item) => {
    const text = $(item).text().replace(/\s+/g, " ").trim();
    if (
      text.length < 4 ||
      !/スクーリング|schooling|出席|会場|科目/u.test(text)
    ) {
      return;
    }

    sessions.push({
      rawText: text,
      detailUrl: $(item).find('a[href*="schooling"]').attr("href"),
    });
  });

  return sessions;
}

function extractSchoolingSummary(html: string): SchoolingPageData["summary"] {
  const $ = cheerio.load(html);
  const text = ($("#main").length > 0 ? $("#main") : $("body"))
    .text()
    .replace(/\s+/g, " ");

  const summary: SchoolingPageData["summary"] = {};

  const necessaryMatch = text.match(/必要回数\s*[:：]?\s*(\d+)/u);
  if (necessaryMatch) {
    summary.necessaryCount = Number(necessaryMatch[1]);
  }

  const attendanceMatch = text.match(/出席回数\s*[:：]?\s*(\d+)/u);
  if (attendanceMatch) {
    summary.attendanceCount = Number(attendanceMatch[1]);
  }

  const entryMatch = text.match(/登録回数\s*[:：]?\s*(\d+)/u);
  if (entryMatch) {
    summary.entryCount = Number(entryMatch[1]);
  }

  const remainingMatch = text.match(/残り\s*(\d+)\s*回/u);
  if (remainingMatch) {
    summary.remainingCount = Number(remainingMatch[1]);
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

export function parseSchoolingHtml(html: string): {
  sessions: SchoolingSession[];
  summary?: SchoolingPageData["summary"];
} {
  const cardSessions = parseSchoolingCards(html);
  const tableSessions = parseSchoolingTables(html);
  const listSessions = parseSchoolingListItems(html);
  const sessions =
    cardSessions.length > 0
      ? cardSessions
      : tableSessions.length > 0
        ? tableSessions
        : listSessions;
  const summary = extractSchoolingSummary(html);

  return { sessions, summary };
}

export async function getSchooling(
  ctx: ApiContext,
): Promise<SchoolingPageData> {
  logger.info("[INFO] Fetching schooling page from secure portal...");

  const portal = await resolveSecurePortalContext(ctx, SCHOOLING_TOP_PATH);
  const page = await fetchSecurePortalPage({
    startUrl: portal.callbackUrl,
    cookies: portal.cookies,
    waitForSelector: "#main",
  });

  const parsed = parseSchoolingHtml(page.mainHtml || page.html);

  const sessions = parsed.sessions.map((session) => ({
    ...session,
    entryId: session.entryId ?? extractEntryIdFromDetailUrl(session.detailUrl),
    detailUrl: session.detailUrl?.startsWith("http")
      ? session.detailUrl
      : session.detailUrl
        ? `https://${portal.secureHost}${session.detailUrl}`
        : undefined,
  }));

  logger.info(
    `[SUCCESS] Parsed ${parsed.sessions.length} schooling entries from secure portal`,
  );

  return {
    studentNo: portal.studentNo,
    secureHost: portal.secureHost,
    callbackUrl: portal.callbackUrl,
    targetUrl: portal.targetUrl,
    finalUrl: page.finalUrl,
    sessions,
    summary: parsed.summary,
  };
}

export async function getSchoolingPageHtml(ctx: ApiContext): Promise<string> {
  const portal = await resolveSecurePortalContext(ctx, SCHOOLING_TOP_PATH);
  const page = await fetchSecurePortalPage({
    startUrl: portal.callbackUrl,
    cookies: portal.cookies,
    waitForSelector: "#main",
  });
  return page.mainHtml || page.html;
}

export async function getSchoolingDetail(
  ctx: ApiContext,
  entryId: string,
): Promise<SchoolingEntryDetail> {
  const normalizedEntryId = entryId.trim();
  if (!/^\d+$/.test(normalizedEntryId)) {
    throw new Error(
      `Invalid schooling entry ID: ${entryId}. Expected a numeric entryId.`,
    );
  }

  logger.info(
    `[INFO] Fetching schooling detail for entryId=${normalizedEntryId}...`,
  );

  const detailPath = buildSchoolingDetailPath(normalizedEntryId);
  const portal = await resolveSecurePortalContext(ctx, detailPath);
  const page = await fetchSecurePortalPage({
    startUrl: portal.callbackUrl,
    cookies: portal.cookies,
    waitForSelector: "#main",
  });

  const parsed = parseSchoolingDetailHtml(
    page.mainHtml || page.html,
    normalizedEntryId,
  );

  return {
    ...parsed,
    studentNo: portal.studentNo,
    secureHost: portal.secureHost,
    callbackUrl: portal.callbackUrl,
    targetUrl: portal.targetUrl,
    finalUrl: page.finalUrl,
    detailUrl: `https://${portal.secureHost}${detailPath}`,
  };
}

export async function getSchoolingDetailPageHtml(
  ctx: ApiContext,
  entryId: string,
): Promise<string> {
  const detailPath = buildSchoolingDetailPath(entryId.trim());
  const portal = await resolveSecurePortalContext(ctx, detailPath);
  const page = await fetchSecurePortalPage({
    startUrl: portal.callbackUrl,
    cookies: portal.cookies,
    waitForSelector: "#main",
  });
  return page.mainHtml || page.html;
}
