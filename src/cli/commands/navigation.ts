import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";

export function buildNavigationCommand(api: NLobbyApi): Command {
  const nav = new Command("nav").description(
    "Navigation, notifications, and user interests",
  );

  nav
    .command("menus")
    .description("Show main navigation menu list")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const menus = await api.getMainNavigations();
        if (opts.json) {
          console.log(JSON.stringify(menus, null, 2));
        } else {
          if (menus.length === 0) {
            console.log("No navigation menus found.");
          } else {
            for (const category of menus) {
              if (category.categoryName) {
                console.log(`\n── ${category.categoryName} ──`);
              }
              for (const { menu } of category.items) {
                const external = menu.isExternalLink ? " [external]" : "";
                console.log(
                  `  ${menu.label}${menu.badgeContent ? ` (${menu.badgeContent})` : ""}${external}`,
                );
                if (menu.linkUrl) {
                  console.log(`    ${menu.linkUrl}`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  nav
    .command("notifications")
    .description("Show notification messages")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const messages = await api.getNotificationMessages();
        if (opts.json) {
          console.log(JSON.stringify(messages, null, 2));
        } else {
          if (messages.length === 0) {
            console.log("No notifications.");
          } else {
            for (const msg of messages) {
              console.log(`[${msg.id}] ${msg.title ?? ""}`);
              if (msg.body) console.log(`  ${msg.body}`);
            }
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  nav
    .command("interests")
    .description("Show user interest tags")
    .option("--with-icon", "Include icon information")
    .option("--json", "Output raw JSON")
    .action(async (opts: { withIcon?: boolean; json?: boolean }) => {
      try {
        const interests = await api.getUserInterests(opts.withIcon ?? false);
        if (opts.json) {
          console.log(JSON.stringify(interests, null, 2));
        } else {
          if (interests.length === 0) {
            console.log("No interests found.");
          } else {
            for (const i of interests) {
              const icon =
                opts.withIcon && i.iconName ? ` [${i.iconName}]` : "";
              console.log(`  ${i.name}${icon} (weight: ${i.weightId})`);
            }
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  nav
    .command("weights")
    .description("Show interest weight scale definitions")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const weights = await api.getInterestWeights();
        if (opts.json) {
          console.log(JSON.stringify(weights, null, 2));
        } else {
          if (weights.length === 0) {
            console.log("No weight definitions found.");
          } else {
            for (const w of weights) {
              console.log(`  [${w.id}] ${w.label} (value: ${w.value})`);
            }
          }
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return nav;
}
