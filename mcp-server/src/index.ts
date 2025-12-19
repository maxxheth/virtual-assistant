#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VaultService } from './vault.js';
import { TaskManager } from './tasks.js';
import { CanvasGenerator } from './canvas.js';

// Get vault path from environment
const VAULT_PATH = process.env.VAULT_PATH || process.env.OBSIDIAN_VAULT_PATH || '';

if (!VAULT_PATH) {
    console.error('Error: VAULT_PATH environment variable is required');
    console.error('Set it to the path of your Obsidian vault');
    process.exit(1);
}

// Initialize services
const vaultService = new VaultService(VAULT_PATH);
const taskManager = new TaskManager(vaultService);
const canvasGenerator = new CanvasGenerator(vaultService);

// Create MCP server
const server = new McpServer({
    name: 'obsidian-virtual-assistant',
    version: '1.0.0',
});

// ===== Resource definitions =====
// NOTE: server.resource() is the correct API for @modelcontextprotocol/sdk v1.25.1
// Future versions may use registerResource() with a different signature

server.resource(
    'vault-notes',
    'obsidian://vault/notes',
    async (uri) => {
        const notes = await vaultService.listNotes();
        return {
            contents: [{
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify(notes, null, 2)
            }]
        };
    }
);

server.resource(
    'vault-tasks',
    'obsidian://vault/tasks',
    async (uri) => {
        const tasks = await taskManager.listTasks();
        return {
            contents: [{
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify(tasks, null, 2)
            }]
        };
    }
);

// ===== Tool definitions =====
// NOTE: server.tool() is the correct API for @modelcontextprotocol/sdk v1.25.1
// Future versions may use registerTool() with a different signature

