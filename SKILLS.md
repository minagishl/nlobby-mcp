# N Lobby CLI & MCP Server — Skills Reference

## CLI Commands

> All commands support `--json` to output raw JSON instead of formatted text.

### Auth

| Command                        | Options / Arguments | Description                         |
| ------------------------------ | ------------------- | ----------------------------------- |
| `nlobby login`                 |                     | Open browser for interactive login  |
| `nlobby login-help`            | `--email <email>`   | Login help and troubleshooting tips |
| `nlobby cookies set <cookies>` |                     | Set cookies manually                |
| `nlobby cookies check`         |                     | Show current authentication status  |

### News

| Command                     | Options / Arguments                                                                                                     | Description                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `nlobby news`               | `--limit <n>` `--category <cat>` `--tab all\|mentor` `--sort newest\|oldest\|title-asc\|title-desc` `--unread` `--json` | List news (default: 10, newest)                                     |
| `nlobby news mentor`        | same as `news list` without `--tab`                                                                                     | List mentor announcements (`/news?tab=mentor`)                      |
| `nlobby news show <id>`     | `--mark-read` `--json`                                                                                                  | Show news article detail                                            |
| `nlobby news download <id>` | `--index <n>` `--output-dir <dir>`                                                                                      | Download one attachment (1-based index; uses authenticated session) |
| `nlobby news read <ids…>`   |                                                                                                                         | Mark one or more articles as read                                   |
| `nlobby news unread-info`   | `--json`                                                                                                                | Show unread count and flags                                         |

### Schedule & Calendar

| Command                   | Options / Arguments                                                                            | Description                                |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `nlobby schedule [date]`  | `--json`                                                                                       | Show schedule (YYYY-MM-DD, default: today) |
| `nlobby calendar`         | `--from <date>` `--to <date>` `--period today\|week\|month` `--type personal\|school` `--json` | Show calendar events (default: this week)  |
| `nlobby calendar test`    | `--from <date>` `--to <date>` `--json`                                                         | Test both calendar endpoints               |
| `nlobby calendar filters` | `--json`                                                                                       | Show lobby calendar filter list            |

### Courses & Exam

| Command                    | Options / Arguments                                         | Description                    |
| -------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `nlobby courses`           | `--grade <n>` `--semester <n>` `--category <name>` `--json` | Show required courses          |
| `nlobby courses resources` | `--subject <name>` `--json`                                 | Show learning resources        |
| `nlobby exam check [date]` | `--json`                                                    | Check if a date is an exam day |
| `nlobby exam finish`       | `--json`                                                    | Finish exam day mode           |
| `nlobby exam otp`          | `--json`                                                    | Get one-time password for exam |

### Discover & Pages

| Command              | Options / Arguments     | Description                                     |
| -------------------- | ----------------------- | ----------------------------------------------- |
| `nlobby discover`    | `--json`                | Map site features to CLI commands and nav menus |
| `nlobby page <path>` | `--length <n>` `--json` | Fetch authenticated page content by URL path    |

### Profile

| Command                        | Options / Arguments | Description                         |
| ------------------------------ | ------------------- | ----------------------------------- |
| `nlobby profile`               | `--json`            | Show account info from Next.js page |
| `nlobby profile card`          |                     | Capture student ID card screenshot  |
| `nlobby profile update-access` | `--json`            | Update last access timestamp        |

### Navigation & Interests

| Command                    | Options / Arguments    | Description                            |
| -------------------------- | ---------------------- | -------------------------------------- |
| `nlobby nav menus`         | `--json`               | Show main navigation menu list         |
| `nlobby nav notifications` | `--json`               | Show notification messages             |
| `nlobby nav interests`     | `--with-icon` `--json` | Show user interest tags                |
| `nlobby nav weights`       | `--json`               | Show interest weight scale definitions |

### Health & Debug

