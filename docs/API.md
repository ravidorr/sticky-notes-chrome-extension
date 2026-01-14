# Sticky Notes REST API

The Sticky Notes API allows you to programmatically create, read, update, and delete notes from external applications.

## Base URL

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

Replace `YOUR_PROJECT_ID` with your Firebase project ID.

## Authentication

The API uses two authentication methods:

### 1. API Keys (for notes operations)

API keys are used for all notes-related operations. Include the key in the `Authorization` header:

```
Authorization: Bearer sk_live_abc123...
```

### 2. Firebase ID Tokens (for key management)

To generate or manage API keys, use a Firebase ID token:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

You can obtain a Firebase ID token by signing in with the Chrome extension or using the Firebase Auth SDK.

---

## API Keys Management

### Generate an API Key

Create a new API key for your account.

```http
POST /keys
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "My Integration",
  "scopes": ["notes:read", "notes:write"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | A friendly name for the key (max 100 chars) |
| `scopes` | string[] | No | Permissions: `notes:read`, `notes:write`. Defaults to both. |

**Response (201 Created):**

```json
{
  "id": "abc123",
  "key": "sk_live_a1b2c3d4e5f6...",
  "name": "My Integration",
  "keyPrefix": "sk_live_a1b2c3d4",
  "scopes": ["notes:read", "notes:write"],
  "isActive": true,
  "createdAt": "2025-01-13T10:00:00.000Z",
  "warning": "Store this key securely. It will not be shown again."
}
```

**Important:** The full API key is only shown once at creation time. Store it securely.

### List API Keys

List all API keys for your account.

```http
GET /keys
Authorization: Bearer <firebase-id-token>
```

**Response (200 OK):**

```json
{
  "keys": [
    {
      "id": "abc123",
      "name": "My Integration",
      "keyPrefix": "sk_live_a1b2c3d4",
      "scopes": ["notes:read", "notes:write"],
      "isActive": true,
      "createdAt": "2025-01-13T10:00:00.000Z",
      "lastUsedAt": "2025-01-13T12:30:00.000Z"
    }
  ]
}
```

### Revoke an API Key

Permanently deactivate an API key.

```http
DELETE /keys/:keyId
Authorization: Bearer <firebase-id-token>
```

**Response:** `204 No Content`

### Update an API Key

Update the name or scopes of an API key.

```http
PATCH /keys/:keyId
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Updated Name",
  "scopes": ["notes:read"]
}
```

**Response (200 OK):** Returns the updated key object.

---

## Notes

### List Notes

Get all notes for your account with flexible filtering options.

```http
GET /notes
Authorization: Bearer sk_live_...
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | string | Filter by ownership: `owned` (your notes), `shared` (shared with you), `all` (default) |
| `url` | string | Filter notes by exact URL |
| `domain` | string | Filter notes by domain (e.g., `example.com`) |
| `limit` | number | Max results (default: 50, max: 100) |
| `offset` | number | Pagination offset (default: 0) |

**Examples:**

```bash
# Get all notes
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes" \
  -H "Authorization: Bearer sk_live_..."

# Get only notes you own
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes?filter=owned" \
  -H "Authorization: Bearer sk_live_..."

# Get notes shared with you
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes?filter=shared" \
  -H "Authorization: Bearer sk_live_..."

# Get notes for a specific domain
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes?domain=github.com" \
  -H "Authorization: Bearer sk_live_..."
```

**Response (200 OK):**

