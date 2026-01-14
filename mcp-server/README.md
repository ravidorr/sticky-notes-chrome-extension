# Sticky Notes MCP Server

An MCP (Model Context Protocol) server that allows AI assistants like Cursor to interact with your Sticky Notes.

## Setup

### 1. Get an API Key

Generate an API key from the Sticky Notes extension:
1. Open the extension popup
2. Sign in with your Google account
3. Go to Settings > API Keys
4. Generate a new key with `notes:read` and `notes:write` scopes

Or use the web interface at: `scripts/get-api-key.html`

### 2. Configure Cursor

Add the MCP server to your Cursor settings (`.cursor/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "sticky-notes": {
      "command": "node",
      "args": ["/path/to/sticky-notes-chrome-extension/mcp-server/index.js"],
      "env": {
        "STICKY_NOTES_API_KEY": "sk_live_your_api_key_here"
      }
    }
  }
}
```

### 3. Restart Cursor

Restart Cursor to load the MCP server. You should see "sticky-notes" in the MCP servers list.

---

## Tools

### Note Management

| Tool | Description |
|------|-------------|
| `list_notes` | List notes with filters (owned/shared/all, by URL/domain) |
| `get_note` | Get a specific note by ID |
| `create_note` | Create a new sticky note on a webpage |
| `update_note` | Update note content or theme |
| `delete_note` | Delete a note |
| `search_notes` | Search notes by content, URL, or selector |

### Sharing

| Tool | Description |
|------|-------------|
| `share_note` | Share a note with another user by email |
| `unshare_note` | Remove a user from a shared note |

### Comments

| Tool | Description |
|------|-------------|
| `list_note_comments` | Get all comments on a note |
| `add_comment` | Add a comment to a note |
| `list_commented_notes` | Find notes you've commented on |

### Statistics & Export

| Tool | Description |
|------|-------------|
| `get_note_stats` | Get statistics about your notes |
| `export_notes` | Export all notes as JSON |
| `show_notes_panel` | Formatted markdown view of notes for a URL |
| `get_help` | Get help with using Sticky Notes MCP |

---

## Tool Details

### list_notes

List notes with flexible filtering.

**Parameters:**
- `filter` (optional): `"owned"`, `"shared"`, or `"all"` (default)
- `url` (optional): Filter by exact URL
- `domain` (optional): Filter by domain (e.g., `"github.com"`)
- `limit` (optional): Max results (default: 50)

**Examples:**
```
"Show me my notes" -> filter: "owned"
"What notes are shared with me?" -> filter: "shared"
"Show notes for github.com" -> domain: "github.com"
```

### create_note

Create a new sticky note on a webpage.

**Parameters:**
- `url` (required): The webpage URL
- `selector` (required): CSS selector for the target element
- `content` (optional): Note text (can include HTML)
- `theme` (optional): `"yellow"`, `"blue"`, `"green"`, or `"pink"`

**Example:**
```
"Create a yellow note on https://example.com attached to the h1 element saying 'Review this'"
```

### get_note_stats

Get statistics about your notes. Returns:
- Total notes count (owned + shared)
- Breakdown by theme
- Number of domains
- Recently updated count

### search_notes

Search notes by content, URL, or selector.

**Parameters:**
- `query` (required): Search text
- `limit` (optional): Max results

---

## Prompts

Pre-defined prompts for common workflows. Use these by asking naturally:

| Prompt | Description | Example |
|--------|-------------|---------|
| `notes_summary` | Complete summary of all notes | "Give me a summary of my notes" |
| `organize_notes` | Group notes by domain | "Help me organize my notes" |
| `review_shared` | Review notes shared with you | "Show me shared notes" |
| `find_note` | Guided search for a note | "Help me find a note about React" |
| `cleanup_notes` | Find stale/unused notes | "Help me clean up old notes" |

---

## Resources

Quick-access read-only data:

| URI | Description |
|-----|-------------|
| `notes://stats` | Current note statistics |
| `notes://recent` | Last 10 recently updated notes |
| `notes://domains` | List of domains where you have notes |

---

## Examples

### Basic Usage

```
User: "How many notes do I have?"
Assistant: [calls get_note_stats] You have 42 notes total - 35 owned and 7 shared with you.

User: "Show me notes on GitHub"
Assistant: [calls list_notes with domain: "github.com"] Found 8 notes on GitHub...

User: "Create a note on this page"
Assistant: What URL and element should I attach it to? What content?
```

### Advanced Workflows

```
User: "Help me organize my notes"
Assistant: [uses organize_notes prompt, calls get_note_stats then list_notes]
         Your notes are spread across 12 domains. Here's the breakdown:
         - github.com: 15 notes
         - docs.google.com: 8 notes
         ...

User: "What notes have I commented on?"
Assistant: [calls list_commented_notes] You've commented on 5 notes...
```

---

## Web Panel

A visual dashboard is available for browsing notes:

```bash
cd mcp-server
npm run panel
```

Opens at `http://localhost:3002`. Features:
- Statistics dashboard
- Filter tabs (All/My Notes/Shared/Commented)
- Theme breakdown visualization
- URL/domain filtering

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `STICKY_NOTES_API_KEY` | Your API key | Yes |
| `STICKY_NOTES_API_URL` | Custom API URL (for self-hosted) | No |

---

## Troubleshooting

### "API key required" error
Make sure `STICKY_NOTES_API_KEY` is set in your MCP configuration.

### Tools not appearing in Cursor
1. Check Cursor's MCP server logs for errors
2. Verify the path to `index.js` is correct
3. Restart Cursor after config changes

### "Permission denied" errors
Your API key may not have the required scopes. Generate a new key with both `notes:read` and `notes:write`.

---

## Development

```bash
# Run the MCP server directly (for testing)
STICKY_NOTES_API_KEY=sk_live_xxx node index.js

# Run the web panel
npm run panel
```
