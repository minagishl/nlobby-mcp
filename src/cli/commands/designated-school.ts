import { Command } from "commander";
import { NLobbyApi } from "../../api/index.js";
import type { DesignatedSchoolSearchOptions } from "../../types.js";
import { formatDesignatedSchool } from "../formatters/designated-school.js";

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num));
}

function buildSearchOptions(opts: {
  page?: string;
  prefecture?: string;
  schoolType?: string;
  schoolName?: string;
  schoolNameExact?: boolean;
  facultyName?: string;
  facultyNameExact?: boolean;
  freeword?: string;
  freewordExact?: boolean;
  deadline?: string;
}): DesignatedSchoolSearchOptions | undefined {
  const options: DesignatedSchoolSearchOptions = {};

  if (opts.page) {
    const page = Number(opts.page);
    if (Number.isFinite(page) && page > 0) {
      options.page = page;
    }
  }
  if (opts.prefecture) {
    options.prefectures = parseNumberList(opts.prefecture);
  }
  if (opts.schoolType) {
    options.schoolTypes = parseNumberList(opts.schoolType);
  }
  if (opts.schoolName) {
    options.schoolName = opts.schoolName;
    options.schoolNameExact = opts.schoolNameExact;
  }
  if (opts.facultyName) {
    options.facultyName = opts.facultyName;
    options.facultyNameExact = opts.facultyNameExact;
  }
  if (opts.freeword) {
    options.freeword = opts.freeword;
    options.freewordExact = opts.freewordExact;
  }
  if (opts.deadline) {
    options.selectionDeadlineBefore = opts.deadline;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

export function buildDesignatedSchoolCommand(api: NLobbyApi): Command {
  const designatedSchool = new Command("designated-school").description(
    "Designated school (指定校) recommendations from the secure student portal",
  );

  designatedSchool
    .option("--json", "Output raw JSON")
    .option("--html", "Output raw #main HTML from the designated school page")
    .option("--page <n>", "Page number for search results")
    .option(
      "--prefecture <codes>",
      "Prefecture filter codes (comma-separated, e.g. 13 for Tokyo)",
    )
    .option(
      "--school-type <types>",
      "School type codes (1=university, 2=junior college, 3=vocational)",
    )
    .option("--school-name <name>", "School name filter")
    .option("--school-name-exact", "Match school name exactly")
    .option("--faculty-name <name>", "Faculty name filter")
    .option("--faculty-name-exact", "Match faculty name exactly")
    .option("--freeword <text>", "Free word search")
    .option("--freeword-exact", "Match free word exactly")
    .option(
      "--deadline <date>",
      "Selection deadline on or before (YYYY/MM/DD or YYYY-MM-DD)",
    )
    .action(
      async (opts: {
        json?: boolean;
        html?: boolean;
        page?: string;
        prefecture?: string;
        schoolType?: string;
        schoolName?: string;
        schoolNameExact?: boolean;
        facultyName?: string;
        facultyNameExact?: boolean;
        freeword?: string;
        freewordExact?: boolean;
        deadline?: string;
      }) => {
        try {
          const searchOptions = buildSearchOptions(opts);

          if (opts.html) {
            const html = await api.getDesignatedSchoolPageHtml(searchOptions);
            console.log(html);
            return;
          }

          const data = await api.getDesignatedSchool(searchOptions);
          if (opts.json) {
            console.log(JSON.stringify(data, null, 2));
          } else {
            console.log(formatDesignatedSchool(data));
          }
        } catch (err) {
          console.error("[FAIL]", err instanceof Error ? err.message : err);
          process.exit(1);
        }
      },
    );

  return designatedSchool;
}
