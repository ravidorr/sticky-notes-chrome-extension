#!/usr/bin/env node

/**
 * Sticky Notes MCP Server
 * Allows Cursor to read and create sticky notes via MCP
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import process from 'process';

const API_BASE_URL = process.env.STICKY_NOTES_API_URL || 
  'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';
const DASHBOARD_URL = process.env.STICKY_NOTES_DASHBOARD_URL;
const API_KEY = process.env.STICKY_NOTES_API_KEY;

if (!API_KEY) {
  console.error('Error: STICKY_NOTES_API_KEY environment variable is required');
  process.exit(1);
}

/**
 * Make API request
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return null;
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || `API error: ${response.status}`);
  }
  
  return data;
}

// Create MCP server
const server = new Server(
  {
    name: 'sticky-notes-mcp',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_notes',
        description: 'List sticky notes with flexible filtering by ownership, URL, or domain',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'owned', 'shared'],
              description: 'Filter by ownership: "owned" (notes you created), "shared" (notes shared with you by others), "all" (both). Default: "all"'
            },
            url: {
              type: 'string',
              description: 'Filter notes by exact URL (optional)'
            },
            domain: {
              type: 'string',
              description: 'Filter notes by domain - matches all pages on that domain (e.g., "example.com" or "https://example.com"). More flexible than url filter.'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 50)'
            }
          }
        }
      },
      {
        name: 'get_note',
        description: 'Get a specific note by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'create_note',
        description: 'Create a new sticky note on a webpage',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The webpage URL where the note should appear'
            },
            selector: {
              type: 'string',
              description: 'CSS selector for the element to attach the note to (e.g., "h1", "#main", ".header")'
            },
            content: {
              type: 'string',
              description: 'The note content (can include HTML)'
            },
            theme: {
              type: 'string',
              enum: ['yellow', 'blue', 'green', 'pink'],
              description: 'Note color theme (default: yellow)'
            }
          },
          required: ['url', 'selector']
        }
      },
      {
        name: 'update_note',
        description: 'Update an existing note',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID'
            },
            content: {
              type: 'string',
              description: 'New note content'
            },
            theme: {
              type: 'string',
              enum: ['yellow', 'blue', 'green', 'pink'],
              description: 'New color theme'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_note',
        description: 'Delete a note',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID to delete'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'search_notes',
        description: 'Search notes by content, URL, or selector',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 50)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'share_note',
        description: 'Share a note with another user by email',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID'
            },
            email: {
              type: 'string',
              description: 'Email address to share with'
            }
          },
          required: ['id', 'email']
        }
      },
      {
        name: 'export_notes',
        description: 'Export all notes as JSON',
        inputSchema: {
          type: 'object',
          properties: {
            includeComments: {
              type: 'boolean',
              description: 'Include comments in export (default: false)'
            }
          }
        }
      },
      {
        name: 'show_notes_panel',
        description: 'Get a formatted display of notes for a URL. Returns nicely formatted markdown instead of raw JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to show notes for'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'get_note_stats',
        description: 'Get statistics about your notes - total counts, breakdown by theme, domains, and recent activity',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_commented_notes',
        description: 'List all notes where you have written at least one comment',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 50)'
            }
          }
        }
      },
      {
        name: 'list_note_comments',
        description: 'Get all comments for a specific note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'The note ID to get comments for'
            }
          },
          required: ['noteId']
        }
      },
      {
        name: 'add_comment',
        description: 'Add a comment to a note',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'The note ID to comment on'
            },
            content: {
              type: 'string',
              description: 'The comment text'
            },
            parentId: {
              type: 'string',
              description: 'Optional parent comment ID if this is a reply'
            }
          },
          required: ['noteId', 'content']
        }
      },
      {
        name: 'unshare_note',
        description: 'Remove a user from a shared note',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID'
            },
            email: {
              type: 'string',
              description: 'Email address to remove from sharing'
            }
          },
          required: ['id', 'email']
        }
      },
      {
        name: 'get_help',
        description: 'Get help with using Sticky Notes - shows available tools, examples, and tips',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: ['overview', 'creating', 'searching', 'sharing', 'comments', 'export'],
              description: 'Specific help topic (optional, defaults to overview)'
            }
          }
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_notes': {
        const params = new URLSearchParams();
        if (args?.filter) params.set('filter', args.filter);
        if (args?.url) params.set('url', args.url);
        if (args?.domain) params.set('domain', args.domain);
        if (args?.limit) params.set('limit', args.limit.toString());
        const queryString = params.toString();
        const endpoint = queryString ? `/notes?${queryString}` : '/notes';
        const result = await apiRequest(endpoint);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'get_note': {
        const result = await apiRequest(`/notes/${args.id}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'create_note': {
        const result = await apiRequest('/notes', {
          method: 'POST',
          body: JSON.stringify({
            url: args.url,
            selector: args.selector,
            content: args.content || '',
            theme: args.theme || 'yellow'
          })
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note created successfully!\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      }

      case 'update_note': {
        const updates = {};
        if (args.content !== undefined) updates.content = args.content;
        if (args.theme !== undefined) updates.theme = args.theme;
        
        const result = await apiRequest(`/notes/${args.id}`, {
          method: 'PUT',
          body: JSON.stringify(updates)
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note updated!\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      }

      case 'delete_note': {
        await apiRequest(`/notes/${args.id}`, { method: 'DELETE' });
        return {
          content: [
            {
              type: 'text',
              text: `Note ${args.id} deleted successfully.`
            }
          ]
        };
      }

      case 'search_notes': {
        const params = new URLSearchParams();
        params.set('q', args.query);
        if (args.limit) params.set('limit', args.limit.toString());
        const result = await apiRequest(`/notes/search?${params.toString()}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'share_note': {
        const result = await apiRequest(`/notes/${args.id}/share`, {
          method: 'POST',
          body: JSON.stringify({ email: args.email })
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note shared with ${args.email}!\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      }

      case 'export_notes': {
        const params = new URLSearchParams();
        if (args?.includeComments) params.set('includeComments', 'true');
        const queryString = params.toString();
        const endpoint = queryString ? `/notes/export?${queryString}` : '/notes/export';
        const result = await apiRequest(endpoint);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'show_notes_panel': {
        const params = new URLSearchParams();
        params.set('url', args.url);
        const result = await apiRequest(`/notes?${params.toString()}`);
        const notes = result.notes || [];
        
        // Format as markdown
        const hostname = new URL(args.url).hostname;
        let markdown = `## Notes for ${hostname} (${notes.length} note${notes.length !== 1 ? 's' : ''})\n\n`;
        
        if (notes.length === 0) {
          markdown += '_No notes found for this URL._\n';
          markdown += `\n**Dashboard:** ${DASHBOARD_URL}?url=${encodeURIComponent(args.url)}`;
        } else {
          notes.forEach((note, index) => {
            const theme = note.theme || 'yellow';
            const themeMarker = { yellow: '[Y]', blue: '[B]', green: '[G]', pink: '[P]' }[theme] || '[?]';
            const content = note.content ? note.content.replace(/<[^>]*>/g, '').trim() : '_No content_';
            const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }) : 'Unknown date';
            
            markdown += `### ${index + 1}. ${themeMarker} ${theme} on \`${note.selector}\`\n`;
            markdown += `> ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n`;
            markdown += `_Created: ${date} | ID: ${note.id}_\n\n`;
          });
          
          markdown += `---\n**Panel URL:** http://localhost:3002?url=${encodeURIComponent(args.url)}`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: markdown
            }
          ]
        };
      }

      case 'get_note_stats': {
        const result = await apiRequest('/notes/stats');
        
        // Format stats as readable markdown
        let markdown = '## Your Sticky Notes Statistics\n\n';
        markdown += `**Total Notes:** ${result.total}\n`;
        markdown += `- Owned by you: ${result.owned}\n`;
        markdown += `- Shared with you: ${result.shared}\n\n`;
        
        markdown += '**By Theme:**\n';
        for (const [theme, count] of Object.entries(result.byTheme)) {
          if (count > 0) {
            markdown += `- ${theme}: ${count}\n`;
          }
        }
        
        markdown += `\n**Domains:** ${result.domainCount} unique domain${result.domainCount !== 1 ? 's' : ''}\n`;
        if (result.domains && result.domains.length > 0) {
          markdown += result.domains.slice(0, 10).map(d => `- ${d}`).join('\n') + '\n';
          if (result.domains.length > 10) {
            markdown += `- ... and ${result.domains.length - 10} more\n`;
          }
        }
        
        markdown += `\n**Recently Updated:** ${result.recentlyUpdated} note${result.recentlyUpdated !== 1 ? 's' : ''} in the last week`;
        
        return {
          content: [{ type: 'text', text: markdown }]
        };
      }

      case 'list_commented_notes': {
        const params = new URLSearchParams();
        if (args?.limit) params.set('limit', args.limit.toString());
        const queryString = params.toString();
        const endpoint = queryString ? `/notes/commented?${queryString}` : '/notes/commented';
        const result = await apiRequest(endpoint);
        
        let markdown = `## Notes You've Commented On (${result.totalCommentedNotes})\n\n`;
        
        if (result.notes.length === 0) {
          markdown += '_You haven\'t commented on any notes yet._';
        } else {
          result.notes.forEach((note, index) => {
            const content = note.content ? note.content.replace(/<[^>]*>/g, '').trim().substring(0, 100) : '_No content_';
            markdown += `${index + 1}. **${note.selector}** on ${note.url}\n`;
            markdown += `   > ${content}${content.length >= 100 ? '...' : ''}\n`;
            markdown += `   _ID: ${note.id}${note.isShared ? ' (shared)' : ''}_\n\n`;
          });
        }
        
        return {
          content: [{ type: 'text', text: markdown }]
        };
      }

      case 'list_note_comments': {
        const result = await apiRequest(`/notes/${args.noteId}/comments`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'add_comment': {
        const body = {
          content: args.content
        };
        if (args.parentId) {
          body.parentId = args.parentId;
        }
        
        const result = await apiRequest(`/notes/${args.noteId}/comments`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        return {
          content: [
            {
              type: 'text',
              text: `Comment added successfully!\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      }

      case 'unshare_note': {
        const result = await apiRequest(`/notes/${args.id}/share/${encodeURIComponent(args.email)}`, {
          method: 'DELETE'
        });
        return {
          content: [
            {
              type: 'text',
              text: `${args.email} removed from shared list.\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      }

      case 'get_help': {
        const topic = args?.topic || 'overview';
        let helpText = '';
        
        switch (topic) {
          case 'overview':
            helpText = `# Sticky Notes MCP Help

## Available Tools

### Note Management
- **list_notes** - List notes with filters (owned/shared/all, by URL/domain)
- **get_note** - Get a specific note by ID
- **create_note** - Create a new sticky note
- **update_note** - Update note content or theme
- **delete_note** - Delete a note
- **search_notes** - Search notes by content

### Sharing
- **share_note** - Share a note with another user by email
- **unshare_note** - Remove a user from a shared note

### Comments
- **list_note_comments** - Get all comments on a note
- **add_comment** - Add a comment to a note
- **list_commented_notes** - Find notes you've commented on

### Statistics & Export
- **get_note_stats** - Get statistics about your notes
- **export_notes** - Export all notes as JSON
- **show_notes_panel** - Formatted markdown view of notes for a URL

## Quick Examples
- "Show me my notes" -> list_notes with filter="owned"
- "What notes have been shared with me?" -> list_notes with filter="shared"
- "Show statistics" -> get_note_stats
- "Find notes about React" -> search_notes with query="React"

Use get_help with topic="creating", "searching", "sharing", "comments", or "export" for detailed help.`;
            break;
            
          case 'creating':
            helpText = `# Creating Notes

## create_note Tool
Create a new sticky note attached to a specific element on a webpage.

### Required Parameters
- **url** - The full webpage URL
- **selector** - CSS selector for the target element

### Optional Parameters
- **content** - Note text (can include HTML)
- **theme** - Color: yellow, blue, green, or pink

### Examples

\`\`\`
Create a note on example.com:
- url: "https://example.com/page"
- selector: "h1"
- content: "Review this header"
- theme: "yellow"
\`\`\`

### Tips
- Use specific selectors like "#main-title" or ".article-content"
- Generic selectors like "body" work but notes may be less visible
- The note will appear next to the matched element`;
            break;
            
          case 'searching':
            helpText = `# Searching Notes

## search_notes Tool
Search your notes by content, URL, or selector.

### Parameters
- **query** (required) - Search text
- **limit** (optional) - Max results (default 50)

### What Gets Searched
- Note content
- Page URL
- CSS selector

### Examples
- Search for "TODO" to find task notes
- Search for "github.com" to find notes on GitHub
- Search for "#header" to find notes on header elements

## list_notes with Filters
For browsing without search:
- filter="owned" - Only your notes
- filter="shared" - Notes shared with you
- domain="github.com" - Notes on a specific domain`;
            break;
            
          case 'sharing':
            helpText = `# Sharing Notes

## share_note Tool
Share a note with another user by their email address.

### Parameters
- **id** - The note ID
- **email** - Recipient's email address

### How Sharing Works
1. Only note owners can share
2. Shared users can view and comment
3. Maximum 50 users per note

## unshare_note Tool
Remove someone from a shared note.

### Parameters
- **id** - The note ID
- **email** - Email to remove

## Finding Shared Notes
Use list_notes with filter="shared" to see notes others have shared with you.`;
            break;
            
          case 'comments':
            helpText = `# Comments

## add_comment Tool
Add a comment to any note you have access to.

### Parameters
- **noteId** - The note to comment on
- **content** - Your comment text
- **parentId** (optional) - Reply to another comment

### Notes on Replies
- Only one level of nesting allowed
- You can reply to top-level comments only

## list_note_comments Tool
Get all comments on a specific note.

### Parameters
- **noteId** - The note ID

## list_commented_notes Tool
Find all notes where you've left comments.

### Parameters
- **limit** (optional) - Max results`;
            break;
            
          case 'export':
            helpText = `# Exporting Notes

## export_notes Tool
Export all your notes as JSON.

### Parameters
- **includeComments** (optional) - Set to true to include comments

### Export Contents
- Note ID, URL, selector, content
- Theme and position
- Sharing information
- Timestamps
- Comments (if requested)

### Use Cases
- Backup your notes
- Migrate to another system
- Analyze your note-taking patterns
- Share bulk data`;
            break;
            
          default:
            helpText = 'Unknown topic. Use: overview, creating, searching, sharing, comments, or export';
        }
        
        return {
          content: [{ type: 'text', text: helpText }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// MCP Prompts - pre-defined workflows for common tasks
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'notes_summary',
        description: 'Get a complete summary of all your sticky notes',
        arguments: []
      },
      {
        name: 'organize_notes',
        description: 'Help organize your notes by grouping them by domain',
        arguments: []
      },
      {
        name: 'review_shared',
        description: 'Review all notes that have been shared with you',
        arguments: []
      },
      {
        name: 'find_note',
        description: 'Guided search to find a specific note',
        arguments: [
          {
            name: 'hint',
            description: 'What you remember about the note (optional)',
            required: false
          }
        ]
      },
      {
        name: 'cleanup_notes',
        description: 'Identify potentially stale or unused notes for cleanup',
        arguments: []
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'notes_summary':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Please give me a complete summary of my sticky notes. First get the statistics using get_note_stats, then list my notes organized by whether I own them or they were shared with me. Highlight any notes that were recently updated.'
            }
          }
        ]
      };
      
    case 'organize_notes':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Help me organize my sticky notes. First get my note stats to see what domains I have notes on, then list the notes and group them by domain/website. Suggest any notes that might be duplicates or could be consolidated.'
            }
          }
        ]
      };
      
    case 'review_shared':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Show me all the sticky notes that others have shared with me. Use list_notes with filter="shared". For each note, show who shared it (if available), what page it\'s on, and a preview of the content.'
            }
          }
        ]
      };
      
    case 'find_note':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: args?.hint 
                ? `Help me find a sticky note. Here's what I remember: "${args.hint}". Search for this and show me the best matches.`
                : 'Help me find a sticky note. Ask me what I remember about it (the website, content, or when I created it) and then search for it.'
            }
          }
        ]
      };
      
    case 'cleanup_notes':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Help me clean up my sticky notes. First get the stats, then list all notes and identify: 1) Notes with no content, 2) Notes that haven\'t been updated in a long time, 3) Notes on domains I rarely use. Ask me which ones I\'d like to delete.'
            }
          }
        ]
      };
      
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// MCP Resources - quick access to data
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'notes://stats',
        name: 'Note Statistics',
        description: 'Quick overview of your note counts and activity',
        mimeType: 'application/json'
      },
      {
        uri: 'notes://recent',
        name: 'Recent Notes',
        description: 'Your 10 most recently updated notes',
        mimeType: 'application/json'
      },
      {
        uri: 'notes://domains',
        name: 'Domains List',
        description: 'List of all domains where you have notes',
        mimeType: 'application/json'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  try {
    switch (uri) {
      case 'notes://stats': {
        const stats = await apiRequest('/notes/stats');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }
      
      case 'notes://recent': {
        const result = await apiRequest('/notes?limit=10');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result.notes, null, 2)
            }
          ]
        };
      }
      
      case 'notes://domains': {
        const stats = await apiRequest('/notes/stats');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                count: stats.domainCount,
                domains: stats.domains
              }, null, 2)
            }
          ]
        };
      }
      
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    throw new Error(`Failed to read resource ${uri}: ${error.message}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sticky Notes MCP server running');
}

main().catch(console.error);