// Read note tool
server.tool(
    'read_note',
    'Read the contents of a note from the Obsidian vault',
    {
        path: z.string().describe('Path to the note file, relative to vault root (e.g., "folder/note.md")')
    },
    async ({ path }) => {
        try {
            const content = await vaultService.readNote(path);
            return {
                content: [{
                    type: 'text',
                    text: content
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error reading note: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Search vault tool
server.tool(
    'search_vault',
    'Search for notes in the Obsidian vault by content or filename',
    {
        query: z.string().describe('Search query'),
        searchType: z.enum(['content', 'filename', 'both']).default('both').describe('Type of search to perform')
    },
    async ({ query, searchType }) => {
        try {
            const results = await vaultService.searchNotes(query, searchType);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(results, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error searching vault: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Create note tool
server.tool(
    'create_note',
    'Create a new note in the Obsidian vault',
    {
        path: z.string().describe('Path for the new note, relative to vault root (e.g., "folder/note.md")'),
        content: z.string().describe('Content of the note in Markdown format'),
        overwrite: z.boolean().default(false).describe('Whether to overwrite if file exists')
    },
    async ({ path, content, overwrite }) => {
        try {
            const result = await vaultService.createNote(path, content, overwrite);
            return {
                content: [{
                    type: 'text',
                    text: `Note created successfully at: ${result}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error creating note: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Update note tool
server.tool(
    'update_note',
    'Update an existing note in the Obsidian vault',
    {
        path: z.string().describe('Path to the note file'),
        content: z.string().describe('New content for the note'),
        append: z.boolean().default(false).describe('If true, append to existing content instead of replacing')
    },
    async ({ path, content, append }) => {
        try {
            await vaultService.updateNote(path, content, append);
            return {
                content: [{
                    type: 'text',
                    text: `Note updated successfully: ${path}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error updating note: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Create task note tool
server.tool(
    'create_task_note',
    'Create a structured task note with frontmatter and organized sections',
    {
        title: z.string().describe('Title of the task'),
        description: z.string().describe('Detailed description of the task'),
        priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Task priority'),
        dueDate: z.string().optional().describe('Due date in ISO format (e.g., "2024-12-25")'),
        tags: z.array(z.string()).default([]).describe('Tags for the task'),
        subtasks: z.array(z.string()).default([]).describe('List of subtasks'),
        folder: z.string().default('Tasks').describe('Folder to create the task in')
    },
    async ({ title, description, priority, dueDate, tags, subtasks, folder }) => {
        try {
            const result = await taskManager.createTask({
                title,
                description,
                priority,
                dueDate,
                tags,
                subtasks
            }, folder);
            return {
                content: [{
                    type: 'text',
                    text: `Task created successfully: ${result}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// List tasks tool
server.tool(
    'list_tasks',
    'List all task notes in the vault, optionally filtered by status or priority',
    {
        status: z.enum(['pending', 'in-progress', 'completed', 'all']).default('all').describe('Filter by task status'),
        priority: z.enum(['high', 'medium', 'low', 'all']).default('all').describe('Filter by priority'),
        folder: z.string().default('Tasks').describe('Folder to search for tasks')
    },
    async ({ status, priority, folder }) => {
        try {
            const tasks = await taskManager.listTasks({
                status: status === 'all' ? undefined : status,
                priority: priority === 'all' ? undefined : priority,
                folder
            });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(tasks, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Update task status tool
server.tool(
    'update_task_status',
    'Update the status of an existing task note',
    {
        path: z.string().describe('Path to the task note'),
        status: z.enum(['pending', 'in-progress', 'completed']).describe('New status for the task')
    },
    async ({ path, status }) => {
        try {
            await taskManager.updateTaskStatus(path, status);
            return {
                content: [{
                    type: 'text',
                    text: `Task status updated to "${status}": ${path}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Create canvas tool
server.tool(
    'create_canvas',
    'Create a JSON Canvas file with nodes and edges for visual organization',
    {
        name: z.string().describe('Name for the canvas file'),
        layoutType: z.enum(['taskboard', 'riskmatrix', 'mindmap', 'custom']).describe('Type of canvas layout'),
        description: z.string().describe('Description of what the canvas should contain'),
        folder: z.string().default('Canvas').describe('Folder to create the canvas in')
    },
    async ({ name, layoutType, description, folder }) => {
        try {
            const result = await canvasGenerator.createCanvas(name, layoutType, description, folder);
            return {
                content: [{
                    type: 'text',
                    text: `Canvas created successfully: ${result}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error creating canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// List folders tool
server.tool(
    'list_folders',
    'List all folders in the Obsidian vault',
    {},
    async () => {
        try {
            const folders = await vaultService.listFolders();
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(folders, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error listing folders: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// Get vault info tool
server.tool(
    'get_vault_info',
    'Get information about the Obsidian vault including stats and structure',
    {},
    async () => {
        try {
            const info = await vaultService.getVaultInfo();
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(info, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error getting vault info: ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }
);

// ===== Prompt definitions =====
// NOTE: server.prompt() is the correct API for @modelcontextprotocol/sdk v1.25.1
// Future versions may use registerPrompt() with a different signature

server.prompt(
    'task-from-notes',
    'Generate a task breakdown from selected notes',
    {
        notes: z.array(z.string()).describe('List of note paths to analyze')
    },
    async ({ notes }) => {
        const noteContents = await Promise.all(
            notes.map(async (path) => {
                try {
                    const content = await vaultService.readNote(path);
                    return `## ${path}\n\n${content}`;
                } catch {
                    return `## ${path}\n\n[Error reading note]`;
                }
            })
        );

        return {
            messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: `Based on the following notes, create a structured task breakdown with priorities and dependencies:\n\n${noteContents.join('\n\n---\n\n')}`
                }
            }]
        };
    }
);

server.prompt(
    'summarize-notes',
    'Summarize a collection of notes',
    {
        folder: z.string().describe('Folder path to summarize')
    },
    async ({ folder }) => {
        const notes = await vaultService.listNotes(folder);
        const summaries = await Promise.all(
            notes.slice(0, 10).map(async (note) => { // Limit to 10 notes
                try {
                    const content = await vaultService.readNote(note.path);
                    return `## ${note.name}\n\n${content.substring(0, 500)}...`;
                } catch {
                    return `## ${note.name}\n\n[Error reading note]`;
                }
            })
        );

        return {
            messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: `Please provide a comprehensive summary of the following notes from the "${folder}" folder:\n\n${summaries.join('\n\n---\n\n')}`
                }
            }]
        };
    }
);

// ===== Start the server =====

async function main() {
    console.error(`Starting Obsidian Virtual Assistant MCP Server`);
    console.error(`Vault path: ${VAULT_PATH}`);

    // Verify vault exists
    const vaultExists = await vaultService.verifyVault();
    if (!vaultExists) {
        console.error(`Error: Vault not found at ${VAULT_PATH}`);
        process.exit(1);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('MCP server running on stdio');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
