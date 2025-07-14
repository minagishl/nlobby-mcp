import { createHash } from "crypto";
import { logger } from "./logger.js";

export interface StoredCredentials {
  emailHash: string;
  timestamp: number;
  sessionValid: boolean;
}

export class CredentialManager {
  private credentialStore: Map<string, StoredCredentials> = new Map();
  private readonly SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * Hash email for secure storage (one-way hash)
   */
  private hashEmail(email: string): string {
    return createHash("sha256").update(email).digest("hex");
  }

  /**
   * Validate email format for N High School Group
   */
  validateEmail(email: string): {
    valid: boolean;
    userType: "student" | "staff" | "parent" | "unknown";
    message?: string;
  } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return {
        valid: false,
        userType: "unknown",
        message: "Invalid email format",
      };
    }

    const domain = email.split("@")[1].toLowerCase();

    // N High School Group domains
    if (domain === "nnn.ed.jp") {
      return { valid: true, userType: "student" };
    } else if (domain === "nnn.ac.jp") {
      return { valid: true, userType: "staff" };
    } else if (
      domain === "gmail.com" ||
      domain === "yahoo.com" ||
      domain === "outlook.com" ||
      domain === "hotmail.com"
    ) {
      return { valid: true, userType: "parent" };
    } else {
      return { valid: true, userType: "parent" }; // Allow other domains for parents
    }
  }

  /**
   * Store session info after successful login
   */
  storeSession(email: string): void {
    const emailHash = this.hashEmail(email);
    const stored: StoredCredentials = {
      emailHash,
      timestamp: Date.now(),
      sessionValid: true,
    };

    this.credentialStore.set(emailHash, stored);
    logger.info(`Session stored for user: ${email.split("@")[0]}@***`);
  }

  /**
   * Check if user has a valid recent session
   */
  hasValidSession(email: string): boolean {
    const emailHash = this.hashEmail(email);
    const stored = this.credentialStore.get(emailHash);

    if (!stored) {
      return false;
    }

    const isExpired = Date.now() - stored.timestamp > this.SESSION_TIMEOUT;

    if (isExpired) {
      this.credentialStore.delete(emailHash);
      return false;
    }

    return stored.sessionValid;
  }

  /**
   * Invalidate session
   */
  invalidateSession(email: string): void {
    const emailHash = this.hashEmail(email);
    this.credentialStore.delete(emailHash);
    logger.info(`Session invalidated for user: ${email.split("@")[0]}@***`);
  }

  /**
   * Get login guidance based on user type
   */
  getLoginGuidance(
    userType: "student" | "staff" | "parent" | "unknown",
  ): string {
    switch (userType) {
      case "student":
        return `
[STUDENT] Student Login Guide:
- Use your @nnn.ed.jp email address
- Use your N High School password
- If you have 2FA enabled, you'll need to complete it during login
- Contact your homeroom teacher if you've forgotten your password`;

      case "staff":
        return `
[STAFF] Staff Login Guide:
- Use your @nnn.ac.jp email address
- Use your N High School staff password
- If you have 2FA enabled, you'll need to complete it during login
- Contact IT support if you're having trouble accessing your account`;

      case "parent":
        return `
[PARENT] Parent Login Guide:
- Use the email address registered with your child's school account
- Use the password you set when creating your parent account
- If you haven't created a parent account yet, contact your child's school
- If you've forgotten your password, use the password reset option`;

      default:
        return `
[LOGIN] General Login Guide:
- Use your registered email address
- Use your N Lobby password
- If you have 2FA enabled, you'll need to complete it during login
- Contact support if you're having trouble`;
    }
  }

  /**
   * Get troubleshooting tips for common issues
   */
  getTroubleshootingTips(): string {
    return `
[TIPS] Common Login Issues & Solutions:

1. **Wrong Email/Password**
   - Double-check your email address and password
   - Make sure Caps Lock is off
   - Try typing your password in a text editor first

2. **2FA Issues**
   - Make sure your authenticator app is synced
   - Try using backup codes if available
   - Wait for the next code if the current one doesn't work

3. **Browser Issues**
   - Clear your browser cache and cookies
   - Try using incognito/private mode
   - Disable browser extensions temporarily

4. **Account Locked**
   - Wait 15-30 minutes before trying again
   - Contact support if your account is suspended

5. **Network Issues**
   - Check your internet connection
   - Try using a different network or VPN
   - Make sure N Lobby isn't blocked by your firewall

[PRO-TIP] Pro Tips:
- Use 'interactive_login' if automated login fails
- The browser window will stay open for manual completion
- You can close the browser once login is complete`;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [hash, stored] of this.credentialStore.entries()) {
      if (now - stored.timestamp > this.SESSION_TIMEOUT) {
        this.credentialStore.delete(hash);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): { total: number; expired: number } {
    const now = Date.now();
    let expired = 0;

    for (const stored of this.credentialStore.values()) {
      if (now - stored.timestamp > this.SESSION_TIMEOUT) {
        expired++;
      }
    }

    return {
      total: this.credentialStore.size,
      expired,
    };
  }
}
