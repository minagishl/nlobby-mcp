import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatProfile } from "../formatters/profile.js";

export function buildProfileCommand(api: NLobbyApi): Command {
  const profile = new Command("profile")
    .description("Show user profile and account information")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const info = await api.getAccountInfoFromScript("/");
        if (opts.json) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log(formatProfile(info));
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return profile;
}
