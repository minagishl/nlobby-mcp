import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type CookieParam } from "puppeteer";
import type { ApiContext } from "./context.js";
import { fetchRenderedHtml } from "./shared.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type { NLobbyAccountInfo, StandardApiResponse } from "../types.js";

type UnknownObject = Record<string, unknown>;

// ---- Private helpers ----

function parseNextJsFlightPayload(payload: string): unknown | null {
  if (typeof payload !== "string" || payload.length === 0) {
    return null;
  }

  let candidate = payload.trim();
  const colonIndex = candidate.indexOf(":");

  if (colonIndex > 0 && colonIndex < 20) {
    const prefix = candidate.slice(0, colonIndex);
    if (/^[a-z0-9]+$/i.test(prefix)) {
      candidate = candidate.slice(colonIndex + 1);
    }
  }

  candidate = candidate.trim();

  const htmlDecoded = candidate
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  try {
    return JSON.parse(htmlDecoded);
  } catch {
    return null;
  }
}

function findSessionInData(
  data: unknown,
  visited: WeakSet<object>,
): UnknownObject | null {
  if (data === null || data === undefined) {
    return null;
  }

  if (typeof data === "string") {
    const parsed = parseNextJsFlightPayload(data);
    if (parsed) {
      return findSessionInData(parsed, visited);
    }
    return null;
  }

  if (Array.isArray(data)) {
    const arrayObject = data as unknown as object;
    if (visited.has(arrayObject)) {
      return null;
    }
    visited.add(arrayObject);

    for (const item of data) {
      const found = findSessionInData(item, visited);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof data === "object") {
    const objectData = data as UnknownObject;
    if (visited.has(objectData)) {
      return null;
    }
    visited.add(objectData);

    if (
      Object.prototype.hasOwnProperty.call(objectData, "session") &&
      objectData.session &&
      typeof objectData.session === "object"
    ) {
      return objectData.session as UnknownObject;
    }

    for (const value of Object.values(objectData)) {
      const found = findSessionInData(value, visited);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractSessionFromNextJs(html: string): UnknownObject | null {
  const pushRegex = /self\.__next_f\.push\((\[[\s\S]*?\])\)/g;
  let match: RegExpExecArray | null;

  while ((match = pushRegex.exec(html)) !== null) {
    const rawJson = match[1];
    if (!rawJson) {
      continue;
    }

    try {
      const pushData = JSON.parse(rawJson);
      const session = findSessionInData(pushData, new WeakSet<object>());

      if (session) {
        logger.info("[SUCCESS] Found session data in Next.js flight payload");
        return session;
      }
    } catch {
      // continue
    }
  }

  const nextDataRegexes = [
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?})(?:;|\s*<\/script>)/,
  ];

  for (const regex of nextDataRegexes) {
    const nextDataMatch = html.match(regex);
    if (!nextDataMatch || !nextDataMatch[1]) {
      continue;
    }

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const session = findSessionInData(nextData, new WeakSet<object>());
      if (session) {
        logger.info("[SUCCESS] Found session data in __NEXT_DATA__ payload");
        return session;
      }
    } catch {
      // continue
    }
  }

  return null;
}

function buildAccountInfoFromSession(
  sessionData: UnknownObject,
): NLobbyAccountInfo {
  const user = (sessionData.user ?? {}) as UnknownObject;
  const kmsLogin = (user.kmsLogin ?? {}) as UnknownObject;
  const kmsContent = (kmsLogin.content ?? {}) as UnknownObject;

  let image: string | null | undefined;
  if (typeof user.image === "string") {
    image = user.image !== "$undefined" ? user.image : null;
  } else if (user.image === null) {
    image = null;
  }

  return {
    name: typeof user.name === "string" ? user.name : null,
    email: typeof user.email === "string" ? user.email : null,
    role: typeof user.role === "string" ? user.role : null,
    image,
    userId:
      typeof kmsContent.userId === "string" ? kmsContent.userId : undefined,
    studentNo:
      typeof kmsContent.studentNo === "string"
        ? kmsContent.studentNo
        : undefined,
    schoolCorporationType:
      typeof kmsContent.schoolCorporationType === "number"
        ? kmsContent.schoolCorporationType
        : undefined,
    grade: typeof kmsContent.grade === "number" ? kmsContent.grade : undefined,
    term: typeof kmsContent.term === "number" ? kmsContent.term : undefined,
    isLobbyAdmin:
      typeof kmsContent.isLobbyAdmin === "boolean"
        ? kmsContent.isLobbyAdmin
        : undefined,
    firstLoginFlg:
      typeof kmsContent.firstLoginFlg === "number"
        ? kmsContent.firstLoginFlg
        : undefined,
    kmsLoginSuccess:
      typeof kmsLogin.success === "boolean" ? kmsLogin.success : undefined,
    staffDepartments: Array.isArray(kmsContent.staffDepartments)
      ? (kmsContent.staffDepartments as unknown[])
      : undefined,
    studentOrganizations: Array.isArray(kmsContent.studentOrganizations)
      ? (kmsContent.studentOrganizations as unknown[])
      : undefined,
    rawSession: sessionData,
  };
}

function resolveSecureHostFromStudentNo(studentNo: string): string {
  const identifier = studentNo.charAt(2)?.toUpperCase();
  if (!identifier) {
    return "secure.nnn.ed.jp";
  }

  if (identifier === "N") {
    return "secure.nnn.ed.jp";
  }

  if (!/[A-Z]/.test(identifier)) {
    return "secure.nnn.ed.jp";
  }

  return `${identifier.toLowerCase()}-secure.nnn.ed.jp`;
}

function buildPuppeteerCookies(
  cookieHeader: string,
  domain: string,
): CookieParam[] {
  const cookies: CookieParam[] = [];

  for (const rawPart of cookieHeader.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;

    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;

    const name = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);

    cookies.push({
      name,
      value,
      domain,
      path: "/",
      secure: true,
      httpOnly:
        name.startsWith("__Secure-") ||
        name.startsWith("__Host-") ||
        name.toLowerCase().includes("session"),
      sameSite: "Lax",
    });
  }

  return cookies;
}

