# Obsidian Virtual Assistant MCP Server

A Model Context Protocol (MCP) server that exposes your Obsidian vault for integration with LLM applications like Claude Desktop, Cursor, and other MCP-compatible tools.

## Features

### Tools

| Tool | Description |
|------|-------------|
| `read_note` | Read the contents of a note |
| `create_note` | Create a new note with content |
| `update_note` | Update or append to an existing note |
| `search_vault` | Search notes by content or filename |
| `create_task_note` | Create a structured task note |
| `list_tasks` | List task notes with filtering |
| `update_task_status` | Update a task's status |
| `create_canvas` | Generate a canvas file |
| `list_folders` | List all folders in the vault |
| `get_vault_info` | Get vault statistics |

### Resources

- `vault-notes`: List of all notes in the vault
- `vault-tasks`: List of all task notes

### Prompts

- `task-from-notes`: Generate task breakdown from notes
- `summarize-notes`: Summarize notes in a folder

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables

```bash
# Required: Path to your Obsidian vault
export VAULT_PATH=/path/to/your/obsidian/vault

# Alternative variable name also supported
export OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/.config/claude-desktop/claude_desktop_config.json` on Linux or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "VAULT_PATH": "/path/to/your/obsidian/vault"
      }
    }
  }
}
```

### Cursor Configuration

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "VAULT_PATH": "/path/to/your/obsidian/vault"
      }
    }
  }
}
```

## Usage Examples

### With Claude Desktop

Once configured, you can ask Claude to:

- "Read my meeting notes from yesterday"
- "Create a task for completing the project proposal"
- "Search my vault for anything related to Docker"
- "Create a mindmap canvas for our Q4 planning"
- "List all high-priority tasks"
- "Update the status of 'Review PR' task to completed"

### Testing with MCP Inspector

```bash
npm run inspect
```

This starts the MCP Inspector which provides a web interface for testing tools and resources.

## Docker Usage

### Build

```bash
docker build -t obsidian-va-mcp .
```

### Run

```bash
docker run -i \
  -e VAULT_PATH=/vault \
  -v /path/to/your/vault:/vault:ro \
  obsidian-va-mcp
```

## Development

### Watch Mode

```bash
npm run dev
```

### Testing

```bash
# Start the server
npm start

# In another terminal, use MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Security Considerations

1. **Read-Only Access**: Consider mounting the vault as read-only (`:ro`) if you only need read operations
2. **Path Traversal**: The server validates all paths to prevent accessing files outside the vault
3. **Non-Root User**: The Docker image runs as a non-root user

## License

MIT
