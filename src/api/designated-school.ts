import * as cheerio from "cheerio";
import type { ApiContext } from "./context.js";
import { logger } from "../logger.js";
import {
  fetchSecurePortalPage,
  resolveSecurePortalContext,
} from "./secure-portal.js";
import type {
  DesignatedSchoolDocument,
  DesignatedSchoolEntry,
  DesignatedSchoolIntro,
  DesignatedSchoolPageData,
  DesignatedSchoolSearchOptions,
} from "../types.js";

const DESIGNATED_SCHOOL_INDEX_PATH = "/mypage/designated_school/index";

function hasSearchOptions(options?: DesignatedSchoolSearchOptions): boolean {
  if (!options) return false;
  return (
    (options.prefectures?.length ?? 0) > 0 ||
    (options.schoolTypes?.length ?? 0) > 0 ||
    !!options.schoolName ||
    !!options.facultyName ||
    !!options.freeword ||
    !!options.selectionDeadlineBefore ||
    (options.page != null && options.page > 1)
  );
}

function extractSearchFormToken(html: string): string | undefined {
  const $ = cheerio.load(html);
  const token = $('form#_searched input[name="_"]').attr("value")?.trim();
  return token || undefined;
}

export function buildDesignatedSchoolPath(
  options?: DesignatedSchoolSearchOptions,
  formToken?: string,
): string {
  if (!options && !formToken) {
    return DESIGNATED_SCHOOL_INDEX_PATH;
  }

  const params = new URLSearchParams();

  for (const prefecture of options?.prefectures ?? []) {
    params.append("p", String(prefecture));
  }
  for (const schoolType of options?.schoolTypes ?? []) {
    params.append("t", String(schoolType));
  }
  if (options?.schoolName) {
    params.set("sn", options.schoolName);
    params.set("sne", options.schoolNameExact ? "true" : "false");
  }
  if (options?.facultyName) {
    params.set("fn", options.facultyName);
    params.set("fne", options.facultyNameExact ? "true" : "false");
  }
  if (options?.freeword) {
    params.set("fw", options.freeword);
    params.set("fwe", options.freewordExact ? "true" : "false");
  }
  if (options?.selectionDeadlineBefore) {
    params.set("d", options.selectionDeadlineBefore);
  }
  if (options?.page && options.page > 1) {
    params.set("page", String(options.page));
  }
  if (formToken) {
    params.set("_", formToken);
  }

  const query = params.toString();
  return query
    ? `${DESIGNATED_SCHOOL_INDEX_PATH}?${query}`
    : DESIGNATED_SCHOOL_INDEX_PATH;
}

function parseIntro(html: string): DesignatedSchoolIntro | undefined {
  const $ = cheerio.load(html);
  const $readme = $(".card.readme");
  if ($readme.length === 0) {
    return undefined;
  }

  const title =
    $("h2, h4").first().text().replace(/\s+/g, " ").trim() || undefined;

  const sections: DesignatedSchoolIntro["sections"] = [];
  $readme.find(".card-body > .bold").each((_, headingEl) => {
    const heading = $(headingEl).text().replace(/\s+/g, " ").trim();
    if (!heading) return;

    const contentParts: string[] = [];
    let $cursor = $(headingEl).next();
    while ($cursor.length > 0) {
      const tagName = ($cursor.prop("tagName") || "").toLowerCase();
      if ($cursor.hasClass("bold") || tagName === "hr") {
        break;
      }
      const text = $cursor.text().replace(/\s+/g, " ").trim();
      if (text) {
        contentParts.push(text);
      }
      $cursor = $cursor.next();
    }

    if (contentParts.length > 0) {
      sections.push({ heading, content: contentParts.join("\n") });
    }
  });

  const updates: string[] = [];
  $readme.find(".card-body > .bold").each((_, headingEl) => {
    const heading = $(headingEl).text().replace(/\s+/g, " ").trim();
    if (heading !== "更新情報") return;

    let $cursor = $(headingEl).next();
    while ($cursor.length > 0) {
      const tagName = ($cursor.prop("tagName") || "").toLowerCase();
      if ($cursor.hasClass("bold") || tagName === "hr") {
        break;
      }
      const text = $cursor.text().replace(/\s+/g, " ").trim();
      if (text) {
        updates.push(text);
      }
      $cursor = $cursor.next();
    }
  });

  const documents: DesignatedSchoolDocument[] = [];
  const seenDocuments = new Set<string>();
  $readme.find("a.info-pdf-link").each((_, link) => {
    const $link = $(link);
    const title = $link.text().replace(/\s+/g, " ").trim();
    if (!title || seenDocuments.has(title)) return;
    seenDocuments.add(title);

    documents.push({
      title,
      pdfUrl: $link.attr("data-pdf-url")?.trim(),
      disabled: $link.find("button[disabled]").length > 0,
    });
  });

  $readme.find("button.download-pdf[disabled]").each((_, button) => {
    const title = $(button).text().replace(/\s+/g, " ").trim();
    if (!title || seenDocuments.has(title)) return;
    seenDocuments.add(title);
    documents.push({ title, disabled: true });
  });

  return {
    title: title || undefined,
    sections,
    updates,
    documents,
  };
}

