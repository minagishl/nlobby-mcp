# Changelog

> This document follows a Keep a Changelog–inspired format. Each release groups notable additions, changes, and fixes, with helpful comparison links for digging deeper.

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
