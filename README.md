# N Lobby CLI

> **Note:** The developer assumes no responsibility for any damages that may occur from using this tool. This software was developed for educational purposes and its operation is not guaranteed.

A dual-mode CLI and Model Context Protocol (MCP) server for accessing N Lobby school portal data. Use it interactively from the terminal with `nlobby`, or connect it to an AI assistant as an MCP server with `nlobby serve`.

## Features

- **CLI Mode**: Access N Lobby data directly from the terminal — news, schedule, courses, profile, and more
- **MCP Mode**: Full MCP server compatible with Claude, Cursor, and other MCP-enabled AI assistants
- **Browser-based Authentication**: Interactive login via automated Puppeteer browser window
- **Session Persistence**: CLI mode saves cookies to `~/.nlobby/session` for seamless subsequent use
- **School Information Access**: Retrieve announcements, schedules, and learning resources
- **Required Courses Management**: Access required course information and academic data
- **Multiple Calendar Types**: Support for both personal and school calendars
- **User Role Support**: Different access levels for students, parents, and staff

## Installation

### Option 1: Install from npm (Recommended)

```bash
npm install -g nlobby-cli
```

### Option 2: Development Installation

1. Clone the repository:

```bash
git clone https://github.com/minagishl/nlobby-cli.git
cd nlobby-cli
```

2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm run build
```

## Configuration

Create a `.env` file if you need to override defaults (optional):

```env
NLOBBY_BASE_URL=https://nlobby.nnn.ed.jp
MCP_SERVER_NAME=nlobby-cli
MCP_SERVER_VERSION=1.0.0
```

---

## CLI Usage

### Authentication

```bash
# Interactive browser login (recommended)
nlobby login

# Set cookies manually
nlobby cookies set "__Secure-next-auth.session-token=ey...;"

# Check current authentication status
nlobby cookies check
```

### News

```bash
# List latest news (default: 10, newest first)
nlobby news

# Filter and sort
nlobby news --limit 20 --category お知らせ --sort oldest --unread

# Show full article
nlobby news show 980

# Mark as read
nlobby news read 980
```

### Schedule & Calendar

```bash
# Today's schedule
nlobby schedule

# Specific date
nlobby schedule 2026-04-01

# This week's personal calendar
nlobby calendar

# School calendar for a date range
nlobby calendar --type school --from 2026-04-01 --to 2026-04-07
```

### Courses

```bash
# All required courses
nlobby courses

# Filter by grade / semester
nlobby courses --grade 2 --semester 2025
```

### Profile & Health

```bash
nlobby profile
nlobby health
```

### MCP Server

```bash
# Start MCP server (stdio transport)
nlobby serve
# or
nlobby mcp
```

> All commands support `--json` to output raw JSON instead of formatted text.

---

## MCP Usage

<details>
<summary>Setup with Cursor and Other MCP Clients</summary>

### Cursor IDE Setup

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=nlobby&config=eyJlbnYiOnsiTkxPQkJZX0JBU0VfVVJMIjoiaHR0cHM6Ly9ubG9iYnkubm5uLmVkLmpwIn0sImNvbW1hbmQiOiJucHggLXkgbmxvYmJ5LWNsaSBzZXJ2ZSJ9)

Add the following to your Cursor settings (`~/.cursor/config.json`):

```json
{
  "mcpServers": {
    "nlobby": {
      "command": "npx",
      "args": ["-y", "nlobby-cli", "serve"],
      "env": {
        "NLOBBY_BASE_URL": "https://nlobby.nnn.ed.jp"
      }
    }
  }
}
```

### Claude Desktop Setup

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "nlobby": {
      "command": "npx",
      "args": ["-y", "nlobby-cli", "serve"],
      "env": {
        "NLOBBY_BASE_URL": "https://nlobby.nnn.ed.jp"
      }
    }
  }
}
```

### Other MCP Clients

For any MCP-compatible client, use:

- **Command**: `nlobby serve` (if installed globally) or `node /path/to/dist/index.js serve`
- **Protocol**: stdio
- **Environment**: Optional environment variables as listed in the Configuration section

</details>

### MCP Resources

| URI                         | Description                               |
| --------------------------- | ----------------------------------------- |
| `nlobby://news`             | School news and notices                   |
| `nlobby://schedule`         | Daily class schedule and events           |
| `nlobby://required-courses` | Required courses and academic information |
| `nlobby://user-profile`     | Current user information                  |

### MCP Tools

#### Authentication

| Tool                    | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `interactive_login`     | Open browser for manual login (recommended)     |
| `login_help`            | Personalized login help and troubleshooting     |
| `set_cookies`           | Manually set authentication cookies             |
| `check_cookies`         | Check authentication cookie status              |
| `verify_authentication` | Verify authentication status across all clients |

#### News

