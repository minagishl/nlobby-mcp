import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import type { NavigationMenuItem } from "../../types.js";

interface FeatureMapping {
  siteFeature: string;
  cliCommand: string;
  description: string;
}

const BUILT_IN_FEATURES: FeatureMapping[] = [
  {
    siteFeature: "お知らせ",
    cliCommand: "nlobby news",
    description: "List, show, download, and mark news as read",
  },
  {
    siteFeature: "学校予定 / カレンダー",
    cliCommand: "nlobby schedule / nlobby calendar",
    description: "Personal and school calendar events",
  },
  {
    siteFeature: "履修科目 / 学習情報",
    cliCommand: "nlobby courses",
    description: "Required courses with progress and grades",
  },
  {
    siteFeature: "学習リソース",
    cliCommand: "nlobby courses resources",
    description: "Learning materials and assignments",
  },
  {
    siteFeature: "試験日モード",
    cliCommand: "nlobby exam",
    description: "Exam day check, OTP, and finish mode",
  },
  {
    siteFeature: "プロフィール / 学生証",
    cliCommand: "nlobby profile",
    description: "Account info and student ID card screenshot",
  },
  {
    siteFeature: "ナビゲーション / 通知",
    cliCommand: "nlobby nav",
    description: "Menus, notifications, and interest tags",
  },
  {
    siteFeature: "スクーリング一覧",
    cliCommand: "nlobby schooling",
    description:
      "Schooling schedule from secure portal (/mypage/schooling/top)",
  },
  {
    siteFeature: "指定校情報",
    cliCommand: "nlobby designated-school",
    description:
      "Designated school recommendations from secure portal (/mypage/designated_school/index)",
  },
  {
    siteFeature: "任意ページ",
    cliCommand: "nlobby page <path>",
    description: "Fetch authenticated page content by URL path",
  },
];

function formatBuiltInFeatures(features: FeatureMapping[]): string {
  const lines = ["── Built-in CLI feature map ──"];
  for (const feature of features) {
    lines.push(`  ${feature.siteFeature}`);
    lines.push(`    CLI: ${feature.cliCommand}`);
    lines.push(`    ${feature.description}`);
  }
  return lines.join("\n");
}

function formatNavMenus(
  items: { categoryName: string | null; menu: NavigationMenuItem }[],
): string {
  if (items.length === 0) {
    return "No navigation menus found (login may be required).";
  }

  const lines = ["── Site navigation (from API) ──"];
  for (const { categoryName, menu } of items) {
    const prefix = categoryName ? `[${categoryName}] ` : "";
    const badge = menu.badgeContent ? ` (${menu.badgeContent})` : "";
    const external = menu.isExternalLink ? " [external]" : "";
    lines.push(`  ${prefix}${menu.label}${badge}${external}`);
    if (menu.linkUrl) {
      lines.push(`    URL: ${menu.linkUrl}`);
    }
  }
  return lines.join("\n");
}

export function buildDiscoverCommand(api: NLobbyApi): Command {
  const discover = new Command("discover")
    .description("Show N Lobby site features and their CLI commands")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        let menus: Awaited<ReturnType<NLobbyApi["getMainNavigations"]>> = [];
        let menusError: string | undefined;

        try {
          menus = await api.getMainNavigations();
        } catch (err) {
          menusError =
            err instanceof Error ? err.message : "Failed to fetch nav menus";
        }

        const navItems = menus.flatMap((category) =>
          category.items.map((item) => ({
            categoryName: category.categoryName,
            menu: item.menu,
          })),
        );

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                builtInFeatures: BUILT_IN_FEATURES,
                navigationMenus: menus,
                navigationError: menusError,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(formatBuiltInFeatures(BUILT_IN_FEATURES));
        console.log("");
        console.log(formatNavMenus(navItems));
        if (menusError) {
          console.log(`\n[WARNING] ${menusError}`);
        }
      } catch (err) {
        console.error("[FAIL]", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return discover;
}
