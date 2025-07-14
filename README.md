# N Lobby MCP Server

A Model Context Protocol (MCP) server for accessing N Lobby school portal data. This server provides secure access to school information including announcements, schedules, and learning resources through browser-based authentication.

## Features

- **Browser-based Authentication**: Interactive login via automated browser window
- **Cookie-based Session Management**: Secure session handling with NextAuth.js cookies
- **School Information Access**: Retrieve announcements, schedules, and learning resources
- **Multiple Calendar Types**: Support for both personal and school calendars
- **User Role Support**: Different access levels for students, parents, and staff
- **MCP Protocol Compliance**: Full compatibility with MCP-enabled AI assistants
- **Advanced Testing Tools**: Built-in debugging and testing capabilities

## Installation

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

```bash
pnpm run start
```

### MCP Resources

The server provides the following resources:

- `nlobby://announcements` - School announcements and notices
- `nlobby://schedule` - Daily class schedule and events

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

- `get_announcements` - Retrieve school announcements
- `get_news_detail` - Retrieve detailed information for a specific news article
- `get_schedule` - Get schedule for a specific date (backward compatibility)
- `get_calendar_events` - Get calendar events with advanced options (personal/school)
- `test_calendar_endpoints` - Test both personal and school calendar endpoints

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

# Get today's announcements
get_announcements

# Get detailed information for a specific news article
get_news_detail newsId="980"

# Get personal calendar events for today
get_calendar_events calendar_type="personal" period="today"

# Get school calendar events for this week
get_calendar_events calendar_type="school" period="week"
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

# Check your child's announcements
get_announcements

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
├── auth-server.ts        # HTTP server for OAuth callbacks
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