| Tool                   | Key Parameters               | Description                           |
| ---------------------- | ---------------------------- | ------------------------------------- |
| `get_news`             | `category?` `limit?` `sort?` | Retrieve school news with filtering   |
| `get_news_detail`      | `newsId` `markAsRead?`       | Full detail for a specific article    |
| `mark_news_as_read`    | `ids` (array)                | Mark articles as read                 |
| `get_unread_news_info` |                              | Unread count and important-news flags |

#### Schedule & Calendar

| Tool                      | Key Parameters                                     | Description                       |
| ------------------------- | -------------------------------------------------- | --------------------------------- |
| `get_schedule`            | `date?`                                            | Schedule for a date (YYYY-MM-DD)  |
| `get_calendar_events`     | `calendar_type?` `from_date?` `to_date?` `period?` | Calendar events (personal/school) |
| `test_calendar_endpoints` | `from_date?` `to_date?`                            | Test both calendar endpoints      |
| `get_calendar_filters`    |                                                    | Lobby calendar filter definitions |

#### Courses & Exams

| Tool                   | Key Parameters                   | Description                             |
| ---------------------- | -------------------------------- | --------------------------------------- |
| `get_required_courses` | `grade?` `semester?` `category?` | Required courses with progress tracking |
| `check_exam_day`       | `date?`                          | Check if a date is an exam day          |
| `finish_exam_day_mode` |                                  | End exam day mode                       |
| `get_exam_otp`         |                                  | Get one-time password for exam          |

#### Account & Navigation

| Tool                          | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `get_account_info`            | Extract account info from Next.js page       |
| `get_student_card_screenshot` | Capture student ID card screenshot           |
| `update_last_access`          | Update last access timestamp                 |
| `get_navigation_menus`        | Main navigation menu list                    |
| `get_notifications`           | Notification messages                        |
| `get_user_interests`          | User interest tags (with optional icon data) |
| `get_interest_weights`        | Interest weight scale definitions            |

#### Debugging

| Tool                 | Key Parameters        | Description                    |
| -------------------- | --------------------- | ------------------------------ |
| `health_check`       |                       | Test N Lobby API connection    |
| `debug_connection`   | `endpoint?`           | Detailed connection debugging  |
| `test_page_content`  | `endpoint?` `length?` | Page content retrieval testing |
| `test_trpc_endpoint` | `method` `params?`    | Test a specific tRPC endpoint  |

---

## Authentication Flow

### Method 1: Interactive Browser Login (Recommended)

**CLI:**

```bash
nlobby login
```

**MCP tool:** `interactive_login`

A browser window opens automatically. Complete the N Lobby login, and cookies are extracted and saved.

### Method 2: Manual Cookie Setup

1. Log in to N Lobby in your web browser
2. Open DevTools → Application / Storage → Cookies
3. Copy all cookies as a string

**CLI:**

```bash
nlobby cookies set "__Secure-next-auth.session-token=ey...;"
```

**MCP tool:** `set_cookies cookies="__Secure-next-auth.session-token=ey...;"`

---

## User Types

The server supports three user types based on email domain:

| Type         | Email Domain               |
| ------------ | -------------------------- |
| **Students** | `@nnn.ed.jp`               |
| **Staff**    | `@nnn.ac.jp`               |
| **Parents**  | Any other registered email |

---

## Project Structure

```
src/
├── index.ts              # Entry point — CLI vs MCP mode detection
├── config.ts             # Configuration management
├── logger.ts             # Logging utilities
├── trpc-client.ts        # tRPC client for API calls
├── types.ts              # TypeScript type definitions
├── api/
│   ├── index.ts          # NLobbyApi facade + session persistence
│   ├── context.ts        # ApiContext interface
│   ├── shared.ts         # Shared utilities (fetchRenderedHtml, …)
│   ├── news.ts           # News functions
│   ├── schedule.ts       # Schedule / calendar functions
│   ├── courses.ts        # Course / exam functions
│   ├── account.ts        # Account info / student card functions
│   ├── navigation.ts     # Navigation / notification / interest functions
│   └── health.ts         # Health check / debug functions
├── auth/
│   ├── browser.ts        # Puppeteer browser authentication
│   ├── nextauth.ts       # NextAuth.js session handling
│   └── credentials.ts    # Credential validation and guidance
├── cli/
│   ├── index.ts          # Commander program wiring
│   ├── commands/         # login, news, schedule, courses, profile, health, serve
│   └── formatters/       # Human-readable output formatters
└── mcp/
    └── server.ts         # MCP server (28 tools, 4 resources)
```

---

## Development

### Scripts

```bash
pnpm run build   # Build (esbuild bundle + tsc type declarations)
pnpm run dev     # Watch mode
pnpm run start   # Start MCP server
pnpm run lint    # Lint
pnpm run format  # Format
```

### Security Notes

- CLI cookies are stored in `~/.nlobby/session` (plain text — protect accordingly)
- MCP mode keeps all authentication tokens in memory only
- Browser automation is used only for authentication, not data scraping
- No sensitive data is logged

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
