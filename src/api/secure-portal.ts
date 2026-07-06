import type { Browser, CookieParam } from "puppeteer";
import { launchPuppeteerBrowser } from "../auth/puppeteer-launch.js";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import type { ApiContext } from "./context.js";
import { getAccountInfoFromScript } from "./account.js";

export function resolveSecureHostFromStudentNo(studentNo: string): string {
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

export function buildSecurePortalCallbackUrl(
  secureHost: string,
  portalPath: string,
): { targetUrl: string; callbackUrl: string } {
  const normalizedPath = portalPath.startsWith("/")
    ? portalPath
    : `/${portalPath}`;
  const targetUrl = `https://${secureHost}${normalizedPath}`;
  const callbackUrl = `https://nlobby.nnn.ed.jp/mypage/v1/callback?redirect_uri=${encodeURIComponent(targetUrl)}`;
  return { targetUrl, callbackUrl };
}

export function buildPuppeteerCookies(
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

export async function launchHeadlessBrowser(): Promise<Browser> {
  return launchPuppeteerBrowser({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function resolveSecurePortalContext(
  ctx: ApiContext,
  portalPath: string,
): Promise<{
  studentNo: string;
  secureHost: string;
  callbackUrl: string;
  targetUrl: string;
  cookies: CookieParam[];
}> {
  const accountInfo = await getAccountInfoFromScript(ctx, "/");
  const studentNo = accountInfo.studentNo;

  if (!studentNo || studentNo.length < 3) {
    throw new Error(
      "Student number is missing from account information. Ensure you are authenticated and try again.",
    );
  }

  const secureHost = resolveSecureHostFromStudentNo(studentNo);
  const { targetUrl, callbackUrl } = buildSecurePortalCallbackUrl(
    secureHost,
    portalPath,
  );

  const cookieHeader = ctx.httpClient.defaults.headers["Cookie"];
  if (!cookieHeader || typeof cookieHeader !== "string") {
    throw new Error(
      "Authentication cookies are not set. Use nlobby login or nlobby cookies set first.",
    );
  }

  const cookies = buildPuppeteerCookies(cookieHeader, "nlobby.nnn.ed.jp");
  if (cookies.length === 0) {
    throw new Error(
      "Failed to parse authentication cookies for browser session.",
    );
  }

  return { studentNo, secureHost, callbackUrl, targetUrl, cookies };
}

export async function fetchSecurePortalPage(options: {
  startUrl: string;
  cookies: CookieParam[];
  waitForSelector?: string;
}): Promise<{ html: string; mainHtml: string; finalUrl: string }> {
  const waitForSelector = options.waitForSelector ?? "#main";

  logger.info("[SECURE_PORTAL] Launching headless browser for page fetch");

  const browser = await launchHeadlessBrowser();

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

    await page.waitForSelector(waitForSelector, { timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const html = await page.content();
    const mainHtml = await page.$eval(waitForSelector, (element) => {
      return element.innerHTML;
    });

    return {
      html,
      mainHtml,
      finalUrl: page.url(),
    };
  } finally {
    await browser.close();
  }
}

export async function captureSecurePortalElement(options: {
  startUrl: string;
  cookies: CookieParam[];
  waitForSelector: string;
  screenshotName: string;
}): Promise<{
  base64: string;
  path: string;
  finalUrl: string;
  elementSize?: { width: number; height: number };
}> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const browser = await launchHeadlessBrowser();

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
