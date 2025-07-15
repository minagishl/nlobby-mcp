# N Lobby MCP Server

> **Note:** The developer assumes no responsibility for any damages that may occur from using this MCP server. This software was developed for educational purposes and its operation is not guaranteed.

A Model Context Protocol (MCP) server for accessing N Lobby school portal data. This server provides secure access to school information including announcements, schedules, and learning resources through browser-based authentication.

## Features

- **Browser-based Authentication**: Interactive login via automated browser window
- **Cookie-based Session Management**: Secure session handling with NextAuth.js cookies
- **School Information Access**: Retrieve announcements, schedules, and learning resources
- **Required Courses Management**: Access required course information and academic data
- **Multiple Calendar Types**: Support for both personal and school calendars
- **User Role Support**: Different access levels for students, parents, and staff
- **MCP Protocol Compliance**: Full compatibility with MCP-enabled AI assistants
- **Advanced Testing Tools**: Built-in debugging and testing capabilities

## Installation

### Option 1: Install from npm (Recommended)

```bash
npm install -g nlobby-mcp
```

### Option 2: Development Installation

1. Clone the repository:

```bash
git clone https://github.com/minagishl/nlobby-mcp.git
cd nlobby-mcp
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env if needed (default values should work)
```

4. Build the project:

```bash
pnpm run build
```

## Configuration

Create a `.env` file with the following variables (optional, defaults provided):

```env
# N Lobby Configuration
NLOBBY_BASE_URL=https://nlobby.nnn.ed.jp

# MCP Server Configuration
MCP_SERVER_NAME=nlobby-mcp
MCP_SERVER_VERSION=1.0.0
```

## Usage

### Running the Server

For npm installation:

```bash
nlobby-mcp
```

For development installation:

```bash
pnpm run start
```

<details>
<summary>Setup with Cursor and Other MCP Clients</summary>

### Cursor IDE Setup

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=nlobby&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm5sb2JieS1tY3AiXSwiZW52Ijp7Ik5MT0JCWV9CQVNFX1VSTCI6Imh0dHBzOi8vbmxvYmJ5Lm5ubi5lZC5qcCJ9fQ%3D%3D)

Add the following to your Cursor settings (`~/.cursor/config.json`):

```json
{
  "mcpServers": {
    "nlobby": {
      "command": "npx",
      "args": ["-y", "nlobby-mcp"],
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
      "args": ["-y", "nlobby-mcp"],
      "env": {
        "NLOBBY_BASE_URL": "https://nlobby.nnn.ed.jp"
      }
    }
  }
}
```

### Other MCP Clients

For any MCP-compatible client, use:

- **Command**: `nlobby-mcp` (if installed globally) or `node /path/to/nlobby-mcp/dist/index.js`
- **Protocol**: stdio
- **Environment**: Optional environment variables as listed in Configuration section

</details>

### MCP Resources

The server provides the following resources:

- `nlobby://news` - School news and notices
- `nlobby://schedule` - Daily class schedule and events
- `nlobby://required-courses` - Required courses and academic information
- `nlobby://user-profile` - Current user information

### MCP Tools

Available tools:

#### Authentication Tools

- `interactive_login` - Open browser for manual login to N Lobby (recommended)
- `login_help` - Get personalized login help and troubleshooting
- `set_cookies` - Manually set authentication cookies
- `check_cookies` - Check authentication cookie status
- `verify_authentication` - Verify authentication status across all clients

#### Data Retrieval Tools

- `get_news` - Retrieve school news with filtering and sorting options
- `get_news_detail` - Retrieve detailed information for a specific news article
- `get_required_courses` - Retrieve required courses information with filtering options
- `get_schedule` - Get schedule for a specific date (backward compatibility)
- `get_calendar_events` - Get calendar events with advanced options (personal/school)
- `test_calendar_endpoints` - Test both personal and school calendar endpoints
- `mark_news_as_read` - Mark a news article as read

#### Debugging Tools

- `health_check` - Test N Lobby API connection
- `debug_connection` - Debug N Lobby connection with detailed information
- `test_page_content` - Test page content retrieval and show sample content
- `test_trpc_endpoint` - Test specific tRPC endpoint with detailed response

### MCP Prompts

This server does not provide any pre-configured prompts.

## Authentication Flow

### Method 1: Interactive Browser Login (Recommended)

1. Use the `interactive_login` tool (no credentials required)
2. A browser window will open to N Lobby
3. Complete the login process manually in the browser
4. The system will detect when you're logged in and extract cookies automatically
5. Access real N Lobby data immediately

### Method 2: Manual Cookie Setup

1. Login to N Lobby via web browser
2. Extract cookies from browser developer tools:
   - Open Developer Tools (F12)
   - Go to Application/Storage tab
   - Copy all cookies as a string
3. Use `set_cookies` tool with the complete cookie string
4. Use `health_check` tool to verify connection
5. Access real N Lobby data via other tools