```json
{
  "notes": [
    {
      "id": "note123",
      "url": "https://example.com/page",
      "selector": "#main-content",
      "content": "<p>Remember to check this section</p>",
      "theme": "yellow",
      "position": { "anchor": "top-right" },
      "metadata": null,
      "sharedWith": [],
      "isShared": false,
      "createdAt": "2025-01-13T10:00:00.000Z",
      "updatedAt": "2025-01-13T10:00:00.000Z"
    }
  ],
  "filter": "all",
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Get a Note

Retrieve a specific note by ID.

```http
GET /notes/:id
Authorization: Bearer sk_live_...
```

**Response (200 OK):**

```json
{
  "id": "note123",
  "url": "https://example.com/page",
  "selector": "#main-content",
  "content": "<p>Remember to check this section</p>",
  "theme": "yellow",
  "position": { "anchor": "top-right" },
  "metadata": null,
  "sharedWith": [],
  "createdAt": "2025-01-13T10:00:00.000Z",
  "updatedAt": "2025-01-13T10:00:00.000Z"
}
```

### Create a Note

Create a new sticky note.

```http
POST /notes
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "url": "https://example.com/page",
  "selector": "#main-content",
  "content": "<p>This is my note</p>",
  "theme": "yellow",
  "position": { "anchor": "top-right" },
  "metadata": {
    "source": "api",
    "custom_field": "value"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The page URL where the note should appear |
| `selector` | string | Yes | CSS selector for the target element |
| `content` | string | No | HTML content of the note |
| `theme` | string | No | Color theme: `yellow`, `blue`, `green`, `pink` |
| `position` | object | No | Position relative to element |
| `metadata` | object | No | Custom metadata (stored but not processed) |

**Response (201 Created):**

```json
{
  "id": "note456",
  "url": "https://example.com/page",
  "selector": "#main-content",
  "content": "<p>This is my note</p>",
  "theme": "yellow",
  "position": { "anchor": "top-right" },
  "metadata": { "source": "api" },
  "sharedWith": [],
  "createdAt": "2025-01-13T10:00:00.000Z",
  "updatedAt": "2025-01-13T10:00:00.000Z"
}
```

**Example with curl:**

```bash
curl -X POST "https://us-central1-PROJECT.cloudfunctions.net/api/notes" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/page",
    "selector": "#main-content",
    "content": "Remember to review this section",
    "theme": "yellow"
  }'
```

### Update a Note

Update an existing note.

```http
PUT /notes/:id
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "content": "<p>Updated content</p>",
  "theme": "blue"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | New note content |
| `theme` | string | New color theme |
| `position` | object | New position |
| `selector` | string | New CSS selector |

**Response (200 OK):** Returns the updated note object.

### Delete a Note

Permanently delete a note.

```http
DELETE /notes/:id
Authorization: Bearer sk_live_...
```

**Response:** `204 No Content`

---

## Rate Limiting

The API enforces rate limits per API key:

- **100 requests per minute** per API key

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704110400
```

When the limit is exceeded, the API returns `429 Too Many Requests`:

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again later.",
  "retryAfter": 45
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description",
  "details": ["Optional array of specific issues"]
}
```

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Valid key but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

---

## Scopes

API keys can be scoped to limit their permissions:

| Scope | Description |
|-------|-------------|
| `notes:read` | Read notes (GET operations) |
| `notes:write` | Create, update, delete notes |

Example: A read-only integration key:

```json
{
  "name": "Dashboard Reader",
  "scopes": ["notes:read"]
}
```

---

## Examples

### Python

```python
import requests

API_KEY = "sk_live_..."
BASE_URL = "https://us-central1-PROJECT.cloudfunctions.net/api"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Create a note
response = requests.post(
    f"{BASE_URL}/notes",
    headers=headers,
    json={
        "url": "https://example.com/page",
        "selector": "#main-content",
        "content": "API-created note",
        "theme": "blue"
    }
)
note = response.json()
print(f"Created note: {note['id']}")

# List notes
response = requests.get(f"{BASE_URL}/notes", headers=headers)
notes = response.json()["notes"]
print(f"Found {len(notes)} notes")
```

### JavaScript/Node.js

```javascript
const API_KEY = 'sk_live_...';
const BASE_URL = 'https://us-central1-PROJECT.cloudfunctions.net/api';

// Create a note
async function createNote() {
  const response = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: 'https://example.com/page',
      selector: '#main-content',
      content: 'API-created note',
      theme: 'green'
    })
  });
  
  const note = await response.json();
  console.log('Created note:', note.id);
}

// List notes for a URL
async function getNotes(url) {
  const response = await fetch(
    `${BASE_URL}/notes?url=${encodeURIComponent(url)}`,
    {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    }
  );
  
  const data = await response.json();
  return data.notes;
}
```

### cURL

```bash
# Generate an API key (using Firebase ID token)
curl -X POST "https://us-central1-PROJECT.cloudfunctions.net/api/keys" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Script", "scopes": ["notes:read", "notes:write"]}'

# Create a note
curl -X POST "https://us-central1-PROJECT.cloudfunctions.net/api/notes" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "selector": "body",
    "content": "Hello from the API!"
  }'

# List all notes
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes" \
  -H "Authorization: Bearer sk_live_..."

# Get notes for a specific URL
curl "https://us-central1-PROJECT.cloudfunctions.net/api/notes?url=https://example.com" \
  -H "Authorization: Bearer sk_live_..."

# Delete a note
curl -X DELETE "https://us-central1-PROJECT.cloudfunctions.net/api/notes/note123" \
  -H "Authorization: Bearer sk_live_..."
