import puppeteer, { type Browser, type LaunchOptions } from "puppeteer";
import { logger } from "../logger.js";

const MACOS_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function formatLaunchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function uniqueCandidates(
  candidates: Array<{ description: string; options: LaunchOptions }>,
): Array<{ description: string; options: LaunchOptions }> {
  const seen = new Set<string>();
  const unique: Array<{ description: string; options: LaunchOptions }> = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.description)) {
      continue;
    }
    seen.add(candidate.description);
    unique.push(candidate);
  }

  return unique;
}

export async function launchPuppeteerBrowser(
  options: LaunchOptions,
): Promise<Browser> {
  const launchErrors: string[] = [];
  const candidates = uniqueCandidates([
    { description: "bundled Puppeteer Chrome", options },
    {
      description: "system Chrome channel",
      options: { ...options, channel: "chrome" },
    },
    ...(process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
      ? [
          {
            description: `PUPPETEER_EXECUTABLE_PATH (${process.env.PUPPETEER_EXECUTABLE_PATH})`,
            options: {
              ...options,
              executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            },
          },
        ]
      : []),
    ...(process.env.CHROME_PATH?.trim()
      ? [
          {
            description: `CHROME_PATH (${process.env.CHROME_PATH})`,
            options: {
              ...options,
              executablePath: process.env.CHROME_PATH,
            },
          },
        ]
      : []),
    {
      description: `macOS Chrome (${MACOS_CHROME_PATH})`,
      options: { ...options, executablePath: MACOS_CHROME_PATH },
    },
  ]);

  for (const candidate of candidates) {
    try {
      logger.info(`Trying browser launch via ${candidate.description}`);
      return await puppeteer.launch(candidate.options);
    } catch (error) {
      launchErrors.push(
        `${candidate.description}: ${formatLaunchError(error)}`,
      );
    }
  }

  throw new Error(
    "Failed to launch a browser instance. Install Chrome or run " +
      "`npx puppeteer browsers install chrome`.\n" +
      launchErrors.join("\n"),
  );
}
