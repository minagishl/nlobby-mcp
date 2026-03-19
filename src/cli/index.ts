import { Command } from "commander";
import { NLobbyApi } from "../api/index.js";
import { buildLoginCommand, buildCookiesCommand } from "./commands/login.js";
import { buildNewsCommand } from "./commands/news.js";
import {
  buildScheduleCommand,
  buildCalendarCommand,
} from "./commands/schedule.js";
import { buildCoursesCommand } from "./commands/courses.js";
import { buildProfileCommand } from "./commands/profile.js";
import { buildHealthCommand } from "./commands/health.js";
import { buildServeCommand } from "./commands/serve.js";

export function buildProgram(): Command {
  const api = new NLobbyApi();

  const program = new Command()
    .name("nlobby")
    .description("N Lobby CLI — access N Lobby from the command line")
    .version("1.4.0");

  program.addCommand(buildLoginCommand(api));
  program.addCommand(buildCookiesCommand(api));
  program.addCommand(buildNewsCommand(api));
  program.addCommand(buildScheduleCommand(api));
  program.addCommand(buildCalendarCommand(api));
  program.addCommand(buildCoursesCommand(api));
  program.addCommand(buildProfileCommand(api));
  program.addCommand(buildHealthCommand(api));
  program.addCommand(buildServeCommand());

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}
