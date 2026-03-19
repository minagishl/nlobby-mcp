# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.4] - 2026-03-20

### Fixed

- tRPC POST fallback URL was missing the leading slash, causing the method name to be concatenated directly onto the base URL (e.g. `/api/trpcrequiredCourse.getRequiredCourses` instead of `/api/trpc/requiredCourse.getRequiredCourses`). The 1.4.3 fix only addressed the GET path; the POST fallback in `TRPCClient.call()` was left unpatched.

### Changed

- Updated `SKILLS.md` to reflect the latest CLI commands: added `login-help`, `exam check/finish/otp`, and `nav menus/notifications/interests/weights`.

## [1.4.3] - 2026-03-20

### Fixed

- tRPC request URLs were missing the slash between `/api/trpc` and the method name (e.g. `/api/trpcrequiredCourse.getRequiredCourses` → `/api/trpc/requiredCourse.getRequiredCourses`).

## [1.4.2] - 2026-03-20

### Added

- CLI commands for all MCP tools that were previously unavailable from the command line:
  - `news unread-info` — show unread news count, mentor news count, and important-news flag.
  - `news read <ids...>` — now accepts multiple IDs in one invocation.
  - `calendar test [--from] [--to]` — test both personal and school calendar endpoints and report success/event counts.
  - `calendar filters` — list lobby calendar filter definitions (id, label, colour).
  - `profile show` — explicit subcommand (was previously the flat `profile` default action).
  - `profile card` — capture a screenshot of the student ID card and save it as PNG.
  - `profile update-access` — update the current user's last-access timestamp.
  - `exam check [date]` — check whether a date (default: today) is an exam day.
  - `exam finish` — finish exam day mode.
  - `exam otp` — retrieve the exam one-time password.
  - `nav menus` — display the main navigation menu categories and items.
  - `nav notifications` — list notification messages.
  - `nav interests [--with-icon]` — list user interest tags with optional icon info.
  - `nav weights` — list interest weight scale definitions.
  - `health check` — explicit subcommand (was previously the flat `health` default action).
  - `health debug [--endpoint]` — detailed connection debug report for a given endpoint.
  - `health page [--endpoint] [--length]` — fetch and display a sample of raw page content.
  - `health trpc <method> [--params]` — call any tRPC method and print the response.
  - `health verify` — show full authentication and cookie-synchronisation status across all clients.
  - `login-help [--email]` — print login guidance and troubleshooting tips, optionally personalised by email address.

### Changed

- Logger rewritten for quiet-by-default behaviour:
  - Default log level raised to **WARN** — DEBUG and INFO messages are suppressed in both CLI and MCP modes.
  - Set `NLOBBY_DEBUG=true` (or `DEBUG=true`) to restore full DEBUG-level output.
  - All log output now goes to **stderr** exclusively, preventing internal messages from polluting stdout and breaking the MCP stdio protocol.
  - `forceProductionMode()` is now a no-op (retained for API compatibility); production quietness is the unconditional default.
  - `isProduction` heuristic and the `!process.stdout.isTTY` check removed.
- `src/index.ts` — removed the now-unnecessary `logger.forceProductionMode()` call before starting the MCP server.

## [1.4.1] - 2026-03-20

### Changed

- Replaced `axios` with `node-fetch` as the HTTP client throughout the codebase.
- `src/http-client.ts` introduced as a lightweight `HttpClient` wrapper around node-fetch, providing `get()`/`post()`, interceptors, per-request `headers`/`timeout`/`params`, and `defaults.headers`/`timeout`/`baseURL`.
- `AxiosInstance` type references replaced with `HttpClient` in `ApiContext`, `NLobbyApi`, and `TRPCClient`.
- `AxiosError` / `AxiosErrorResponse` / `AxiosErrorConfig` types removed from `types.ts`; error handling now uses `HttpClientError`.
- Renamed all package names to CLI
- Change the folders monitored by ES Lint

## [1.4.0] - 2026-03-19

### Added

- **CLI mode** — the package is now a dual-mode tool. Running `nlobby <command>` gives a full interactive CLI; running `nlobby serve` (or `nlobby mcp`) starts the MCP server as before. The binary is available as both `nlobby` and `nlobby-mcp`.
- CLI commands: `login`, `cookies set|check`, `news [list|show|read]`, `schedule`, `calendar`, `courses`, `profile`, `health`, `serve`.
  - All data commands accept `--json` for raw JSON output.
  - `news` supports `--limit`, `--category`, `--sort`, and `--unread` filters.
  - `calendar` supports `--from`, `--to`, and `--type personal|school`.
  - `courses` supports `--grade` and `--semester` filters.
