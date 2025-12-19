# Obsidian Virtual Assistant

An AI-powered virtual assistant plugin for [Obsidian](https://obsidian.md) that integrates with Google AI Studio (Gemini) for intelligent task management, canvas visualization, and a ChatGPT-like chat interface. Includes an MCP server for integration with external LLM tools.

![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0+-7c3aed?style=flat-square&logo=obsidian)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## ✨ Features

### 📝 Intelligent Task Creation
Create well-organized task notes with AI assistance:
- Structured markdown templates with frontmatter
- Automatic priority and deadline extraction
- Subtask generation
- Tag suggestions

### 🎨 Canvas Generation
Generate visual canvases for planning and organization:
- **Task Board**: Kanban-style project boards
- **Risk Matrix**: 2D risk assessment grids
- **Mind Maps**: Radial brainstorming layouts
- **Personnel Maps**: Organizational charts

### 💬 Chat Sidebar
A ChatGPT-like interface right inside Obsidian:
- Streaming responses from Gemini
- Context-aware (includes active note)
- Conversation history
- Quick actions for common tasks

### 🔌 MCP Server
Expose your vault to external LLM tools:
- Works with Claude Desktop, Cursor, and more
- Read, create, and search notes
- Manage tasks programmatically
- Generate canvases via API

## 🚀 Installation

### From Source

1. Clone this repository into your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/maxx/obsidian-virtual-assistant virtual-assistant
   cd virtual-assistant
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian:
   - Open Settings → Community plugins
   - Toggle "Virtual Assistant" on

### Using Docker (Development)

```bash
# Start development environment with hot reload
docker compose up dev

# Build production plugin
docker compose up build
```

## ⚙️ Configuration

### API Key Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/)
2. Open Obsidian Settings → Virtual Assistant
3. Paste your API key and test the connection

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Gemini API Key** | Your Google AI Studio API key | - |
| **Default Model** | Gemini model to use | gemini-1.5-flash |
| **Task Folder** | Where to save task notes | Tasks |
| **Canvas Folder** | Where to save canvases | Canvas |
| **Chat History** | Remember conversations | Enabled |
| **Include Context** | Use active note as context | Enabled |

## 📖 Usage

### Commands

Access via Command Palette (Ctrl/Cmd + P):

| Command | Description |
|---------|-------------|
| `Open chat sidebar` | Open the AI chat interface |
| `Create task from selection` | Generate task from selected text |
| `Create quick task` | Open quick task creation modal |
| `Create canvas from selection` | Generate canvas from selected text |
| `Generate taskboard` | Create a task board canvas |
| `Generate risk matrix` | Create a risk matrix canvas |
| `Generate mind map` | Create a mind map canvas |

### Chat Commands

In the chat sidebar, you can:

```
Create a task for: Review the Q4 budget proposal by Friday

Create a canvas for: Sprint planning with user auth, payment integration, and testing phases
```

### Keyboard Shortcuts

You can assign custom hotkeys in Settings → Hotkeys.

## 🔌 MCP Server

The MCP server allows Claude Desktop, Cursor, and other tools to interact with your vault.

### Setup

```bash
cd mcp-server
npm install
npm run build
```

### Claude Desktop Configuration

Add to `~/.config/claude-desktop/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/virtual-assistant/mcp-server/dist/index.js"],
      "env": {
        "VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

### Available Tools

- `read_note` - Read note contents
- `create_note` - Create new notes
- `search_vault` - Search by content/filename
- `create_task_note` - Create structured tasks
- `list_tasks` - List and filter tasks
- `create_canvas` - Generate canvases
- `get_vault_info` - Vault statistics

## 🏗️ Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Obsidian 1.4.0+

### Setup

```bash
# Clone and install
git clone https://github.com/maxx/obsidian-virtual-assistant
cd obsidian-virtual-assistant
npm install

# Development with hot reload
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### Project Structure

```
virtual-assistant/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings interface
│   ├── services/
│   │   ├── gemini.ts        # Gemini API wrapper
│   │   ├── tasks.ts         # Task management
│   │   └── canvas.ts        # Canvas generation
│   ├── views/
│   │   └── ChatSidebarView.ts  # Chat interface
│   └── styles.css           # Plugin styles
├── mcp-server/              # MCP server package
│   ├── src/
│   │   ├── index.ts         # Server entry
│   │   ├── vault.ts         # Vault operations
│   │   ├── tasks.ts         # Task management
│   │   └── canvas.ts        # Canvas generation
│   └── package.json
├── manifest.json
├── package.json
└── docker-compose.yml
```

## 🐳 Docker

### Development

```bash
# Start development environment
docker compose up dev

# Watch mode with volume mounts
docker compose up dev -d
docker compose logs -f dev
```

### Production Build

```bash
# Build production artifacts
docker compose up build

# Output: main.js, manifest.json, styles.css
```

### MCP Server

```bash
# Build and run MCP server
docker compose up mcp-server
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Obsidian](https://obsidian.md) for the amazing note-taking platform
- [Google AI Studio](https://aistudio.google.com) for the Gemini API
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [JSON Canvas](https://jsoncanvas.org) for the canvas format specification

---

Made with ❤️ for the Obsidian community