```

---

## Sharing

### Share a Note

Share a note with another user by email.

```http
POST /notes/:id/share
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "colleague@example.com"
}
```

**Response (200 OK):**

```json
{
  "message": "Note shared successfully",
  "sharedWith": ["colleague@example.com"]
}
```

### Unshare a Note

Remove a user from a note's shared list.

```http
DELETE /notes/:id/share/:email
Authorization: Bearer sk_live_...
```

**Response (200 OK):**

```json
{
  "message": "User removed from shared list",
  "sharedWith": []
}
```

---

## Comments

### List Comments

Get all comments on a note.

```http
GET /notes/:noteId/comments
Authorization: Bearer sk_live_...
```

**Response (200 OK):**

```json
{
  "comments": [
    {
      "id": "comment123",
      "authorId": "user123",
      "authorName": "John Doe",
      "content": "Great observation!",
      "parentId": null,
      "createdAt": "2025-01-13T10:00:00.000Z",
      "updatedAt": "2025-01-13T10:00:00.000Z"
    }
  ]
}
```

### Add a Comment

```http
POST /notes/:noteId/comments
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "content": "This is my comment",
  "parentId": null
}
```

Set `parentId` to another comment's ID to create a reply (max 1 level of nesting).

**Response (201 Created):**

```json
{
  "id": "comment456",
  "authorId": "user123",
  "authorName": "API User",
  "content": "This is my comment",
  "parentId": null,
  "createdAt": "2025-01-13T10:00:00.000Z",
  "updatedAt": "2025-01-13T10:00:00.000Z"
}
```

### Update a Comment

Only the author can update their comment.

```http
PUT /notes/:noteId/comments/:commentId
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "content": "Updated comment text"
}
```

### Delete a Comment

Comment author or note owner can delete comments.

```http
DELETE /notes/:noteId/comments/:commentId
Authorization: Bearer sk_live_...
```

**Response:** `204 No Content`

---

## Bulk Operations

### Bulk Create Notes

Create multiple notes in a single request (max 50).

```http
POST /notes/bulk
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "notes": [
    {
      "url": "https://example.com/page1",
      "selector": "h1",
      "content": "Note 1",
      "theme": "yellow"
    },
    {
      "url": "https://example.com/page2",
      "selector": ".main",
      "content": "Note 2",
      "theme": "blue"
    }
  ]
}
```

**Response (201 Created):**

```json
{
  "message": "Successfully created 2 notes",
  "notes": [
    { "id": "note1", "url": "...", "selector": "...", "content": "...", "theme": "..." },
    { "id": "note2", "url": "...", "selector": "...", "content": "...", "theme": "..." }
  ]
}
```

### Bulk Delete Notes

Delete multiple notes in a single request (max 50).

```http
DELETE /notes/bulk
Authorization: Bearer sk_live_...
Content-Type: application/json
```

**Request Body:**

```json
{
  "ids": ["note123", "note456", "note789"]
}
```

**Response (200 OK):**

```json
{
  "message": "Deleted 3 notes",
  "deleted": ["note123", "note456", "note789"],
  "errors": []
}
```

---

## Search

Search notes by content, URL, or selector.

```http
GET /notes/search?q=keyword&limit=50
Authorization: Bearer sk_live_...
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `limit` | number | Max results (default: 50, max: 100) |

**Response (200 OK):**

```json
{
  "query": "keyword",
  "total": 5,
  "results": [
    {
      "id": "note123",
      "url": "https://example.com",
      "selector": "h1",
      "content": "Contains keyword here",
      "theme": "yellow",
      "matchedIn": ["content"],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## Statistics

Get statistics about your notes.

```http
GET /notes/stats
Authorization: Bearer sk_live_...
```

**Response (200 OK):**

```json
{
  "total": 42,
  "owned": 35,
  "shared": 7,
  "byTheme": {
    "yellow": 20,
    "blue": 10,
    "green": 8,
    "pink": 4
  },
  "domainCount": 12,
  "domains": ["github.com", "stackoverflow.com", "docs.google.com"],
  "recentlyUpdated": 5
}
```

| Field | Description |
|-------|-------------|
| `total` | Total notes (owned + shared) |
| `owned` | Notes you created |
| `shared` | Notes shared with you by others |
| `byTheme` | Breakdown by color theme |
| `domainCount` | Number of unique domains |
| `domains` | List of domains (up to 20) |
| `recentlyUpdated` | Notes updated in last 7 days |

---

## Commented Notes

Get all notes where you have written at least one comment.

```http
GET /notes/commented
Authorization: Bearer sk_live_...
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50, max: 100) |
| `offset` | number | Pagination offset (default: 0) |

**Response (200 OK):**

```json
{
  "notes": [
    {
      "id": "note123",
      "url": "https://example.com/page",
      "selector": "#main-content",
      "content": "Note content here",
      "theme": "yellow",
      "isShared": false,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "totalCommentedNotes": 15,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## Export

Export all your notes as JSON.

```http
GET /notes/export?includeComments=true
Authorization: Bearer sk_live_...
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeComments` | boolean | Include comments in export (default: false) |

**Response (200 OK):**

The response includes a `Content-Disposition` header for downloading.

```json
{
  "exportedAt": "2025-01-13T10:00:00.000Z",
  "noteCount": 25,
  "notes": [
    {
      "id": "note123",
      "url": "https://example.com",
      "selector": "h1",
      "content": "Note content",
      "theme": "yellow",
      "position": { "anchor": "top-right" },
      "metadata": null,
      "sharedWith": [],
      "createdAt": "...",
      "updatedAt": "...",
      "comments": [
        {
          "id": "comment1",
          "authorName": "John",
          "content": "A comment",
          "parentId": null,
          "createdAt": "..."
        }
      ]
    }
  ]
}
```

---

## Deployment

To deploy the API to your Firebase project:

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize your project (if not already done):
   ```bash
   firebase init functions
   ```

4. Install dependencies:
   ```bash
   cd functions && npm install
   ```

5. Deploy:
   ```bash
   firebase deploy --only functions
   ```

The API URL will be displayed after deployment:
```
Function URL (api): https://us-central1-YOUR_PROJECT.cloudfunctions.net/api
```
