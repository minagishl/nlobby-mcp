# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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

[`1.3.0...1.4.0`](https://github.com/minagishl/nlobby-mcp/compare/v1.3.0...v1.4.0)

---

## 1.3.0 · 2025-11-04

### Added

- Next.js flight-data parser surfaces account details via the `get_account_info` tool.
- `get_student_card_screenshot` tool navigates the secure portal and returns a PNG (plus metadata) of the student ID.

### Changed

- Student-card workflow now falls back through multiple Chrome discovery strategies (env paths, bundled Chrome, system channel) before erroring.

### Fixed

- TypeScript configuration issues uncovered by `tsc --noEmit` for the new Puppeteer logic.

[`1.2.3...1.3.0`](https://github.com/minagishl/nlobby-mcp/compare/v1.2.3...v1.3.0)

---

## 1.2.3 · 2025-09-06

### Added

- “Mark all as read” functionality for news items.

[`1.2.2...1.2.3`](https://github.com/minagishl/nlobby-mcp/compare/v1.2.2...v1.2.3)

---

## 1.2.2 · 2025-09-06

### Added

- ESLint integration to standardise code quality checks.

### Changed

- Removed non-existent functions and unused code paths.
- Updated GitHub Actions to rely on the latest pnpm release.

[`1.2.1...1.2.2`](https://github.com/minagishl/nlobby-mcp/compare/v1.2.1...v1.2.2)

---

## 1.2.1 · 2025-07-15

### Added

- Expanded installation instructions for end users.

[`1.2.0...1.2.1`](https://github.com/minagishl/nlobby-mcp/compare/v1.2.0...v1.2.1)

---

## 1.2.0 · 2025-07-15

### Added

- Automatic User-Agent rotation for HTTP requests.
- Read-status tracking for detailed news entries.

### Changed

- Default news retrieval count increased for better coverage.

[`1.1.0...1.2.0`](https://github.com/minagishl/nlobby-mcp/compare/v1.1.0...v1.2.0)

---

## 1.1.0 · 2025-07-15

### Added

- `limit` and `sort` parameters for `get_news`.

### Changed

- Production logging streamlined and build output trimmed.

[`1.0.0...1.1.0`](https://github.com/minagishl/nlobby-mcp/compare/v1.0.0...v1.1.0)
