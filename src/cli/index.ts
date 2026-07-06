import { Command } from "commander";
import { NLobbyApi } from "../api/index.js";
import {
  buildLoginCommand,
  buildCookiesCommand,
  buildLoginHelpCommand,
} from "./commands/login.js";
import { buildNewsCommand } from "./commands/news.js";
import {
  buildScheduleCommand,
  buildCalendarCommand,
} from "./commands/schedule.js";
import { buildCoursesCommand } from "./commands/courses.js";
import { buildProfileCommand } from "./commands/profile.js";
import { buildHealthCommand } from "./commands/health.js";
import { buildServeCommand } from "./commands/serve.js";
import { buildExamCommand } from "./commands/exam.js";
import { buildNavigationCommand } from "./commands/navigation.js";
import { buildDiscoverCommand } from "./commands/discover.js";
import { buildPageCommand } from "./commands/page.js";

export function buildProgram(): Command {
  const api = new NLobbyApi();

  const program = new Command()
    .name("nlobby")
    .description("N Lobby CLI — access N Lobby from the command line")
    .version("1.5.0");

  program.addCommand(buildLoginCommand(api));
  program.addCommand(buildCookiesCommand(api));
  program.addCommand(buildLoginHelpCommand());
  program.addCommand(buildNewsCommand(api));
  program.addCommand(buildScheduleCommand(api));
  program.addCommand(buildCalendarCommand(api));
  program.addCommand(buildCoursesCommand(api));
  program.addCommand(buildProfileCommand(api));
  program.addCommand(buildHealthCommand(api));
  program.addCommand(buildExamCommand(api));
  program.addCommand(buildNavigationCommand(api));
  program.addCommand(buildDiscoverCommand(api));
  program.addCommand(buildPageCommand(api));
  program.addCommand(buildServeCommand());

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}