| Command                       | Options / Arguments                | Description                               |
| ----------------------------- | ---------------------------------- | ----------------------------------------- |
| `nlobby health`               | `--json`                           | Check API connectivity and authentication |
| `nlobby health debug`         | `--endpoint <path>`                | Debug connection with detailed info       |
| `nlobby health page`          | `--endpoint <path>` `--length <n>` | Fetch and sample raw page content         |
| `nlobby health trpc <method>` | `--params <json>` `--json`         | Test a tRPC endpoint directly             |
| `nlobby health verify`        |                                    | Verify cookie sync across all clients     |

### MCP Server

| Command                       | Description                        |
| ----------------------------- | ---------------------------------- |
| `nlobby serve` / `nlobby mcp` | Start MCP server (stdio transport) |

---

## MCP Tools

| Tool                          | Parameters                                         | Description                             |
| ----------------------------- | -------------------------------------------------- | --------------------------------------- |
| `get_news`                    | `category?` `limit?` `sort?` `tab?`                | Retrieve school news                    |
| `get_news_detail`             | `newsId` `markAsRead?`                             | Get full detail of a news article       |
| `mark_news_as_read`           | `ids` (array)                                      | Mark news articles as read              |
| `get_unread_news_info`        |                                                    | Unread news count and important flags   |
| `get_schedule`                | `date?`                                            | School schedule for a date (YYYY-MM-DD) |
| `get_calendar_events`         | `calendar_type?` `from_date?` `to_date?` `period?` | Calendar events (personal or school)    |
| `test_calendar_endpoints`     | `from_date?` `to_date?`                            | Test both calendar endpoints            |
| `get_calendar_filters`        |                                                    | Lobby calendar filter list              |
| `get_required_courses`        | `grade?` `semester?` `category?`                   | Required courses with progress tracking |
| `get_learning_resources`      | `subject?`                                         | Learning materials and study resources  |
| `download_news_attachment`    | `newsId` `index?` `outputDir?`                     | Download a news article attachment      |
| `check_exam_day`              | `date?`                                            | Check if date is an exam day            |
| `finish_exam_day_mode`        |                                                    | Finish exam day mode                    |
| `get_exam_otp`                |                                                    | Get one-time password for exam          |
| `get_account_info`            |                                                    | Extract account info from Next.js page  |
| `get_student_card_screenshot` |                                                    | Capture student ID card screenshot      |
| `update_last_access`          |                                                    | Update last access timestamp            |
| `get_navigation_menus`        |                                                    | Main navigation menu list               |
| `get_notifications`           |                                                    | Notification messages                   |
| `get_user_interests`          | `with_icon?`                                       | User interest tags                      |
| `get_interest_weights`        |                                                    | Interest weight scale definitions       |
| `set_cookies`                 | `cookies`                                          | Set authentication cookies              |
| `check_cookies`               |                                                    | Check authentication cookie status      |
| `health_check`                |                                                    | Check API connectivity                  |
| `debug_connection`            | `endpoint?`                                        | Debug connection with detailed info     |
| `test_page_content`           | `endpoint?` `length?`                              | Retrieve and sample page content        |
| `test_trpc_endpoint`          | `method` `params?`                                 | Test a tRPC endpoint directly           |
| `verify_authentication`       |                                                    | Verify cookie sync across all clients   |
| `interactive_login`           |                                                    | Open browser for manual login           |
| `login_help`                  | `email?`                                           | Login help and troubleshooting          |

---

## MCP Resources

| URI                           | Name               | Description                               |
| ----------------------------- | ------------------ | ----------------------------------------- |
| `nlobby://news`               | School News        | Latest school news and notices            |
| `nlobby://schedule`           | School Schedule    | Daily class schedule and events           |
| `nlobby://user-profile`       | User Profile       | Current user information and preferences  |
| `nlobby://required-courses`   | Required Courses   | Required courses and academic information |
| `nlobby://learning-resources` | Learning Resources | Learning materials and study resources    |
