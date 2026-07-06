import { catchError, jsonResult, textResult } from "../helpers.js";
import type { MCPModule } from "../types.js";

export const designatedSchoolModule: MCPModule = {
  tools: [
    {
      definition: {
        name: "get_designated_school",
        description:
          "Fetch designated school (指定校) recommendations from the secure student portal (/mypage/designated_school/index)",
        inputSchema: {
          type: "object",
          properties: {
            html_only: {
              type: "boolean",
              description:
                "Return raw #main HTML instead of parsed data (optional, default: false)",
              default: false,
            },
            page: {
              type: "number",
              description: "Page number for search results (optional)",
            },
            prefectures: {
              type: "array",
              items: { type: "number" },
              description:
                "Prefecture filter codes (optional, e.g. [13] for Tokyo)",
            },
            school_types: {
              type: "array",
              items: { type: "number" },
              description:
                "School type codes: 1=university, 2=junior college, 3=vocational (optional)",
            },
            school_name: {
              type: "string",
              description: "School name filter (optional)",
            },
            school_name_exact: {
              type: "boolean",
              description: "Match school name exactly (optional)",
            },
            faculty_name: {
              type: "string",
              description: "Faculty name filter (optional)",
            },
            faculty_name_exact: {
              type: "boolean",
              description: "Match faculty name exactly (optional)",
            },
            freeword: {
              type: "string",
              description: "Free word search (optional)",
            },
            freeword_exact: {
              type: "boolean",
              description: "Match free word exactly (optional)",
            },
            selection_deadline_before: {
              type: "string",
              description:
                "Selection deadline on or before YYYY/MM/DD or YYYY-MM-DD (optional)",
            },
          },
        },
      },
      handler: async (ctx, args) => {
        try {
          const {
            html_only = false,
            page,
            prefectures,
            school_types,
            school_name,
            school_name_exact,
            faculty_name,
            faculty_name_exact,
            freeword,
            freeword_exact,
            selection_deadline_before,
          } = (args ?? {}) as {
            html_only?: boolean;
            page?: number;
            prefectures?: number[];
            school_types?: number[];
            school_name?: string;
            school_name_exact?: boolean;
            faculty_name?: string;
            faculty_name_exact?: boolean;
            freeword?: string;
            freeword_exact?: boolean;
            selection_deadline_before?: string;
          };

          const searchOptions = {
            page,
            prefectures,
            schoolTypes: school_types,
            schoolName: school_name,
            schoolNameExact: school_name_exact,
            facultyName: faculty_name,
            facultyNameExact: faculty_name_exact,
            freeword,
            freewordExact: freeword_exact,
            selectionDeadlineBefore: selection_deadline_before,
          };

          if (html_only) {
            return textResult(
              await ctx.api.getDesignatedSchoolPageHtml(searchOptions),
            );
          }
          return jsonResult(await ctx.api.getDesignatedSchool(searchOptions));
        } catch (error) {
          return catchError(error, "Error fetching designated school page");
        }
      },
    },
  ],
};
