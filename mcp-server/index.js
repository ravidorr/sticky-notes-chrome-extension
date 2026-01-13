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
} from '@modelcontextprotocol/sdk/types.js';
import process from 'process';

const API_BASE_URL = process.env.STICKY_NOTES_API_URL || 
  'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';
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
      ...options.headers,
    },
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
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_notes',
        description: 'List all sticky notes, optionally filtered by URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Filter notes by URL (optional)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 50)',
            },
          },
        },
      },
      {
        name: 'get_note',
        description: 'Get a specific note by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_note',
        description: 'Create a new sticky note on a webpage',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The webpage URL where the note should appear',
            },
            selector: {
              type: 'string',
              description: 'CSS selector for the element to attach the note to (e.g., "h1", "#main", ".header")',
            },
            content: {
              type: 'string',
              description: 'The note content (can include HTML)',
            },
            theme: {
              type: 'string',
              enum: ['yellow', 'blue', 'green', 'pink'],
              description: 'Note color theme (default: yellow)',
            },
          },
          required: ['url', 'selector'],
        },
      },
      {
        name: 'update_note',
        description: 'Update an existing note',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID',
            },
            content: {
              type: 'string',
              description: 'New note content',
            },
            theme: {
              type: 'string',
              enum: ['yellow', 'blue', 'green', 'pink'],
              description: 'New color theme',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID to delete',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'search_notes',
        description: 'Search notes by content, URL, or selector',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 50)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'share_note',
        description: 'Share a note with another user by email',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The note ID',
            },
            email: {
              type: 'string',
              description: 'Email address to share with',
            },
          },
          required: ['id', 'email'],
        },
      },
      {
        name: 'export_notes',
        description: 'Export all notes as JSON',
        inputSchema: {
          type: 'object',
          properties: {
            includeComments: {
              type: 'boolean',
              description: 'Include comments in export (default: false)',
            },
          },
        },
      },
      {
        name: 'show_notes_panel',
        description: 'Get a formatted display of notes for a URL. Returns nicely formatted markdown instead of raw JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to show notes for',
            },
          },
          required: ['url'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_notes': {
        const params = new URLSearchParams();
        if (args?.url) params.set('url', args.url);
        if (args?.limit) params.set('limit', args.limit.toString());
        const queryString = params.toString();
        const endpoint = queryString ? `/notes?${queryString}` : '/notes';
        const result = await apiRequest(endpoint);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_note': {
        const result = await apiRequest(`/notes/${args.id}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'create_note': {
        const result = await apiRequest('/notes', {
          method: 'POST',
          body: JSON.stringify({
            url: args.url,
            selector: args.selector,
            content: args.content || '',
            theme: args.theme || 'yellow',
          }),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note created successfully!\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'update_note': {
        const updates = {};
        if (args.content !== undefined) updates.content = args.content;
        if (args.theme !== undefined) updates.theme = args.theme;
        
        const result = await apiRequest(`/notes/${args.id}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note updated!\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'delete_note': {
        await apiRequest(`/notes/${args.id}`, { method: 'DELETE' });
        return {
          content: [
            {
              type: 'text',
              text: `Note ${args.id} deleted successfully.`,
            },
          ],
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
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'share_note': {
        const result = await apiRequest(`/notes/${args.id}/share`, {
          method: 'POST',
          body: JSON.stringify({ email: args.email }),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Note shared with ${args.email}!\n${JSON.stringify(result, null, 2)}`,
            },
          ],
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
              text: JSON.stringify(result, null, 2),
            },
          ],
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
          markdown += `\n**Panel URL:** http://localhost:3002?url=${encodeURIComponent(args.url)}`;
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
              text: markdown,
            },
          ],
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
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sticky Notes MCP server running');
}

main().catch(console.error);