async function launchBrowser(): Promise<Browser> {
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
  const executableCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
  ].filter((value): value is string => !!value && value.trim().length > 0);

  for (const candidate of executableCandidates) {
    try {
      return await puppeteer.launch({
        headless: true,
        executablePath: candidate,
        args: launchArgs,
      });
    } catch {
      // try next candidate
    }
  }

  const launchErrors: Error[] = [];

  const tryLaunch = async (
    options: Parameters<typeof puppeteer.launch>[0],
    description: string,
  ): Promise<Browser | null> => {
    try {
      logger.info(`[STUDENT_CARD] Trying browser launch via ${description}`);
      return await puppeteer.launch(options);
    } catch (error) {
      if (error instanceof Error) {
        launchErrors.push(error);
      }
      return null;
    }
  };

  const defaultBrowser = await tryLaunch(
    { headless: true, args: launchArgs },
    "default Puppeteer bundle",
  );
  if (defaultBrowser) {
    return defaultBrowser;
  }

  const channelBrowser = await tryLaunch(
    { headless: true, channel: "chrome", args: launchArgs },
    "system Chrome channel",
  );
  if (channelBrowser) {
    return channelBrowser;
  }

  const combinedMessage = launchErrors.map((error) => error.message).join("\n");
  throw new Error(
    `Failed to launch a browser instance for screenshot capture. ` +
      `Please install Chrome via "npx puppeteer browsers install chrome".\n${combinedMessage}`,
  );
}