function parseSchoolHeading(
  $: cheerio.CheerioAPI,
  $heading: ReturnType<cheerio.CheerioAPI>,
): { schoolName: string; course?: string } {
  const parts = ($heading.html() || "")
    .split(/<br\s*\/?>/i)
    .map((part) => cheerio.load(part).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    schoolName: parts[0] || $heading.text().replace(/\s+/g, " ").trim(),
    course: parts.length > 1 ? parts.slice(1).join(" / ") : undefined,
  };
}

function parseDateTable(
  $: cheerio.CheerioAPI,
  $table: ReturnType<cheerio.CheerioAPI>,
): Record<string, string> {
  const dates: Record<string, string> = {};

  $table.children("div").each((_, block) => {
    const $block = $(block);
    const label = $block
      .children("div")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const value = $block
      .children("div")
      .last()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (label && value && label !== value) {
      dates[label] = value;
    }
  });

  return dates;
}

function parseBadges(
  $: cheerio.CheerioAPI,
  $card: ReturnType<cheerio.CheerioAPI>,
): { badges: string[]; quota?: string; applicationType?: string } {
  const badges: string[] = [];
  let quota: string | undefined;
  let applicationType: string | undefined;

  $card.find(".generic-badge").each((_, badge) => {
    const text = $(badge).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    badges.push(text);
    if (text.startsWith("推薦枠数")) {
      quota = text;
    } else if (text.startsWith("出願形式")) {
      applicationType = text;
    }
  });

  return { badges, quota, applicationType };
}

function parseResultCard(
  $: cheerio.CheerioAPI,
  $card: ReturnType<cheerio.CheerioAPI>,
  secureHost: string,
): DesignatedSchoolEntry | null {
  const code = $card
    .find(".code-code")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (!code) {
    return null;
  }

  const heading = $card.find(".result-top h6").first();
  const { schoolName, course } = parseSchoolHeading($, heading);

  const typeAndPref = $card
    .find(".school-type-and-pref")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const [schoolType, prefecture] = typeAndPref
    .split("|")
    .map((part) => part.trim());

  const { badges, quota, applicationType } = parseBadges($, $card);
  const dates = parseDateTable($, $card.find(".dates-table").first());

  const pdfHref = $card
    .find('a[href*="designated_school/viewPdf"]')
    .first()
    .attr("href")
    ?.replace(/&amp;/g, "&");
  const pdfId = pdfHref?.match(/[?&]id=(\d+)/)?.[1];
  const pdfUrl = pdfHref
    ? pdfHref.startsWith("http")
      ? pdfHref
      : `https://${secureHost}${pdfHref}`
    : undefined;

  const note = $card.find(".note").first().text().replace(/\s+/g, " ").trim();

  return {
    code,
    schoolName,
    course,
    schoolType: schoolType || undefined,
    prefecture: prefecture || undefined,
    quota,
    applicationType,
    selectionDeadline: dates["校内選考〆切日"],
    applicationStartDate: dates["出願開始日"],
    applicationDeadline: dates["出願〆切日"],
    note: note || undefined,
    pdfId,
    pdfUrl,
    badges,
  };
}

