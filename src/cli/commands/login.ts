import { Command } from "commander";
import { NLobbyApi, saveSessionToDisk } from "../../api/index.js";
import { BrowserAuth } from "../../auth/browser.js";

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