async function captureElementScreenshot(options: {
  startUrl: string;
  waitForSelector: string;
  screenshotName: string;
  cookies: CookieParam[];
}): Promise<{
  base64: string;
  path: string;
  finalUrl: string;
  elementSize?: { width: number; height: number };
}> {
  logger.info(
    `[STUDENT_CARD] Launching headless browser for student card capture`,
  );

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(CONFIG.userAgent);

    if (options.cookies.length > 0) {
      await page.setCookie(...options.cookies);
    }

    await page.goto(options.startUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await page.waitForSelector(options.waitForSelector, { timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const elementHandle = await page.$(options.waitForSelector);
    if (!elementHandle) {
      throw new Error(
        `Failed to locate element ${options.waitForSelector} for screenshot`,
      );
    }

    const buffer = (await elementHandle.screenshot({
      type: "png",
    })) as Buffer;

    const tmpDir = path.join(os.tmpdir(), "nlobby-student-card");
    await fs.mkdir(tmpDir, { recursive: true });
    const screenshotPath = path.join(tmpDir, options.screenshotName);
    await fs.writeFile(screenshotPath, buffer);

    const boundingBox = await elementHandle.boundingBox();
    const elementSize = boundingBox
      ? {
          width: Math.round(boundingBox.width),
          height: Math.round(boundingBox.height),
        }
      : undefined;

    return {
      base64: buffer.toString("base64"),
      path: screenshotPath,
      finalUrl: page.url(),
      elementSize,
    };
  } finally {
    await browser.close();
  }
}

// ---- Public module functions ----

export async function getUserInfo(ctx: ApiContext): Promise<unknown> {
  try {
    const response = await ctx.httpClient.get<StandardApiResponse>("/api/user");

    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to fetch user info");
    }

    return response.data.data;
  } catch (error) {
    logger.error("Error fetching user info:", error);
    throw new Error(
      "Authentication required. Please use the set_cookies tool to provide valid NextAuth.js session cookies from N Lobby.",
    );
  }
}

async function getAccountInfoFromNextAuthSession(
  ctx: ApiContext,
): Promise<NLobbyAccountInfo | null> {
  try {
    logger.info("[INFO] Trying /api/auth/session for account info...");
    const response =
      await ctx.httpClient.get<UnknownObject>("/api/auth/session");
    const data = response.data;
    if (!data || typeof data !== "object") return null;

    const session = findSessionInData(data, new WeakSet<object>());
    if (session) {
      logger.info("[SUCCESS] Got account info from /api/auth/session");
      return buildAccountInfoFromSession(session);
    }

    // /api/auth/session returns the session object directly (not nested under "session")
    if (
      Object.prototype.hasOwnProperty.call(data, "user") &&
      data["user"] &&
      typeof data["user"] === "object"
    ) {
      logger.info("[SUCCESS] Got account info from /api/auth/session (direct)");
      return buildAccountInfoFromSession(data as UnknownObject);
    }

    return null;
  } catch (error) {
    logger.debug(
      "[DEBUG] /api/auth/session failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

export async function getAccountInfoFromScript(
  ctx: ApiContext,
  endpoint: string = "/",
): Promise<NLobbyAccountInfo> {
  logger.info("[INFO] Extracting account information...");

  // Primary: standard NextAuth session endpoint (reliable, no HTML parsing)
  const fromSession = await getAccountInfoFromNextAuthSession(ctx);
  if (fromSession) return fromSession;

  // Fallback: scrape Next.js flight scripts from the page
  logger.info(
    `[INFO] Falling back to Next.js script extraction at ${endpoint}`,
  );
  try {
    const html = await fetchRenderedHtml(ctx, endpoint);
    const sessionData = extractSessionFromNextJs(html);

    if (!sessionData) {
      throw new Error(
        "Could not locate session data in Next.js flight scripts. Authentication might be required or the page structure may have changed.",
      );
    }

    const accountInfo = buildAccountInfoFromSession(sessionData);

    logger.info("[SUCCESS] Account information extracted successfully");
    return accountInfo;
  } catch (error) {
    logger.error("Error extracting account info from script:", error);
    throw new Error(
      `Failed to extract account information: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function getStudentCardScreenshot(ctx: ApiContext): Promise<{
  base64: string;
  path: string;
  studentNo: string;
  secureHost: string;
  callbackUrl: string;
  finalUrl: string;
  elementSize?: { width: number; height: number };
}> {
  const accountInfo = await getAccountInfoFromScript(ctx, "/");
  const studentNo = accountInfo.studentNo;

  if (!studentNo || studentNo.length < 3) {
    throw new Error(
      "Student number is missing from account information. Ensure you are authenticated and try again.",
    );
  }

  const secureHost = resolveSecureHostFromStudentNo(studentNo);
  const targetUrl = `https://${secureHost}/mypage/student_card/index`;
  const callbackUrl = `https://nlobby.nnn.ed.jp/mypage/v1/callback?redirect_uri=${encodeURIComponent(targetUrl)}`;

  const cookieHeader = ctx.httpClient.defaults.headers["Cookie"];

  if (!cookieHeader) {
    throw new Error(
      "Authentication cookies are not set. Use the set_cookies tool or interactive_login first.",
    );
  }

  const cookieParams = buildPuppeteerCookies(cookieHeader, "nlobby.nnn.ed.jp");
  if (cookieParams.length === 0) {
    throw new Error(
      "Failed to parse authentication cookies for browser session.",
    );
  }

  const screenshotResult = await captureElementScreenshot({
    startUrl: callbackUrl,
    waitForSelector: "#main",
    screenshotName: `student-card-${Date.now()}.png`,
    cookies: cookieParams,
  });

  return {
    base64: screenshotResult.base64,
    path: screenshotResult.path,
    studentNo,
    secureHost,
    callbackUrl,
    finalUrl: screenshotResult.finalUrl,
    elementSize: screenshotResult.elementSize,
  };
}

export async function updateLastAccess(ctx: ApiContext): Promise<boolean> {
  logger.info("[INFO] Updating last access...");
  try {
    await ctx.httpClient.post("/api/trpc/user.updateLastAccess", "{}", {
      headers: {
        "Content-Type": "application/json",
        Cookie: ctx.nextAuth.getCookieHeader(),
      },
    });
    logger.info("[SUCCESS] updateLastAccess succeeded");
    return true;
  } catch (error) {
    logger.error("[ERROR] updateLastAccess failed:", error);
    throw error;
  }
}
