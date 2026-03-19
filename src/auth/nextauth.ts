import { logger } from "../logger.js";

export interface NextAuthCookies {
  sessionToken?: string;
  csrfToken?: string;
  callbackUrl?: string;
}

export class NextAuthHandler {
  private cookies: NextAuthCookies = {};

  constructor() {}

  parseCookies(cookieString: string): NextAuthCookies {
    const cookies: NextAuthCookies = {};
    const cookiePairs = cookieString.split(";");

    for (const pair of cookiePairs) {
      const [name, value] = pair.trim().split("=");
      if (name && value) {
        if (name === "__Secure-next-auth.session-token") {
          cookies.sessionToken = decodeURIComponent(value);
        } else if (name === "__Host-next-auth.csrf-token") {
          cookies.csrfToken = decodeURIComponent(value);
        } else if (name === "__Secure-next-auth.callback-url") {
          cookies.callbackUrl = decodeURIComponent(value);
        }
      }
    }

    return cookies;
  }

  setCookies(cookieString: string): void {
    this.cookies = this.parseCookies(cookieString);
    logger.debug("NextAuth cookies parsed:", {
      hasSessionToken: !!this.cookies.sessionToken,
      hasCsrfToken: !!this.cookies.csrfToken,
      hasCallbackUrl: !!this.cookies.callbackUrl,
    });
  }

  getCookies(): NextAuthCookies {
    return this.cookies;
  }

  getCookieHeader(): string {
    const cookieParts: string[] = [];

    if (this.cookies.sessionToken) {
      cookieParts.push(
        `__Secure-next-auth.session-token=${encodeURIComponent(this.cookies.sessionToken)}`,
      );
    }

    if (this.cookies.csrfToken) {
      cookieParts.push(
        `__Host-next-auth.csrf-token=${encodeURIComponent(this.cookies.csrfToken)}`,
      );
    }

    if (this.cookies.callbackUrl) {
      cookieParts.push(
        `__Secure-next-auth.callback-url=${encodeURIComponent(this.cookies.callbackUrl)}`,
      );
    }

    return cookieParts.join("; ");
  }

  isAuthenticated(): boolean {
    return !!this.cookies.sessionToken;
  }

  getSessionToken(): string | null {
    return this.cookies.sessionToken || null;
  }

  async decodeSessionToken(): Promise<{ token: string } | null> {
    if (!this.cookies.sessionToken) {
      return null;
    }

    try {
      return {
        token: this.cookies.sessionToken,
      };
    } catch (error) {
      logger.error("Error decoding session token:", error);
      return null;
    }
  }

  clear(): void {
    this.cookies = {};
  }
}
