import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import { formatProfile } from "../formatters/profile.js";

export function buildProfileCommand(api: NLobbyApi): Command {
  const profile = new Command("profile").description(
    "User profile and account information",
  );

  profile
    .command("show", { isDefault: true })
    .description("Show user profile (default)")
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

  profile
    .command("card")
    .description("Capture student ID card screenshot")
    .option("--json", "Output raw JSON (metadata only, no image)")
    .action(async (opts: { json?: boolean }) => {
      try {
        console.log("Capturing student card screenshot...");
        const result = await api.getStudentCardScreenshot();
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                filePath: result.path,
                studentNo: result.studentNo,
                secureHost: result.secureHost,
                callbackUrl: result.callbackUrl,
                finalUrl: result.finalUrl,
                elementSize: result.elementSize,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(`[OK] Student card saved: ${result.path}`);
          console.log(`     Student No: ${result.studentNo}`);
          if (result.elementSize) {
            console.log(
              `     Size: ${result.elementSize.width}x${result.elementSize.height}`,
            );
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  profile
    .command("update-access")
    .description("Update last access timestamp")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const ok = await api.updateLastAccess();
        if (opts.json) {
          console.log(JSON.stringify({ success: ok }, null, 2));
        } else {
          console.log(
            ok ? "[OK] Last access updated." : "[FAIL] Update failed.",
          );
        }
        if (!ok) process.exit(1);
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return profile;
}