## Quick Start Examples

### For Students

```bash
# Get help for your student account
login_help email="your.name@nnn.ed.jp"

# Use interactive login (recommended)
interactive_login

# Get today's news
get_news

# Get detailed information for a specific news article
get_news_detail newsId="980"

# Get news detail and mark as read
get_news_detail newsId="980" markAsRead=true

# Get personal calendar events for today
get_calendar_events calendar_type="personal" period="today"

# Get school calendar events for this week
get_calendar_events calendar_type="school" period="week"

# Get required courses information
get_required_courses

# Get required courses for a specific grade
get_required_courses grade=2

# Mark a news article as read
mark_news_as_read id="980"
```

### For Staff

```bash
# Get help for your staff account
login_help email="your.name@nnn.ac.jp"

# Use interactive login
interactive_login

# Test both calendar endpoints
test_calendar_endpoints
```

### For Parents

```bash
# Get help for your parent account
login_help email="parent@gmail.com"

# Use interactive login
interactive_login

# Check your child's news
get_news

# Get your child's schedule
get_calendar_events calendar_type="personal" period="today"
```

### Troubleshooting

```bash
# Get general help
login_help

# Check connection status
health_check

# Check cookie status
check_cookies

# Verify authentication across all systems
verify_authentication

# Debug connection with detailed info
debug_connection

# Test page content retrieval
test_page_content endpoint="/news"
```

### Required Courses

The `get_required_courses` tool allows you to retrieve academic course information:

```bash
# Get all required courses
get_required_courses

# Filter by grade level
get_required_courses grade=1
get_required_courses grade=2

# Combine multiple filters
get_required_courses grade=2 semester="2024"
```

The response includes comprehensive course information:

- **Course Details**: Subject code/name, curriculum code/name
- **Academic Credits**: Academic credit hours and approved credits
- **Progress Tracking**: Report completion percentage, average scores
- **Status Information**: Acquisition status, evaluation grades
- **Test Information**: Exam status, periodic exam results, makeup exam URLs
- **Schooling Data**: Attendance counts and requirements
- **Time Information**: Term year, grade level (1年次, 2年次, 3年次)
- **Computed Fields**: Progress percentage, completion status, average scores

### Calendar Events

The `get_calendar_events` tool supports advanced options:

```bash
# Get personal calendar for today
get_calendar_events calendar_type="personal" period="today"

# Get school calendar for this week
get_calendar_events calendar_type="school" period="week"

# Get events for a specific date range
get_calendar_events calendar_type="personal" from_date="2024-01-15" to_date="2024-01-20"

# Get events for a single day
get_calendar_events calendar_type="personal" from_date="2024-01-15"
```

### Cookie Format

When using `set_cookies`, provide the complete cookie string from browser:

```
__Secure-next-auth.session-token=ey...; __Host-next-auth.csrf-token=abc123...; other-cookies=values;
```

## User Types

The server supports three user types based on email domain:

- **Students**: `@nnn.ed.jp`
- **Staff**: `@nnn.ac.jp`
- **Parents**: Any other registered email addresses (Gmail, Yahoo, company emails, etc.)

## Development

### Scripts

- `pnpm run build` - Build the TypeScript project
- `pnpm run dev` - Watch mode for development
- `pnpm run start` - Start the MCP server
- `pnpm run test` - Run tests
- `pnpm run lint` - Lint the code
- `pnpm run format` - Format the code

### Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server implementation
├── api.ts                # N Lobby API integration
├── browser-auth.ts       # Browser automation for login
├── credential-manager.ts # User credential validation and management
├── nextauth.ts           # NextAuth.js session handling
├── trpc-client.ts        # tRPC client for API calls
├── config.ts             # Configuration management
├── logger.ts             # Logging utilities
└── types.ts              # TypeScript type definitions
```

### Architecture

The server uses multiple layers for authentication and API access:

1. **Browser Authentication**: Automated browser for interactive login
2. **Cookie Management**: Handles NextAuth.js session cookies
3. **HTTP Client**: Axios-based client for REST API calls
4. **tRPC Client**: Type-safe client for tRPC endpoints
5. **Credential Manager**: Validates user types and provides guidance

## Security Notes

- All authentication tokens are stored in memory only
- The server uses secure cookie-based authentication
- Access is restricted to authorized N High School Group email domains
- No sensitive data is logged or persisted
- Browser automation is used only for authentication, not data scraping

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Use `interactive_login` for the most reliable authentication
2. **Cookie Sync Issues**: Run `verify_authentication` to check synchronization
3. **Connection Problems**: Use `health_check` and `debug_connection` for diagnosis
4. **Empty Results**: Ensure you're authenticated and have proper permissions

### Debug Tools

The server includes comprehensive debugging tools:

- `debug_connection` - Network and authentication debugging
- `test_page_content` - Content retrieval testing
- `test_trpc_endpoint` - API endpoint testing
- `verify_authentication` - Authentication status verification

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