- Session persistence for CLI — cookies are automatically saved to `~/.nlobby/session` after login and restored on each invocation.
- `nlobby login` opens a headed Puppeteer browser for interactive N Lobby authentication.
- `SKILLS.md` — reference table of all CLI commands, MCP tools, and MCP resources shipped with the package.
- `check_exam_day` tool — checks whether a given date (or today) is an exam day via `exam.isExamDay`.
- `finish_exam_day_mode` tool — ends exam day mode via `exam.finishExamDayMode`.
- `get_exam_otp` tool — retrieves the exam one-time password via `auth.student.examOneTimePasswordDisplay`.
- `update_last_access` tool — updates the current user's last access timestamp via `user.updateLastAccess`.
- `get_navigation_menus` tool — fetches the main navigation menu list via `menu.findMainNavigations`.
- `get_unread_news_info` tool — returns unread news counts and important-news flags via `news.getUnreadNewsInfo`.
- `get_notifications` tool — retrieves notification messages via `notification.getMessages`.
- `get_user_interests` tool — fetches the user's interest tags (with optional icon data) via `interest.readInterests` / `interest.readInterestsWithIcon`.
- `get_interest_weights` tool — returns the interest weight scale definitions via `interest.readWeights`.
- `get_calendar_filters` tool — retrieves lobby calendar filter definitions via `calendar.getLobbyCalendarFilters`.
- Corresponding type definitions (`ExamOneTimePassword`, `NavigationMenuCategory`, `UnreadNewsInfo`, `NotificationMessage`, `UserInterest`, `InterestWeight`, `LobbyCalendarFilter`) added to `types.ts`.

### Changed

- Package renamed from `nlobby-mcp` to `nlobby-cli` to reflect the broader scope.
- `src/api.ts` (3981 lines) split into focused modules: `api/news.ts`, `api/schedule.ts`, `api/courses.ts`, `api/account.ts`, `api/navigation.ts`, `api/health.ts`, `api/shared.ts`, and `api/index.ts` (facade).
- Auth helpers moved to `src/auth/` (`browser.ts`, `nextauth.ts`, `credentials.ts`).
- MCP server moved to `src/mcp/server.ts`.
- `src/logger.ts` gains `forceProductionMode()` to suppress non-error output when running as MCP stdio transport.
- Mode detection in `src/index.ts`: explicit `serve`/`mcp` argument or piped stdin → MCP mode; otherwise CLI mode.
- `commander` added as a production dependency.

## [1.3.0] - 2025-11-04

### Added

- Next.js flight-data parser surfaces account details via the `get_account_info` tool.
- `get_student_card_screenshot` tool navigates the secure portal and returns a PNG (plus metadata) of the student ID.

### Changed

- Student-card workflow now falls back through multiple Chrome discovery strategies (env paths, bundled Chrome, system channel) before erroring.

### Fixed

- TypeScript configuration issues uncovered by `tsc --noEmit` for the new Puppeteer logic.

## [1.2.3] - 2025-09-06

### Added

- "Mark all as read" functionality for news items.

## [1.2.2] - 2025-09-06

### Added

- ESLint integration to standardise code quality checks.

### Changed

- Removed non-existent functions and unused code paths.
- Updated GitHub Actions to rely on the latest pnpm release.

## [1.2.1] - 2025-07-15

### Added

- Expanded installation instructions for end users.

## [1.2.0] - 2025-07-15

### Added

- Automatic User-Agent rotation for HTTP requests.
- Read-status tracking for detailed news entries.

### Changed

- Default news retrieval count increased for better coverage.

## [1.1.0] - 2025-07-15

### Added

- `limit` and `sort` parameters for `get_news`.

### Changed

- Production logging streamlined and build output trimmed.

[unreleased]: https://github.com/minagishl/nlobby-cli/compare/v1.4.3...HEAD
[1.4.3]: https://github.com/minagishl/nlobby-cli/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/minagishl/nlobby-cli/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/minagishl/nlobby-cli/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/minagishl/nlobby-cli/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/minagishl/nlobby-cli/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/minagishl/nlobby-cli/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/minagishl/nlobby-cli/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/minagishl/nlobby-cli/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/minagishl/nlobby-cli/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/minagishl/nlobby-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/minagishl/nlobby-cli/releases/tag/v1.0.0
