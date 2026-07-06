import { CalendarType } from "../../types.js";
import type { MCPModule } from "../types.js";

export const resourcesModule: MCPModule = {
  resources: [
    {
      uri: "nlobby://news",
      name: "School News",
      description: "Latest school news and notices",
      mimeType: "application/json",
      handler: async (ctx) => JSON.stringify(await ctx.api.getNews(), null, 2),
    },
    {
      uri: "nlobby://schedule",
      name: "School Schedule",
      description: "Daily class schedule and events",
      mimeType: "application/json",
      handler: async (ctx) =>
        JSON.stringify(
          await ctx.api.getSchedule(CalendarType.PERSONAL),
          null,
          2,
        ),
    },
    {
      uri: "nlobby://user-profile",
      name: "User Profile",
      description: "Current user information and preferences",
      mimeType: "application/json",
      handler: async (ctx) =>
        JSON.stringify(await ctx.api.getAccountInfoFromScript(), null, 2),
    },
    {
      uri: "nlobby://required-courses",
      name: "Required Courses",
      description: "Required courses and academic information",
      mimeType: "application/json",
      handler: async (ctx) =>
        JSON.stringify(await ctx.api.getRequiredCourses(), null, 2),
    },
    {
      uri: "nlobby://learning-resources",
      name: "Learning Resources",
      description: "Learning materials, assignments, and study resources",
      mimeType: "application/json",
      handler: async (ctx) =>
        JSON.stringify(await ctx.api.getLearningResources(), null, 2),
    },
  ],
};
