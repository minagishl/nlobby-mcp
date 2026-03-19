export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    const isDebug =
      process.env.NLOBBY_DEBUG === "true" || process.env.DEBUG === "true";
    this.logLevel = isDebug ? LogLevel.DEBUG : LogLevel.WARN;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /** @deprecated No longer needed; default is already quiet. */
  forceProductionMode(): void {}

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const line =
      args.length > 0
        ? `[${timestamp}] [${levelName}] ${message} ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`
        : `[${timestamp}] [${levelName}] ${message}`;

    // Always write to stderr to avoid polluting stdout (MCP uses stdout for protocol)
    process.stderr.write(line + "\n");
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
}

export const logger = Logger.getInstance();
