import { Command } from "commander";
import { NLobbyApi, saveSessionToDisk } from "../../api/index.js";
import { BrowserAuth } from "../../auth/browser.js";
import { CredentialManager } from "../../auth/credentials.js";

export function buildLoginCommand(api: NLobbyApi): Command {
  const login = new Command("login")
    .description("Authenticate with N Lobby via browser")
    .action(async () => {
      console.log("Opening browser for N Lobby authentication...");
      try {
        const browserAuth = new BrowserAuth();
        await browserAuth.initializeBrowser();
        const result = await browserAuth.interactiveLogin();
        if (result && result.allCookies) {
          api.setCookies(result.allCookies);
          saveSessionToDisk(result.allCookies);
          console.log("[OK] Login successful. Session saved.");
        } else {
          console.error("[FAIL] Login failed or was cancelled.");
          process.exit(1);
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return login;
}

export function buildLoginHelpCommand(): Command {
  const credMgr = new CredentialManager();

  const help = new Command("login-help")
    .description("Get help and troubleshooting tips for N Lobby login")
    .option("--email <email>", "Your email address (for personalized guidance)")
    .action((opts: { email?: string }) => {
      let msg = "[LOGIN] N Lobby Login Help\n";
      if (opts.email) {
        const validation = credMgr.validateEmail(opts.email);
        msg += `\nEmail: ${opts.email}`;
        msg += `\nUser type: ${validation.userType}`;
        msg += `\nValid: ${validation.valid ? "Yes" : "No"}`;
        if (!validation.valid && validation.message) {
          msg += `\nIssue: ${validation.message}`;
        }
        msg += "\n";
        msg += credMgr.getLoginGuidance(validation.userType);
      } else {
        msg += credMgr.getLoginGuidance("unknown");
      }
      msg += "\n";
      msg += credMgr.getTroubleshootingTips();
      const stats = credMgr.getSessionStats();
      msg += `\n\n[STATUS] Session stats: ${stats.total - stats.expired} active, ${stats.expired} expired`;
      console.log(msg);
    });

  return help;
}

export function buildCookiesCommand(api: NLobbyApi): Command {
  const cookies = new Command("cookies").description(
    "Manage authentication cookies",
  );

  cookies
    .command("set <cookies>")
    .description("Set cookies manually")
    .action((cookiesStr: string) => {
      api.setCookies(cookiesStr);
      saveSessionToDisk(cookiesStr);
      console.log("[OK] Cookies saved.");
    });

  cookies
    .command("check")
    .description("Show current cookie/authentication status")
    .action(() => {
      console.log(api.getCookieStatus());
    });

  return cookies;
}
