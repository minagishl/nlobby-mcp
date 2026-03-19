import puppeteer, { Browser, Page } from "puppeteer";
import { CONFIG } from "../config.js";
import { logger } from "../logger.js";

export interface ExtractedCookies {
  sessionToken?: string;
  csrfToken?: string;
  callbackUrl?: string;
  allCookies: string;
}

export class BrowserAuth {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initializeBrowser(): Promise<void> {
    try {
      logger.info("Initializing browser for authentication...");

      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          logger.warn("Error closing existing browser:", e);
        }
        this.browser = null;
        this.page = null;
      }

      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: {
          width: 1280,
          height: 800,
        },
        ignoreDefaultArgs: ["--disable-extensions", "--disable-default-apps"],
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--no-pings",
          "--password-store=basic",
          "--use-mock-keychain",
          "--memory-pressure-off",
          "--max_old_space_size=4096",
          '--js-flags="--max-old-space-size=4096"',
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--disable-background-mode",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--disable-infobars",
          "--disable-notifications",
          "--disable-popup-blocking",
          "--enable-async-dns",
          "--enable-simple-cache-backend",
          "--enable-tcp-fast-open",
          "--prerender-from-omnibox=disabled",
          "--disable-features=VizDisplayCompositor,TranslateUI",
          "--disable-search-engine-choice-screen",
          "--disable-component-update",
          "--allow-running-insecure-content",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-client-side-phishing-detection",
          "--disable-domain-reliability",
          "--disable-logging",
          "--disable-login-animations",
          "--disable-modal-animations",
          "--disable-motion-blur",
          "--disable-smooth-scrolling",
          "--disable-threaded-animation",
          "--disable-threaded-scrolling",
          "--disable-checker-imaging",
          "--disable-new-profile-management",
          "--disable-new-avatar-menu",
          "--disable-new-bookmark-apps",
        ],
        timeout: 60000,
        protocolTimeout: 60000,
        slowMo: 250,
      });

      this.page = await this.browser.newPage();

      await this.page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      );

      await this.page.setDefaultNavigationTimeout(60000);
      await this.page.setDefaultTimeout(30000);

      this.page.on("error", (error) => {
        logger.error("Page error:", error);
      });

      this.page.on("pageerror", (error) => {
        logger.error("Page JavaScript error:", error);
      });

      this.page.on("console", (message) => {
        if (message.type() === "error") {
          logger.error("Browser console error:", message.text());
        }
      });

      this.page.on("framedetached", (frame) => {
        logger.warn("Frame detached:", frame.url());
      });

      this.browser.on("disconnected", () => {
        logger.error("Browser disconnected unexpectedly");
        this.browser = null;
        this.page = null;
      });

      this.browser.on("targetcreated", (target) => {
        logger.info("New browser target created:", target.url());
      });

      this.browser.on("targetdestroyed", (target) => {
        logger.info("Browser target destroyed:", target.url());
      });

      await this.page.setJavaScriptEnabled(true);
      await this.page.setCacheEnabled(false);

      await this.page.setRequestInterception(true);
      this.page.on("request", (request) => {
        const resourceType = request.resourceType();

        if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
          if (
            resourceType === "image" &&
            (request.url().includes("accounts.google.com") ||
              request.url().includes("gstatic.com") ||
              request.url().includes("googleapis.com"))
          ) {
            request.continue();
          } else {
            request.abort();
          }
        } else {
          request.continue();
        }
      });

      logger.info("Browser initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize browser:", error);

      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          logger.warn("Error closing browser after initialization failure:", e);
        }
        this.browser = null;
        this.page = null;
      }

      throw new Error("Failed to initialize browser for authentication");
    }
  }

  private async setupPageConfiguration(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    await this.page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    );

    await this.page.setDefaultNavigationTimeout(60000);
    await this.page.setDefaultTimeout(30000);

    this.page.on("error", (error) => {
      logger.error("Page error:", error);
    });

    this.page.on("pageerror", (error) => {
      logger.error("Page JavaScript error:", error);
    });

    this.page.on("console", (message) => {
      if (message.type() === "error") {
        logger.error("Browser console error:", message.text());
      }
    });

    await this.page.setJavaScriptEnabled(true);
    await this.page.setCacheEnabled(false);

    await this.page.setRequestInterception(true);
    this.page.on("request", (request) => {
      const resourceType = request.resourceType();

      if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
        if (
          resourceType === "image" &&
          (request.url().includes("accounts.google.com") ||
            request.url().includes("gstatic.com") ||
            request.url().includes("googleapis.com"))
        ) {
          request.continue();
        } else {
          request.abort();
        }
      } else {
        request.continue();
      }
    });
  }

  private async checkBrowserHealth(): Promise<boolean> {
    try {
      if (!this.browser || !this.browser.isConnected()) {
        logger.warn("Browser is not connected");
        return false;
      }

      if (!this.page || this.page.isClosed()) {
        logger.warn("Page is closed");
        return false;
      }

      await this.page.evaluate(() => document.readyState);
      return true;
    } catch (error) {
      logger.warn("Browser health check failed:", error);
      return false;
    }
  }

  private async extractCookies(): Promise<ExtractedCookies> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      logger.info("Extracting cookies from N Lobby session...");

      const cookies = await this.page.cookies();

      let sessionToken: string | undefined;
      let csrfToken: string | undefined;
      let callbackUrl: string | undefined;

      const cookieStrings: string[] = [];

      for (const cookie of cookies) {
        const cookieString = `${cookie.name}=${cookie.value}`;
        cookieStrings.push(cookieString);

        if (cookie.name === "__Secure-next-auth.session-token") {
          sessionToken = cookie.value;
        } else if (cookie.name === "__Host-next-auth.csrf-token") {
          csrfToken = cookie.value;
        } else if (cookie.name === "__Secure-next-auth.callback-url") {
          callbackUrl = decodeURIComponent(cookie.value);
        }
      }

      const allCookies = cookieStrings.join("; ");

      logger.info(`Extracted ${cookies.length} cookies from N Lobby session`);
      logger.info(`Session token: ${sessionToken ? "present" : "missing"}`);
      logger.info(`CSRF token: ${csrfToken ? "present" : "missing"}`);

      return {
        sessionToken,
        csrfToken,
        callbackUrl,
        allCookies,
      };
    } catch (error) {
      logger.error("Failed to extract cookies:", error);
      throw new Error("Failed to extract authentication cookies");
    }
  }

  async takeScreenshot(
    filename: string = "nlobby-auth-screenshot.png",
  ): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    const screenshotPath = `/tmp/${filename}`;
    await this.page.screenshot({
      path: screenshotPath as `${string}.png`,
      fullPage: true,
    });
    logger.info(`Screenshot saved to ${screenshotPath}`);
    return screenshotPath;
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");
    return this.page.url();
  }

  async getPageTitle(): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");
    return this.page.title();
  }

  private async waitForRedirectWithRetry(
    baseUrl: string,
    timeout: number,
  ): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 2000;
    const baseUrlDomain = baseUrl
      .replace("https://", "")
      .replace("http://", "");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.browser || !this.browser.isConnected()) {
          logger.error("Browser crashed or disconnected, reinitializing...");
          await this.initializeBrowser();
        }

        logger.info(
          `Waiting for redirect back to N Lobby (attempt ${attempt}/${maxRetries})...`,
        );

        await this.page!.waitForFunction(
          (domain) => window.location.href.includes(domain),
          { timeout: timeout / maxRetries },
          baseUrlDomain,
        );

        logger.info("Successfully redirected back to N Lobby");
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          logger.error("All redirect attempts failed:", error);
          throw new Error(
            `Failed to detect redirect after ${maxRetries} attempts: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }

        logger.warn(
          `Redirect attempt ${attempt} failed, retrying in ${retryDelay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        try {
          if (!this.browser || !this.browser.isConnected()) {
            logger.error("Browser crashed, reinitializing...");
            await this.initializeBrowser();
            await this.page!.goto(baseUrl, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });
          } else {
            await this.page!.evaluate(() => document.readyState);
          }
        } catch {
          logger.warn("Page became inaccessible, creating new page...");
          if (this.browser && this.browser.isConnected()) {
            this.page = await this.browser.newPage();
            await this.setupPageConfiguration();
          }
        }
      }
    }
  }

  private async waitForLoginCompletionWithRetry(
    timeout: number,
  ): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.browser || !this.browser.isConnected()) {
          logger.error(
            "Browser crashed during login detection, reinitializing...",
          );
          await this.initializeBrowser();
          await this.page!.goto(CONFIG.nlobby.baseUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
          });
        }

        logger.info(
          `Waiting for login completion (attempt ${attempt}/${maxRetries})...`,
        );

        await this.page!.waitForFunction(
          () => {
            return (
              document.querySelector(
                '[data-testid="user-menu"], .user-profile, .logout-btn',
              ) !== null ||
              document.cookie.includes("next-auth.session-token") ||
              window.location.pathname.includes("/home") ||
              window.location.pathname.includes("/dashboard")
            );
          },
          { timeout: timeout / maxRetries },
        );

        logger.info("Login completion detected");
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          logger.error("All login detection attempts failed:", error);
          throw new Error(
            `Failed to detect login completion after ${maxRetries} attempts: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }

        logger.warn(
          `Login detection attempt ${attempt} failed, retrying in ${retryDelay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        try {
          if (!this.browser || !this.browser.isConnected()) {
            logger.error(
              "Browser crashed during login detection, reinitializing...",
            );
            await this.initializeBrowser();
            await this.page!.goto(CONFIG.nlobby.baseUrl, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });
          } else {
            await this.page!.evaluate(() => document.readyState);
          }
        } catch {
          logger.warn(
            "Page became inaccessible during login detection, creating new page...",
          );
          if (this.browser && this.browser.isConnected()) {
            this.page = await this.browser.newPage();
            await this.setupPageConfiguration();
            await this.page.goto(CONFIG.nlobby.baseUrl, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.info("Browser closed successfully");
    } catch (error) {
      logger.error("Error closing browser:", error);
    }
  }

  async interactiveLogin(): Promise<ExtractedCookies> {
    const isHealthy = await this.checkBrowserHealth();
    if (!isHealthy) {
      logger.warn("Browser unhealthy, reinitializing...");
      await this.initializeBrowser();
    }

    if (!this.browser || !this.page) {
      throw new Error(
        "Browser not initialized. Call initializeBrowser() first.",
      );
    }

    try {
      logger.info("Starting interactive login process...");

      await this.page.goto(CONFIG.nlobby.baseUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      logger.info(
        "N Lobby page loaded. Please complete the login process in the browser window.",
      );
      logger.info("The browser will remain open for you to login manually.");

      await this.waitForLoginCompletionWithRetry(300000);

      logger.info("Login detected! Extracting cookies...");

      const cookies = await this.extractCookies();

      return cookies;
    } catch (error) {
      logger.error("Interactive login failed:", error);

      if (this.page) {
        try {
          const currentUrl = await this.page.url();
          const title = await this.page.title();
          logger.error(`Current URL: ${currentUrl}`);
          logger.error(`Page title: ${title}`);

          await this.takeScreenshot("interactive-login-failure-debug.png");
        } catch (debugError) {
          logger.error("Failed to capture debug information:", debugError);
        }
      }

      throw new Error(
        `Interactive login failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