function parsePagination(html: string): {
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
} {
  const $ = cheerio.load(html);
  const totalCountText = $(".count-number").first().text().trim();
  const totalCount = totalCountText ? Number(totalCountText) : undefined;

  const pageNumbers: number[] = [];
  $("#pagerHeader .page-link, #pagerFooter .page-link").each((_, link) => {
    const pageAttr = $(link).attr("data-pager-page");
    if (pageAttr) {
      const page = Number(pageAttr);
      if (!Number.isNaN(page)) {
        pageNumbers.push(page);
      }
      return;
    }

    const text = $(link).text().replace(/\s+/g, "").trim();
    if (/^\d+$/.test(text)) {
      pageNumbers.push(Number(text));
    }
  });

  const totalPages =
    pageNumbers.length > 0 ? Math.max(...pageNumbers) : undefined;
  const currentPage = $("#pagerHeader .page-item.active .page-link")
    .first()
    .text()
    .replace(/\s+/g, "")
    .trim();
  const parsedCurrentPage = /^\d+$/.test(currentPage) ? Number(currentPage) : 1;

  return {
    totalCount: Number.isFinite(totalCount) ? totalCount : undefined,
    currentPage: parsedCurrentPage,
    totalPages,
  };
}

export function parseDesignatedSchoolHtml(
  html: string,
  secureHost: string,
): {
  intro?: DesignatedSchoolIntro;
  entries: DesignatedSchoolEntry[];
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  searchFormToken?: string;
} {
  const $ = cheerio.load(html);
  const intro = parseIntro(html);
  const entries: DesignatedSchoolEntry[] = [];

  $(".results > .card").each((_, card) => {
    const entry = parseResultCard($, $(card), secureHost);
    if (entry) {
      entries.push(entry);
    }
  });

  const pagination = parsePagination(html);
  const searchFormToken = extractSearchFormToken(html);

  return {
    intro,
    entries,
    searchFormToken,
    ...pagination,
  };
}

async function fetchDesignatedSchoolPage(
  ctx: ApiContext,
  portalPath: string,
): Promise<{
  html: string;
  finalUrl: string;
  portal: Awaited<ReturnType<typeof resolveSecurePortalContext>>;
}> {
  const portal = await resolveSecurePortalContext(ctx, portalPath);
  const page = await fetchSecurePortalPage({
    startUrl: portal.callbackUrl,
    cookies: portal.cookies,
    waitForSelector: "#main",
  });

  return {
    html: page.mainHtml || page.html,
    finalUrl: page.finalUrl,
    portal,
  };
}

export async function getDesignatedSchool(
  ctx: ApiContext,
  options?: DesignatedSchoolSearchOptions,
): Promise<DesignatedSchoolPageData> {
  logger.info("[INFO] Fetching designated school page from secure portal...");

  let formToken: string | undefined;
  if (hasSearchOptions(options)) {
    const bootstrap = await fetchDesignatedSchoolPage(
      ctx,
      DESIGNATED_SCHOOL_INDEX_PATH,
    );
    formToken = extractSearchFormToken(bootstrap.html);
  }

  const portalPath = buildDesignatedSchoolPath(options, formToken);
  const { html, finalUrl, portal } = await fetchDesignatedSchoolPage(
    ctx,
    portalPath,
  );
  const parsed = parseDesignatedSchoolHtml(html, portal.secureHost);

  logger.info(
    `[SUCCESS] Parsed ${parsed.entries.length} designated school entries (total: ${parsed.totalCount ?? "unknown"})`,
  );

  return {
    studentNo: portal.studentNo,
    secureHost: portal.secureHost,
    callbackUrl: portal.callbackUrl,
    targetUrl: portal.targetUrl,
    finalUrl,
    intro: parsed.intro,
    totalCount: parsed.totalCount,
    currentPage: parsed.currentPage,
    totalPages: parsed.totalPages,
    entries: parsed.entries,
    searchFormToken: parsed.searchFormToken,
  };
}

export async function getDesignatedSchoolPageHtml(
  ctx: ApiContext,
  options?: DesignatedSchoolSearchOptions,
): Promise<string> {
  let formToken: string | undefined;
  if (hasSearchOptions(options)) {
    const bootstrap = await fetchDesignatedSchoolPage(
      ctx,
      DESIGNATED_SCHOOL_INDEX_PATH,
    );
    formToken = extractSearchFormToken(bootstrap.html);
  }

  const portalPath = buildDesignatedSchoolPath(options, formToken);
  const { html } = await fetchDesignatedSchoolPage(ctx, portalPath);
  return html;
}
